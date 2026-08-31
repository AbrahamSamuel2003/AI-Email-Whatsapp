import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { encryptToken } from '../services/crypto/encryption.js';

class MockWhatsAppSpy {
  public sentMessages: { to: string; body: string }[] = [];

  async sendTextMessage(to: string, body: string) {
    this.sentMessages.push({ to, body });
    return { messageId: `msg-${Date.now()}` };
  }

  async sendInteractiveMessage(to: string, body: string, _buttons: any[]) {
    this.sentMessages.push({ to, body });
    return { messageId: `msg-${Date.now()}` };
  }
}

test('Multi-Mailbox Management & WhatsApp Switcher - Test Suite', async (t) => {
  const testPhone = '+919999911111';
  const mail1 = 'personal@gmail.com';
  const mail2 = 'ceo@ss40network.com';
  const mail3 = 'support@ss40network.com';

  // Cleanup prior test artifacts
  await prisma.outboundEmail.deleteMany({ where: { emailAccount: { emailAddress: { in: [mail1, mail2, mail3] } } } });
  await prisma.emailMessage.deleteMany({ where: { thread: { emailAccount: { emailAddress: { in: [mail1, mail2, mail3] } } } } });
  await prisma.emailThread.deleteMany({ where: { emailAccount: { emailAddress: { in: [mail1, mail2, mail3] } } } });
  await prisma.emailAccount.deleteMany({ where: { emailAddress: { in: [mail1, mail2, mail3] } } });
  await prisma.whatsappSession.deleteMany({ where: { whatsappNumber: testPhone } });
  await prisma.user.deleteMany({ where: { whatsappNumber: testPhone } });

  // 1. Create a user with 3 linked mailboxes
  const user = await prisma.user.create({
    data: {
      name: 'Samdani Executive',
      email: mail1,
      whatsappNumber: testPhone,
    },
  });

  const acc1 = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'GMAIL',
      emailAddress: mail1,
      encryptedAccessToken: encryptToken('test-token-1'),
    },
  });

  const acc2 = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'IMAP_SMTP',
      emailAddress: mail2,
      imapHost: 'imap.zoho.in',
      smtpHost: 'smtp.zoho.in',
      encryptedPassword: encryptToken('test-pass-2'),
    },
  });

  const acc3 = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'IMAP_SMTP',
      emailAddress: mail3,
      imapHost: 'imap.zoho.in',
      smtpHost: 'smtp.zoho.in',
      encryptedPassword: encryptToken('test-pass-3'),
    },
  });

  const spy = new MockWhatsAppSpy();

  await t.test('1. SWITCH / ACCOUNTS displays numbered multi-mailbox menu', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'SWITCH' } as any,
      spy as any
    );

    assert.equal(res.action, 'IGNORED');
    const lastMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(lastMsg.body.includes('1️⃣ personal@gmail.com'));
    assert.ok(lastMsg.body.includes('2️⃣ ceo@ss40network.com'));
    assert.ok(lastMsg.body.includes('3️⃣ support@ss40network.com'));

    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.isSelectingMailbox, true);
  });

  await t.test('2. Replying "2" selects and activates Mailbox #2 (ceo@ss40network.com)', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: '2' } as any,
      spy as any
    );

    assert.equal(res.action, 'IGNORED');
    const lastMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(lastMsg.body.includes('Active Mailbox Selected'));
    assert.ok(lastMsg.body.includes('ceo@ss40network.com'));

    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.activeEmailAccountId, acc2.id);
    assert.equal(session?.isSelectingMailbox, false);
  });

  await t.test('3. CHECK MAIL scans the selected active mailbox (ceo@ss40network.com)', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'CHECK MAIL' } as any,
      spy as any
    );

    assert.equal(res.action, 'IGNORED');
    const sent = spy.sentMessages.filter((m) => m.body.includes('ceo@ss40network.com'));
    assert.ok(sent.length > 0, 'Should mention the active mailbox in scanning/status');
  });

  await t.test('4. CANCEL discards draft without deleting or disconnecting any mailbox', async () => {
    // Put session into NOTIFIED state with a dummy thread
    const thread = await prisma.emailThread.create({
      data: {
        emailAccountId: acc2.id,
        externalThreadId: 'th-test-99',
        subject: 'Partnership Agreement',
      },
    });

    const msg = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        externalMessageId: 'msg-ext-99',
        senderEmail: 'client@partner.com',
        recipientEmail: mail2,
        subject: 'Partnership Agreement',
        cleanBody: 'Please review the agreement.',
        isImportant: true,
        actionRequired: 'Confirm contract terms',
      },
    });

    await prisma.whatsappSession.update({
      where: { userId: user.id },
      data: {
        state: 'NOTIFIED',
        activeThreadId: thread.id,
        activeMessageId: msg.id,
      },
    });

    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'CANCEL' } as any,
      spy as any
    );

    assert.equal(res.action, 'SESSION_RESET');
    const lastMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(lastMsg.body.includes('SESSION CANCELLED'));

    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.state, 'IDLE');
    assert.equal(session?.activeMessageId, null);

    // Verify all 3 mailboxes STILL exist and remain connected
    const remainingAccounts = await prisma.emailAccount.findMany({ where: { userId: user.id } });
    assert.equal(remainingAccounts.length, 3);
  });

  // Cleanup
  await prisma.emailMessage.deleteMany({ where: { thread: { emailAccountId: { in: [acc1.id, acc2.id, acc3.id] } } } });
  await prisma.emailThread.deleteMany({ where: { emailAccountId: { in: [acc1.id, acc2.id, acc3.id] } } });
  await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
  await prisma.whatsappSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});
