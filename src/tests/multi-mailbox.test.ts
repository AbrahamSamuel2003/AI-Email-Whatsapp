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
    assert.ok(lastMsg.body.includes('1. personal@gmail.com'));
    assert.ok(lastMsg.body.includes('2. ceo@ss40network.com'));
    assert.ok(lastMsg.body.includes('3. support@ss40network.com'));

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
    assert.ok(lastMsg.body.toUpperCase().includes('ACTIVE MAILBOX SELECTED'));
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

  await t.test('5. Numbered email selection is strictly scoped to active mailbox', async () => {
    // Ensure Mailbox #1 (acc1) is active
    await prisma.whatsappSession.update({
      where: { userId: user.id },
      data: {
        activeEmailAccountId: acc1.id,
        isSelectingMailbox: false,
        state: 'IDLE',
      },
    });

    // Create 2 emails in Mailbox 1 (acc1)
    const thread1 = await prisma.emailThread.create({
      data: {
        emailAccountId: acc1.id,
        externalThreadId: 'thread-acc1-list',
        subject: 'Thread Acc 1',
      },
    });

    const m1_1 = await prisma.emailMessage.create({
      data: {
        threadId: thread1.id,
        externalMessageId: 'ext-m1-1',
        senderEmail: 'prof@college.edu',
        recipientEmail: mail1,
        subject: 'come to class',
        cleanBody: 'Please come to class today at 10 AM.',
        isImportant: true,
        actionRequired: 'Attend class',
        receivedAt: new Date(Date.now() - 20000),
      },
    });

    const m1_2 = await prisma.emailMessage.create({
      data: {
        threadId: thread1.id,
        externalMessageId: 'ext-m1-2',
        senderEmail: 'colleague@work.com',
        recipientEmail: mail1,
        subject: 'sample document review',
        cleanBody: 'Here is the sample document.',
        isImportant: true,
        actionRequired: 'Review document',
        receivedAt: new Date(Date.now() - 30000),
      },
    });

    // Create a more recent unreplied email in Mailbox 2 (acc2)
    const thread2 = await prisma.emailThread.create({
      data: {
        emailAccountId: acc2.id,
        externalThreadId: 'thread-acc2-emergency',
        subject: 'Thread Acc 2',
      },
    });

    const m2_emergency = await prisma.emailMessage.create({
      data: {
        threadId: thread2.id,
        externalMessageId: 'ext-m2-emergency',
        senderEmail: 'admin@alert.com',
        recipientEmail: mail2,
        subject: 'emergency server issue',
        cleanBody: 'Emergency issue requires response.',
        isImportant: true,
        actionRequired: 'Urgent response',
        receivedAt: new Date(Date.now() - 1000), // Most recent overall
      },
    });

    // User types "2" while Mailbox 1 is active -> MUST open m1_2 ("sample document review"), NOT m2_emergency!
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: '2' } as any,
      spy as any
    );

    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.activeMessageId, m1_2.id); // Strictly selects email #2 from Mailbox 1!
    assert.notEqual(session?.activeMessageId, m2_emergency.id);

    const lastMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(lastMsg.body.includes('sample document review'));
  });

  await t.test('6. Ingestion Pipeline marks ALERT_ONLY emails with actionRequired: null', async () => {
    const { EmailIngestionPipeline } = await import('../services/email/ingestion-pipeline.js');

    const alertEmail = {
      externalMessageId: 'alert-msg-otp-101',
      externalThreadId: 'thread-otp-101',
      senderEmail: 'no-reply@google.com',
      senderName: 'Google Security',
      recipientEmail: mail1,
      subject: 'Security Alert: 2-Step Verification Code',
      cleanBody: 'Your Google verification code is G-938210. Do not share it with anyone.',
      rawSnippet: 'Your Google verification code is G-938210',
      receivedAt: new Date(),
    };

    await EmailIngestionPipeline.processIncomingEmail(alertEmail as any, user.id, true);

    const savedMsg = await prisma.emailMessage.findFirst({
      where: { externalMessageId: 'alert-msg-otp-101' },
    });

    assert.ok(savedMsg);
    assert.equal(savedMsg.isImportant, true);
    assert.equal(savedMsg.actionRequired, null); // Strictly null so it NEVER enters reply queue!
  });

  // Cleanup
  await prisma.emailMessage.deleteMany({ where: { thread: { emailAccountId: { in: [acc1.id, acc2.id, acc3.id] } } } });
  await prisma.emailThread.deleteMany({ where: { emailAccountId: { in: [acc1.id, acc2.id, acc3.id] } } });
  await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
  await prisma.whatsappSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});
