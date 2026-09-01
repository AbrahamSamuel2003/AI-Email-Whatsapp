import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { encryptToken } from '../services/crypto/encryption.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { SessionManager } from '../services/state/session-manager.js';
import { IWhatsAppProvider, WhatsAppSendResult } from '../services/whatsapp/whatsapp.interface.js';

class MockWhatsAppSpy implements IWhatsAppProvider {
  sentMessages: { to: string; body: string }[] = [];

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, body });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  async sendInteractiveMessage(to: string, body: string, _buttons: any[]): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, body });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  parseInboundWebhook(_body: any) {
    return null;
  }

  getLastMessage() {
    return this.sentMessages[this.sentMessages.length - 1];
  }
}

test('Tiered Assistant Modes: Standard (Minimalist) vs Executive Pro', async (t) => {
  const waMock = new MockWhatsAppSpy();
  const testPhone = '+919888877777';
  const testEmail1 = 'ceo.standard@ss40network.com';
  const testEmail2 = 'founder.pro@ss40network.com';

  // 0. Clean database residue
  await prisma.outboundEmail.deleteMany({ where: { toEmail: 'client@acme.com' } }).catch(() => {});
  await prisma.emailMessage.deleteMany({ where: { recipientEmail: { in: [testEmail1, testEmail2] } } }).catch(() => {});
  await prisma.emailThread.deleteMany({ where: { emailAccount: { emailAddress: { in: [testEmail1, testEmail2] } } } }).catch(() => {});
  await prisma.emailAccount.deleteMany({ where: { emailAddress: { in: [testEmail1, testEmail2] } } }).catch(() => {});
  await prisma.whatsappSession.deleteMany({ where: { whatsappNumber: testPhone } }).catch(() => {});
  await prisma.user.deleteMany({ where: { whatsappNumber: testPhone } }).catch(() => {});

  // 1. Setup User in STANDARD Mode
  const user = await prisma.user.create({
    data: {
      name: 'Abraham Samuel',
      email: testEmail1,
      whatsappNumber: testPhone,
      preferredLanguage: 'ENGLISH',
      mode: 'STANDARD',
      emailAccounts: {
        create: [
          {
            provider: 'MOCK',
            emailAddress: testEmail1,
          },
          {
            provider: 'MOCK',
            emailAddress: testEmail2,
          },
        ],
      },
    },
    include: { emailAccounts: true },
  });

  const session = await SessionManager.getOrCreateSession(testPhone);

  await t.test('1. Standard Mode: STATUS / CHECK MAIL displays clean minimalist card', async () => {
    waMock.sentMessages = [];
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-1',
        text: 'STATUS',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Standard mode status displayed');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /SS40 AI ASSISTANT/);
    assert.match(lastMsg, /Standard \(Minimalist\)/);
    assert.doesNotMatch(lastMsg, /Recent Actionable Emails/);
  });

  await t.test('1b. Standard Mode: Replying Hi sends clean Minimalist card without keyword clutter', async () => {
    waMock.sentMessages = [];
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-1b',
        text: 'Hi',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Standard mode greeting sent');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /SS40 NETWORK AI EMAIL ASSISTANT/);
    assert.match(lastMsg, /Standard \(Minimalist\)/);
    assert.match(lastMsg, /\*Active Mailbox:\*\s*`ceo\.standard@ss40network\.com`/);
    assert.doesNotMatch(lastMsg, /Send NEW MAIL/);
    assert.doesNotMatch(lastMsg, /Send CHECK MAIL/);
    assert.doesNotMatch(lastMsg, /Reply with 1, 2, or 3/);
  });

  await t.test('2. Standard Mode: SWITCH command lists connected mailboxes', async () => {
    waMock.sentMessages = [];
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-2',
        text: 'SWITCH',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Mailbox selection prompt sent');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /SELECT ACTIVE MAILBOX/);
    assert.match(lastMsg, /1\. ceo\.standard@ss40network\.com/);
    assert.match(lastMsg, /2\. founder\.pro@ss40network\.com/);
  });

  await t.test('3. Standard Mode: Voice Note & Multilingual Reply Draft Flow Works 100%', async () => {
    // Create an inbound email
    const thread = await prisma.emailThread.create({
      data: {
        emailAccountId: user.emailAccounts[0].id,
        externalThreadId: 'thread-mode-101',
        subject: 'Contract Signing Request',
      },
    });

    const msg = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        externalMessageId: 'msg-mode-101',
        senderName: 'Client Partner',
        senderEmail: 'client@acme.com',
        recipientEmail: testEmail1,
        subject: 'Contract Signing Request',
        cleanBody: 'Hello Abraham, please confirm if the contract is signed.',
        isImportant: true,
        actionRequired: 'Confirm contract signing',
      },
    });

    // Notify session
    await SessionManager.setNotifiedState(testPhone, thread.id, msg.id);

    waMock.sentMessages = [];
    // User replies via voice / multilingual text note in Tanglish/Tamil:
    const voiceReplyText = 'Contract sign panniten, document attach panni share panren';
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-3',
        text: voiceReplyText,
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'DRAFT_GENERATED');
    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /AI EMAIL DRAFT PREVIEW/);
    assert.match(lastMsg, /Reply \*SEND\* to dispatch/);

    // Approve draft with SEND
    const sendRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-4',
        text: 'SEND',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(sendRes.action, 'EMAIL_SENT');
    const sendMsg = waMock.getLastMessage()?.body || '';
    assert.match(sendMsg, /EMAIL SENT SUCCESSFULLY/);
  });

  await t.test('4. Upgrade to Executive Pro Mode: Unlocks SWITCH & Advanced Scanner', async () => {
    // Update user to ADVANCED
    await prisma.user.update({
      where: { id: user.id },
      data: { mode: 'ADVANCED' },
    });

    waMock.sentMessages = [];
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-mode-5',
        text: 'SWITCH',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Mailbox selection prompt sent');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /SELECT ACTIVE MAILBOX/);
    assert.match(lastMsg, /1\. ceo\.standard@ss40network\.com/);
    assert.match(lastMsg, /2\. founder\.pro@ss40network\.com/);
  });

  await t.test('5. Baileys Welcome Greeting: Standard (Minimalist) vs Executive Pro', async () => {
    // Setup Mock Baileys
    const { BaileysAdapter } = await import('../services/whatsapp/baileys.adapter.js');
    const adapter = new BaileysAdapter();
    (adapter as any).isReady = true;
    adapter.sendTextMessage = async (to: string, body: string): Promise<any> => {
      waMock.sentMessages.push({ to, body });
      return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
    };

    // A. STANDARD MODE GREETING
    await prisma.user.update({
      where: { id: user.id },
      data: { mode: 'STANDARD' },
    });

    waMock.sentMessages = [];
    await adapter.sendWelcomeGreeting(testPhone);

    const standardGreeting = waMock.getLastMessage()?.body || '';
    assert.match(standardGreeting, /SS40 AI EMAIL ASSISTANT ACTIVATED/);
    assert.match(standardGreeting, /Standard \(Minimalist\)/);
    assert.doesNotMatch(standardGreeting, /Commands & Instructions:/);
    assert.doesNotMatch(standardGreeting, /Reply with 1, 2, or 3/);
    assert.doesNotMatch(standardGreeting, /Send NEW MAIL/);
    assert.doesNotMatch(standardGreeting, /Send SWITCH/);

    // B. EXECUTIVE PRO MODE GREETING
    await prisma.user.update({
      where: { id: user.id },
      data: { mode: 'ADVANCED' },
    });

    waMock.sentMessages = [];
    await adapter.sendWelcomeGreeting(testPhone);

    const proGreeting = waMock.getLastMessage()?.body || '';
    assert.match(proGreeting, /SS40 AI EMAIL ASSISTANT ACTIVATED/);
    assert.match(proGreeting, /Executive Pro/);
    assert.match(proGreeting, /Connected Mailboxes \(2\):/);
    assert.match(proGreeting, /Reply with 1, 2, or 3/);
    assert.match(proGreeting, /Commands & Instructions:/);
    assert.match(proGreeting, /Send \*NEW MAIL\*/);
  });

  await t.test('6. New Email Compose: Authorship Perspective verification', async () => {
    const { buildNewEmailComposePrompt } = await import('../services/ai/prompts.js');
    const prompt = buildNewEmailComposePrompt({
      clientName: 'Samuel',
      clientInstruction: 'Welcome to the team , we will expect u in December 31 to join as a developer',
      recipientEmail: 'abrahamsamuelclg2028@gmail.com',
      senderEmail: 'samdani2028@gmail.com',
    });

    assert.match(prompt, /CRITICAL PERSPECTIVE & AUTHORSHIP DIRECTIVES/);
    assert.match(prompt, /"Samuel" is the SENDER and AUTHOR of this email/);
    assert.match(prompt, /NEVER invert the perspective/);
  });

  await t.test('7. Step 1 Identity Gate: Creates new user, authenticates matching name, and denies wrong name', async () => {
    const { buildServer } = await import('../server/server.js');
    const server = await buildServer();

    const uniquePhone = `+1999${Date.now().toString().slice(-7)}`;
    const originalName = 'Elena Rostova';

    // 1. First time with new number: Creates database record
    const regRes = await server.inject({
      method: 'POST',
      url: '/api/user/profile',
      payload: { name: originalName, whatsappNumber: uniquePhone },
    });
    assert.equal(regRes.statusCode, 200);
    const regData = JSON.parse(regRes.body);
    assert.equal(regData.success, true);
    assert.equal(regData.isNewUser, true);

    // 2. Same number + matching name: Allowed
    const loginRes = await server.inject({
      method: 'POST',
      url: '/api/user/profile',
      payload: { name: 'elena rostova', whatsappNumber: uniquePhone },
    });
    assert.equal(loginRes.statusCode, 200);
    const loginData = JSON.parse(loginRes.body);
    assert.equal(loginData.success, true);
    assert.equal(loginData.isNewUser, false);

    // 3. Same number + different / wrong name: DENIED (403 Access Denied)
    const deniedRes = await server.inject({
      method: 'POST',
      url: '/api/user/profile',
      payload: { name: 'Wrong Imposter Name', whatsappNumber: uniquePhone },
    });
    assert.equal(deniedRes.statusCode, 403);
    const deniedData = JSON.parse(deniedRes.body);
    assert.equal(deniedData.success, false);
    assert.equal(deniedData.error, 'Access Denied');
  });

  await t.test('8. NTFY Mobile Push: Topic generation and /api/user/test-ntfy endpoint works', async () => {
    const { buildServer } = await import('../server/server.js');
    const { PhoneAlertService } = await import('../services/notification/phone-alert.service.js');
    const server = await buildServer();

    const topic = PhoneAlertService.getTopicForUser('+14155552671');
    assert.equal(topic, 'ss40-alerts-14155552671');

    const res = await server.inject({
      method: 'POST',
      url: '/api/user/test-ntfy',
      payload: {
        topic,
        title: 'Test Notification',
        message: 'Hello from SS40 NTFY Test',
      },
    });

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.topic, topic);
    assert.equal(typeof data.success, 'boolean');
  });
});
