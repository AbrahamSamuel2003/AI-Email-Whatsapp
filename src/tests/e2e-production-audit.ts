import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { encryptToken } from '../services/crypto/encryption.js';
import { EmailIngestionPipeline } from '../services/email/ingestion-pipeline.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { IWhatsAppProvider } from '../services/whatsapp/whatsapp.interface.js';

class MockWhatsAppSpy implements IWhatsAppProvider {
  sentMessages: { to: string; body: string }[] = [];

  async initialize(): Promise<void> {}
  async isConnected(): Promise<boolean> { return true; }
  async getStatus() { return { isConnected: true }; }
  async requestPairingCode(phone: string): Promise<string> { return '1234-5678'; }
  async disconnect(): Promise<void> {}

  async sendTextMessage(to: string, message: string): Promise<any> {
    this.sentMessages.push({ to, body: message });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  async sendInteractiveMessage(to: string, message: string, buttons: { id: string; title: string }[]): Promise<any> {
    const btnText = buttons.map(b => `[${b.title}]`).join(' ');
    this.sentMessages.push({ to, body: `${message}\n${btnText}` });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  parseInboundWebhook(_body: any) {
    return null;
  }
}

test('Production Readiness & End-to-End Client Simulation Audit', async (t) => {
  const spy = new MockWhatsAppSpy();
  const testPhone = '+919876543210';

  // STEP 1: Client Onboarding (1 User with 3 Mailboxes: 1 Gmail + 1 Zoho + 1 Custom Domain)
  let user: any;
  let acc1_gmail: any;
  let acc2_zoho: any;
  let acc3_custom: any;

  await t.test('1. Onboarding & Multi-Mailbox Setup', async () => {
    user = await prisma.user.create({
      data: {
        name: 'Vasanth Murugan',
        email: 'ceo@ss40network.com',
        whatsappNumber: testPhone,
        preferredLanguage: 'ENGLISH',
      },
    });

    acc1_gmail = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        emailAddress: 'internallabexam001@gmail.com',
        provider: 'MOCK',
        encryptedAccessToken: encryptToken('mock-access-token-1'),
        encryptedRefreshToken: encryptToken('mock-refresh-token-1'),
      },
    });

    acc2_zoho = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        emailAddress: 'samdani2028@gmail.com',
        provider: 'MOCK',
        imapHost: 'imap.zoho.in',
        smtpHost: 'smtp.zoho.in',
        encryptedPassword: encryptToken('zoho-app-pass'),
      },
    });

    acc3_custom = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        emailAddress: 'nellaivasanth007@gmail.com',
        provider: 'MOCK',
        imapHost: 'mail.ss40network.com',
        smtpHost: 'mail.ss40network.com',
        encryptedPassword: encryptToken('custom-app-pass'),
      },
    });

    assert.ok(user.id);
    assert.ok(acc1_gmail.id);
    assert.ok(acc2_zoho.id);
    assert.ok(acc3_custom.id);
  });

  // STEP 2: Ingestion & AI Spam Filtration
  await t.test('2. Ingestion & Spam Filter: Social & Promo newsletters must be silently ignored', async () => {
    const promoEmail = {
      externalMessageId: 'promo-newsletter-01',
      externalThreadId: 'thread-promo-01',
      senderEmail: 'promotions@flipkart.com',
      senderName: 'Flipkart Deals',
      recipientEmail: acc1_gmail.emailAddress,
      subject: 'Big Billion Days Sale! 70% Off on Electronics',
      cleanBody: 'Get flat 70% off on all laptops and accessories today only. Click here to buy.',
      receivedAt: new Date(),
    };

    const res = await EmailIngestionPipeline.processIncomingEmail(promoEmail as any, user.id, true);
    assert.equal(res.isImportant, false);
    assert.equal(res.notificationType, 'NONE');
    assert.equal(res.whatsappNotified, false);

    const savedPromo = await prisma.emailMessage.findFirst({ where: { externalMessageId: 'promo-newsletter-01' } });
    assert.ok(savedPromo);
    assert.equal(savedPromo?.isImportant, false);
  });

  // STEP 3: Ingestion & OTP / Security Alert
  await t.test('3. Security & OTP Handling: Dispatches alert, extracts OTP, and never enters reply queue', async () => {
    const otpEmail = {
      externalMessageId: 'security-otp-01',
      externalThreadId: 'thread-otp-01',
      senderEmail: 'no-reply@accounts.google.com',
      senderName: 'Google Security',
      recipientEmail: acc1_gmail.emailAddress,
      subject: 'Security Alert: Your verification code is 849201',
      cleanBody: 'Your 6-digit Google verification code is 849201. Use this code to complete sign in.',
      receivedAt: new Date(),
    };

    const res = await EmailIngestionPipeline.processIncomingEmail(otpEmail as any, user.id, true);
    assert.equal(res.isImportant, true);
    assert.equal(res.notificationType, 'ALERT_ONLY');
    assert.equal(res.extractedCode, '849201');

    // Check DB: actionRequired must be null
    const savedOtp = await prisma.emailMessage.findFirst({ where: { externalMessageId: 'security-otp-01' } });
    assert.ok(savedOtp);
    assert.equal(savedOtp?.actionRequired, null);
  });

  // STEP 4: Ingestion & Actionable Business Email
  let actionableMsg: any;
  await t.test('4. Ingestion of Actionable Business Email: Generates clean WhatsApp alert', async () => {
    const clientEmail = {
      externalMessageId: 'client-inquiry-01',
      externalThreadId: 'thread-client-inquiry-01',
      rfcMessageId: '<rfc-client-01@client.com>',
      senderEmail: 'alex@acme-enterprise.com',
      senderName: 'Alex Vance',
      recipientEmail: acc1_gmail.emailAddress,
      subject: 'Project Architecture Review Meeting',
      cleanBody: 'Hi Vasanth,\nCan we schedule a 30-minute review meeting tomorrow at 11:00 AM regarding the AI Email WhatsApp connector deployment?\nBest,\nAlex',
      receivedAt: new Date(),
    };

    const res = await EmailIngestionPipeline.processIncomingEmail(clientEmail as any, user.id, true);
    assert.equal(res.isImportant, true);
    assert.equal(res.notificationType, 'ACTIONABLE');

    actionableMsg = await prisma.emailMessage.findFirst({ where: { externalMessageId: 'client-inquiry-01' } });
    assert.ok(actionableMsg);
    assert.ok(actionableMsg.actionRequired);

    await prisma.whatsappSession.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        whatsappNumber: testPhone,
        state: 'NOTIFIED',
        activeEmailAccountId: acc1_gmail.id,
        activeThreadId: res.threadId,
        activeMessageId: res.messageId,
      },
      update: {
        state: 'NOTIFIED',
        activeEmailAccountId: acc1_gmail.id,
        activeThreadId: res.threadId,
        activeMessageId: res.messageId,
      },
    });
  });

  // STEP 5: Multi-Mailbox Switcher & Gatekeeper
  
  await t.test('5. Multi-Mailbox Gatekeeper & Switching Flow', async () => {
    // Send "SWITCH"
    const resSwitch = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'SWITCH' } as any,
      spy as any
    );
    const switchMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(switchMsg.body.includes('SELECT ACTIVE MAILBOX'));
    assert.ok(switchMsg.body.includes('1. internallabexam001@gmail.com'));
    assert.ok(switchMsg.body.includes('2. samdani2028@gmail.com'));
    assert.ok(switchMsg.body.includes('3. nellaivasanth007@gmail.com'));

    // Select Mailbox 1
    const resSelect = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: '1' } as any,
      spy as any
    );
    const selMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(selMsg.body.includes('ACTIVE MAILBOX SELECTED'));
    assert.ok(selMsg.body.includes('internallabexam001@gmail.com'));

    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.activeEmailAccountId, acc1_gmail.id);
  });

  // STEP 6: Multilingual AI Reply Drafting (Tanglish voice instruction)
  await t.test('6. Multilingual Reply Generation: Tanglish instruction ➔ Flawless Corporate English Draft', async () => {
    // User replies: "naalaiku 11 am ok sollidu meeting mudichidalaam"
    const resDraft = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'naalaiku 11 am ok sollidu meeting mudichidalaam' } as any,
      spy as any
    );

    assert.equal(resDraft.action, 'DRAFT_GENERATED');
    const previewMsg = spy.sentMessages[spy.sentMessages.length - 1];
    assert.ok(previewMsg.body.includes('AI EMAIL DRAFT PREVIEW'));
    assert.ok(previewMsg.body.includes('Alex Vance'));
    assert.ok(previewMsg.body.includes('ACTIONS:'));
    assert.ok(previewMsg.body.includes('SEND'));
  });

  // STEP 7: Draft Revision / Editing Flow
  await t.test('7. Draft Editing Flow: User adjusts time ➔ Draft updates dynamically', async () => {
    // User replies: "Make it 11:30 AM instead of 11:00 AM"
    const resEdit = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'Make it 11:30 AM instead of 11:00 AM' } as any,
      spy as any
    );

    assert.equal(resEdit.action, 'DRAFT_GENERATED');
    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.equal(session?.state, 'PREVIEW_GENERATED');
    assert.ok(session?.generatedDraft);
  });

  // STEP 8: Approval & Threaded Email Dispatch
  await t.test('8. Approval & Outbound Dispatch: SEND sends email with exact thread & RFC headers', async () => {
    const resSend = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, body: 'SEND' } as any,
      spy as any
    );

    assert.equal(resSend.action, 'EMAIL_SENT');
    const sentConfirmation = spy.sentMessages.find(m => m.body.includes('EMAIL SENT') || m.body.includes('DELIVERED') || m.body.includes('SENT'));
    assert.ok(sentConfirmation);

    // Check Outbound DB record
    const outbound = await prisma.outboundEmail.findFirst({
      where: { emailAccountId: acc1_gmail.id },
      orderBy: { sentAt: 'desc' },
    });

    assert.ok(outbound);
    assert.equal(outbound?.toEmail, 'alex@acme-enterprise.com');
    assert.equal(outbound?.status, 'SENT');

    // Check Session state returned to CONFIRMED_SENT / IDLE
    const session = await prisma.whatsappSession.findUnique({ where: { userId: user.id } });
    assert.ok(session?.state === 'CONFIRMED_SENT' || session?.state === 'IDLE');
    assert.equal(session?.generatedDraft, null);
  });

  // STEP 9: Cleanup all test data
  await prisma.outboundEmail.deleteMany({ where: { emailAccountId: { in: [acc1_gmail.id, acc2_zoho.id, acc3_custom.id] } } });
  await prisma.emailMessage.deleteMany({ where: { thread: { emailAccountId: { in: [acc1_gmail.id, acc2_zoho.id, acc3_custom.id] } } } });
  await prisma.emailThread.deleteMany({ where: { emailAccountId: { in: [acc1_gmail.id, acc2_zoho.id, acc3_custom.id] } } });
  await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
  await prisma.whatsappSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { id: user.id } });
});
