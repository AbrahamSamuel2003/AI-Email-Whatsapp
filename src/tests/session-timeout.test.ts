import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { SessionManager } from '../services/state/session-manager.js';
import { IWhatsAppProvider, WhatsAppSendResult } from '../services/whatsapp/whatsapp.interface.js';

class MockWhatsAppSpy implements IWhatsAppProvider {
  sentMessages: { to: string; body: string }[] = [];

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, body });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  async sendInteractiveMessage(to: string, body: string, buttons: any[]): Promise<WhatsAppSendResult> {
    this.sentMessages.push({ to, body });
    return { status: 'SENT', messageId: `msg-${Date.now()}`, recipient: to, timestamp: new Date() };
  }

  parseInboundWebhook(_body: any) {
    return null;
  }
}

test('Session Inactivity Timeout & CONTINUE workflow', async (t) => {
  const spy = new MockWhatsAppSpy();
  const testPhone = '+919999988888';

  // 0. Clean any previous test residue
  await prisma.emailMessage.deleteMany({ where: { externalMessageId: 'msg-timeout-001' } }).catch(() => {});
  await prisma.emailThread.deleteMany({ where: { externalThreadId: 'thread-timeout-001' } }).catch(() => {});
  await prisma.emailAccount.deleteMany({ where: { emailAddress: 'exec@test.com' } }).catch(() => {});
  await prisma.whatsappSession.deleteMany({ where: { whatsappNumber: testPhone } }).catch(() => {});
  await prisma.user.deleteMany({ where: { whatsappNumber: testPhone } }).catch(() => {});

  // 1. Setup mock user and email in DB
  const user = await prisma.user.create({
    data: {
      name: 'Test Executive',
      email: 'exec@test.com',
      whatsappNumber: testPhone,
    },
  });

  const emailAccount = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: 'MOCK',
      emailAddress: 'exec@test.com',
    },
  });

  const thread = await prisma.emailThread.create({
    data: {
      emailAccountId: emailAccount.id,
      externalThreadId: 'thread-timeout-001',
      subject: 'Urgent Project Approval',
    },
  });

  const message = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      externalMessageId: 'msg-timeout-001',
      senderEmail: 'director@company.com',
      senderName: 'Director John',
      recipientEmail: 'exec@test.com',
      subject: 'Urgent Project Approval',
      cleanBody: 'Please review and approve the proposal today.',
      isImportant: true,
      actionRequired: 'Approve the proposal',
    },
  });

  // 2. Email arrives -> Session enters NOTIFIED
  await SessionManager.setNotifiedState(testPhone, thread.id, message.id);

  // 3. User replies within 1 minute -> Draft is generated successfully
  const resWithinWindow = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
    { from: testPhone, text: 'Approved, please proceed with phase 1', messageId: 'msg-t-1', timestamp: Date.now() },
    spy
  );
  assert.equal(resWithinWindow.action, 'DRAFT_GENERATED');
  assert.ok(spy.sentMessages.some((m) => m.body.includes('[AI EMAIL DRAFT PREVIEW]')));

  // 4. Simulate 4 minutes of inactivity (timeout elapsed)
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000);
  await prisma.whatsappSession.update({
    where: { whatsappNumber: testPhone },
    data: { updatedAt: fourMinutesAgo },
  });

  // 5. User sends a casual text after timeout -> Should NOT draft a reply!
  spy.sentMessages = [];
  const resAfterTimeout = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
    { from: testPhone, text: 'Hey are you there?', messageId: 'msg-t-2', timestamp: Date.now() },
    spy
  );
  assert.equal(resAfterTimeout.action, 'IGNORED');
  assert.ok(spy.sentMessages.some((m) => m.body.includes('REPLY WINDOW TIMED OUT')));

  // 6. User sends "CONTINUE" -> Session is re-activated for 3 minutes!
  spy.sentMessages = [];
  const resContinue = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
    { from: testPhone, text: 'CONTINUE', messageId: 'msg-t-3', timestamp: Date.now() },
    spy
  );
  assert.equal(resContinue.action, 'IGNORED');
  assert.ok(spy.sentMessages.some((m) => m.body.includes('EMAIL REPLY SESSION ACTIVE')));

  // 7. User now sends their instruction -> Draft is generated successfully!
  spy.sentMessages = [];
  const resAfterResume = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
    { from: testPhone, text: 'Yes, full approval granted', messageId: 'msg-t-4', timestamp: Date.now() },
    spy
  );
  assert.equal(resAfterResume.action, 'DRAFT_GENERATED');
  assert.ok(spy.sentMessages.some((m) => m.body.includes('[AI EMAIL DRAFT PREVIEW]')));

  // Clean up test data
  await prisma.emailMessage.deleteMany({ where: { threadId: thread.id } });
  await prisma.emailThread.delete({ where: { id: thread.id } });
  await prisma.emailAccount.delete({ where: { id: emailAccount.id } });
  await prisma.whatsappSession.deleteMany({ where: { whatsappNumber: testPhone } });
  await prisma.user.delete({ where: { id: user.id } });
});
