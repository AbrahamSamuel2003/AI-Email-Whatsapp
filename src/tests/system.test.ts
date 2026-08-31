import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { encryptToken, decryptToken } from '../services/crypto/encryption.js';
import { MockAIAdapter } from '../services/ai/mock.adapter.js';
import { MockWhatsAppAdapter } from '../services/whatsapp/mock.adapter.js';
import { MockGmailAdapter } from '../services/email/mock.adapter.js';
import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { EmailFactory } from '../services/email/email.factory.js';
import { AIFactory } from '../services/ai/ai.factory.js';
import { EmailIngestionPipeline } from '../services/email/ingestion-pipeline.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { SessionManager } from '../services/state/session-manager.js';
import { GmailAuthService, GMAIL_SCOPES } from '../services/email/gmail-auth.service.js';
import { buildServer } from '../server/server.js';
import { EmailMetadata } from '../core/types.js';
import { config } from '../config/env.js';

describe('AI Email to WhatsApp Connect - Core Test Suite', () => {
  let mockWhatsApp: MockWhatsAppAdapter;
  let mockEmail: MockGmailAdapter;
  let mockAI: MockAIAdapter;

  before(async () => {
    mockWhatsApp = new MockWhatsAppAdapter();
    mockEmail = new MockGmailAdapter();
    mockAI = new MockAIAdapter();

    WhatsAppFactory.setProvider(mockWhatsApp);
    EmailFactory.setProvider(mockEmail);
    AIFactory.setProvider(mockAI);

    await prisma.outboundEmail.deleteMany({
      where: { emailAccount: { provider: 'MOCK' } },
    });
    await prisma.emailMessage.deleteMany({
      where: { thread: { emailAccount: { provider: 'MOCK' } } },
    });
    await prisma.emailThread.deleteMany({
      where: { emailAccount: { provider: 'MOCK' } },
    });
    await prisma.whatsappSession.deleteMany({
      where: { user: { whatsappNumber: '+919999988888' } },
    });
    await prisma.emailAccount.deleteMany({
      where: { provider: 'MOCK' },
    });
    await prisma.user.deleteMany({
      where: { whatsappNumber: '+919999988888' },
    });
  });

  after(async () => {
    await prisma.$disconnect();
  });

  test('1. Crypto Service: Encrypts and decrypts OAuth tokens accurately', () => {
    const secretToken = 'ya29.a0AfH6SMD_secure_refresh_token_12345';
    const encrypted = encryptToken(secretToken);
    assert.notEqual(encrypted, secretToken);
    assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, secretToken);
  });

  test('2. AI Importance: Correctly classifies meeting request as IMPORTANT', async () => {
    const email: EmailMetadata = {
      externalMessageId: 'test-msg-1',
      externalThreadId: 'test-thread-1',
      rfcMessageId: '<test-msg-1@company.com>',
      senderName: 'Raj Kumar',
      senderEmail: 'raj@company.com',
      recipientEmail: 'client@company.com',
      subject: 'Urgent Project Review',
      cleanBody: 'Can we have a quick meeting tomorrow at 11 AM to review the contract?',
      receivedAt: new Date(),
    };

    const res = await mockAI.classifyImportance(email);
    assert.equal(res.isImportant, true);
    assert.ok(res.confidence >= 0.8);
    assert.equal(res.urgency, 'HIGH');
  });

  test('3. AI Importance: Correctly classifies promotional newsletter as NOT IMPORTANT', async () => {
    const email: EmailMetadata = {
      externalMessageId: 'test-msg-spam',
      externalThreadId: 'test-thread-spam',
      senderName: 'Naukri Alerts',
      senderEmail: 'noreply@naukri.com',
      recipientEmail: 'client@company.com',
      subject: '25 jobs matching your profile',
      cleanBody: 'Here are matching jobs. Click unsubscribe to opt out.',
      receivedAt: new Date(),
    };

    const res = await mockAI.classifyImportance(email);
    assert.equal(res.isImportant, false);
  });

  test('4. End-to-End Pipeline: Ingestion -> WhatsApp Notification -> Reply -> Preview -> SEND -> Dispatch', async () => {
    const clientUser = await prisma.user.create({
      data: {
        name: 'Test Client',
        email: 'testclient@company.com',
        whatsappNumber: '+919999988888',
        emailAccounts: {
          create: {
            provider: 'MOCK',
            emailAddress: 'testclient@company.com',
          },
        },
      },
    });

    const incomingEmail: EmailMetadata = {
      externalMessageId: 'e2e-msg-101',
      externalThreadId: 'e2e-thread-202',
      rfcMessageId: '<e2e-msg-101@partner.com>',
      senderName: 'Raj Kumar',
      senderEmail: 'raj@partner.com',
      recipientEmail: clientUser.email,
      subject: 'Project Meeting',
      cleanBody: 'Hi Sir, Can we have a meeting tomorrow at 11 AM?',
      receivedAt: new Date(),
    };

    // Step A: Ingest email
    const ingestRes = await EmailIngestionPipeline.processIncomingEmail(incomingEmail, clientUser.id);
    assert.equal(ingestRes.isImportant, true);
    assert.equal(ingestRes.whatsappNotified, true);

    const notifyMsg = mockWhatsApp.getLastMessage();
    assert.ok(notifyMsg?.body.includes('Project Meeting'));
    assert.ok(notifyMsg?.body.includes('Raj Kumar'));

    // Step B: Client replies on WhatsApp with informal text
    const draftRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
      from: clientUser.whatsappNumber,
      messageId: 'wa-reply-001',
      text: 'tomorrow 11 is fine',
      timestamp: Date.now(),
    });
    assert.equal(draftRes.action, 'DRAFT_GENERATED');

    const previewMsg = mockWhatsApp.getLastMessage();
    assert.ok(previewMsg?.body.includes('DRAFT PREVIEW'));
    assert.ok(previewMsg?.body.includes('Tomorrow at 11:00 AM works'));

    // Step C: Client confirms with SEND
    const confirmRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
      from: clientUser.whatsappNumber,
      messageId: 'wa-confirm-002',
      text: 'SEND',
      timestamp: Date.now(),
    });
    assert.equal(confirmRes.action, 'EMAIL_SENT');

    // Step D: Verify outbound email in mock provider
    const sentReplies = mockEmail.getSentReplies();
    assert.equal(sentReplies.length, 1);
    const sent = sentReplies[0];
    assert.equal(sent.toEmail, 'raj@partner.com');
    assert.equal(sent.subject, 'Re: Project Meeting');
    assert.equal(sent.threadId, 'e2e-thread-202');
    assert.equal(sent.inReplyToMessageId, '<e2e-msg-101@partner.com>');
    assert.ok(sent.body.includes('Tomorrow at 11:00 AM works'));
  });

  test('5. Gmail OAuth Scopes & Token Storage Integrity', async () => {
    assert.ok(GMAIL_SCOPES.includes('https://www.googleapis.com/auth/gmail.readonly'));
    assert.ok(GMAIL_SCOPES.includes('https://www.googleapis.com/auth/gmail.send'));

    // Test storing an EmailAccount with encrypted tokens
    const sampleAccessToken = 'ya29.sample_live_access_token_xyz';
    const sampleRefreshToken = '1//sample_live_refresh_token_abc';

    const account = await prisma.emailAccount.create({
      data: {
        userId: (await prisma.user.findFirstOrThrow()).id,
        provider: 'GMAIL',
        emailAddress: `oauth-test-${Date.now()}@gmail.com`,
        encryptedAccessToken: encryptToken(sampleAccessToken),
        encryptedRefreshToken: encryptToken(sampleRefreshToken),
      },
    });

    assert.equal(decryptToken(account.encryptedAccessToken!), sampleAccessToken);
    assert.equal(decryptToken(account.encryptedRefreshToken!), sampleRefreshToken);
  });

  test('6. Fastify API Server: Health and Status Endpoints', async () => {
    const server = await buildServer();

    const healthRes = await server.inject({
      method: 'GET',
      url: '/health',
    });
    assert.equal(healthRes.statusCode, 200);
    const healthJson = healthRes.json();
    assert.equal(healthJson.status, 'ok');

    const statusRes = await server.inject({
      method: 'GET',
      url: '/api/status',
    });
    assert.equal(statusRes.statusCode, 200);
    const statusJson = statusRes.json();
    assert.equal(statusJson.status, 'active');
    assert.ok(Array.isArray(statusJson.emailAccounts));

    await server.close();
  });

  test('7. OTP & Security Alerts: Dispatches ALERT_ONLY to WhatsApp, extracts code, and preserves IDLE state', async () => {
    const uniqueId = Date.now();
    const otpEmail: EmailMetadata = {
      externalMessageId: `devin-otp-${uniqueId}`,
      externalThreadId: `devin-thread-${uniqueId}`,
      senderName: 'Devin',
      senderEmail: 'no-reply@devin.ai',
      recipientEmail: 'client@company.com',
      subject: 'Your Devin Login Code',
      cleanBody: 'To start using Devin, please enter the verification code: 849201. This code expires in 10 minutes.',
      receivedAt: new Date(),
    };

    // Step A: Ingest OTP email (Ensure session is clean IDLE first)
    await SessionManager.resetSession(config.CLIENT_WHATSAPP_NUMBER);
    const res = await EmailIngestionPipeline.processIncomingEmail(otpEmail);
    assert.equal(res.isImportant, true);
    assert.equal(res.notificationType, 'ALERT_ONLY');
    assert.equal(res.extractedCode, '849201');
    assert.equal(res.whatsappNotified, true);

    // Step B: Verify WhatsApp message has code and indicates no reply needed
    const lastMsg = mockWhatsApp.getLastMessage();
    assert.ok(lastMsg?.body.includes('SECURITY'));
    assert.ok(lastMsg?.body.includes('*849201*'));
    assert.ok(lastMsg?.body.includes('No email reply needed'));

    // Step C: Verify session state remains IDLE (not waiting for draft or reply)
    const session = await prisma.whatsappSession.findFirst({
      where: { user: { email: 'client@company.com' } },
    });
    assert.ok(!session || session.state === 'IDLE' || session.state === 'CONFIRMED_SENT');

    // Step D: Verify user typing text does NOT trigger draft generation
    const replyAttempt = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
      from: config.CLIENT_WHATSAPP_NUMBER,
      messageId: 'wa-msg-otp-reply',
      text: 'Thanks for the code',
      timestamp: Date.now(),
    });
    assert.equal(replyAttempt.action, 'IGNORED');
  });

  test('8. Monitoring & Diagnostics: Probes /health/deep and /api/diagnostics', async () => {
    const server = await buildServer();

    const deepRes = await server.inject({
      method: 'GET',
      url: '/health/deep',
    });
    assert.equal(deepRes.statusCode, 200);
    const deepJson = deepRes.json();
    assert.ok(deepJson.status === 'HEALTHY' || deepJson.status === 'DEGRADED');
    assert.ok(deepJson.components.database.status === 'UP');
    assert.ok(deepJson.components.ai.status === 'ACTIVE');

    const diagRes = await server.inject({
      method: 'GET',
      url: '/api/diagnostics',
    });
    assert.equal(diagRes.statusCode, 200);
    const diagJson = diagRes.json();
    assert.ok(Array.isArray(diagJson.recommendations));

    await server.close();
  });

  test('9. AdminAlertService: Incident Creation, Cooldown Throttling, and Routing', async () => {
    const { AdminAlertService } = await import('../services/monitoring/admin-alert.service.js');
    AdminAlertService.clearHistory();

    // 1. First WhatsApp disconnect alert -> Dispatched
    const alert1 = await AdminAlertService.notifyWhatsAppDisconnected(
      config.CLIENT_WHATSAPP_NUMBER,
      401,
      'Test disconnect'
    );
    assert.equal(alert1.status, 'DISPATCHED');
    assert.equal(alert1.type, 'WHATSAPP_DISCONNECTED');

    // 2. Immediate duplicate disconnect alert -> Suppressed by cooldown
    const alert2 = await AdminAlertService.notifyWhatsAppDisconnected(
      config.CLIENT_WHATSAPP_NUMBER,
      401,
      'Duplicate test disconnect'
    );
    assert.equal(alert2.status, 'SUPPRESSED_COOLDOWN');

    // 3. Gmail Auth Failure alert -> Dispatched (separate key)
    const alert3 = await AdminAlertService.notifyGmailAuthFailure(
      'test@example.com',
      'invalid_grant token revoked'
    );
    assert.equal(alert3.status, 'DISPATCHED');
    assert.equal(alert3.type, 'GMAIL_AUTH_FAILED');

    // 4. Verify incident history
    const incidents = AdminAlertService.getRecentIncidents();
    assert.ok(incidents.length >= 3);
  });

  after(async () => {
    // Clean up mock test accounts from dev.db
    await prisma.emailAccount.deleteMany({
      where: { emailAddress: { startsWith: 'oauth-test-' } },
    });
  });
});
