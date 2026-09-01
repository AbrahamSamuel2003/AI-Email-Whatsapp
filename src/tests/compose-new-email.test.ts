import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../db/prisma.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { MockWhatsAppAdapter } from '../services/whatsapp/mock.adapter.js';
import { EmailFactory } from '../services/email/email.factory.js';
import { MockGmailAdapter } from '../services/email/mock.adapter.js';

test('New Email Composition Suite: End-to-End Workflow', async (t) => {
  const testPhone = '+919988776655';
  const waMock = new MockWhatsAppAdapter();

  // 1. Setup User with 2 Connected Mailboxes
  const user = await prisma.user.upsert({
    where: { whatsappNumber: testPhone },
    create: {
      name: 'Abraham Samuel',
      email: 'abraham@ss40network.com',
      whatsappNumber: testPhone,
      emailAccounts: {
        create: [
          {
            provider: 'MOCK',
            emailAddress: 'abraham@ss40network.com',
          },
          {
            provider: 'MOCK',
            emailAddress: 'ceo@ss40network.com',
          },
        ],
      },
    },
    update: {
      name: 'Abraham Samuel',
    },
    include: { emailAccounts: true },
  });

  const session = await prisma.whatsappSession.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      whatsappNumber: testPhone,
      activeEmailAccountId: user.emailAccounts[0].id,
      state: 'IDLE',
    },
    update: {
      activeEmailAccountId: user.emailAccounts[0].id,
      state: 'IDLE',
      composeRecipient: null,
      composeSubject: null,
      generatedDraft: null,
    },
  });

  await t.test('1. Trigger COMPOSE_NEW_EMAIL -> Prompts for Recipient', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-1',
        text: 'NEW MAIL',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Awaiting recipient email address');

    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'AWAITING_RECIPIENT');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /COMPOSE NEW EMAIL/);
    assert.match(lastMsg, /abraham@ss40network\.com/);
  });

  await t.test('2. Invalid Recipient Rejection', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-2',
        text: 'not-an-email',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Invalid recipient email format');

    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'AWAITING_RECIPIENT');
  });

  await t.test('3. Valid Recipient Acceptance -> Prompts for Message', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-3',
        text: 'client.partner@acme-corp.com',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.match(res.message, /client\.partner@acme-corp\.com/);

    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'AWAITING_COMPOSE_MESSAGE');
    assert.equal(updatedSession?.composeRecipient, 'client.partner@acme-corp.com');
  });

  await t.test('4. AI Generates Initial First Draft (with Subject & Body)', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-4',
        text: 'Naalaiku 3pm zoom call schedule pannalam, proposal share pannunga',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'DRAFT_GENERATED');

    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'PREVIEW_GENERATED');
    assert.ok(updatedSession?.composeSubject);
    assert.ok(updatedSession?.generatedDraft);

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /AI EMAIL DRAFT PREVIEW/);
    assert.match(lastMsg, /client\.partner@acme-corp\.com/);
  });

  await t.test('5. EDIT Trigger -> Enters Pure Manual Edit Mode', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-5',
        text: 'EDIT',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'IGNORED');
    assert.equal(res.message, 'Entered manual edit mode');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /^Subject:\s*/);
    assert.doesNotMatch(lastMsg, /\[MANUAL EDIT MODE\]/);
    assert.doesNotMatch(lastMsg, /Copy, edit, and send/);
  });

  await t.test('6. Manual Edit Submitted -> Exact Content Preserved with 0% AI Modification', async () => {
    const customEditedText = `Subject: Urgent Proposal Discussion Tomorrow at 3:00 PM\n\nDear Partner Team,\n\nWe have reviewed the project specifications. Let us connect tomorrow at 3:00 PM via Zoom to finalize the proposal.\n\nBest regards,\nAbraham Samuel`;

    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-6',
        text: customEditedText,
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'DRAFT_GENERATED');
    assert.equal(res.message, 'Manual client edit saved without AI modification');

    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'PREVIEW_GENERATED');
    assert.equal(updatedSession?.composeSubject, 'Urgent Proposal Discussion Tomorrow at 3:00 PM');
    assert.match(updatedSession?.generatedDraft || '', /We have reviewed the project specifications/);

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /DRAFT PREVIEW/);
    assert.match(lastMsg, /Urgent Proposal Discussion Tomorrow at 3:00 PM/);
  });

  await t.test('7. SEND Confirmation -> Dispatches New Standalone Email', async () => {
    const res = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      {
        from: testPhone,
        messageId: 'msg-compose-7',
        text: 'SEND',
        timestamp: Date.now(),
      },
      waMock
    );

    assert.equal(res.action, 'EMAIL_SENT');
    assert.equal(res.message, 'New standalone email sent successfully');

    // Verify Session is back to IDLE
    const updatedSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(updatedSession?.state, 'IDLE');
    assert.equal(updatedSession?.composeRecipient, null);
    assert.equal(updatedSession?.generatedDraft, null);

    // Verify Outbound Record in Database
    const outbound = await prisma.outboundEmail.findFirst({
      where: { toEmail: 'client.partner@acme-corp.com' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(outbound);
    assert.equal(outbound?.status, 'SENT');
    assert.equal(outbound?.subject, 'Urgent Proposal Discussion Tomorrow at 3:00 PM');

    const lastMsg = waMock.getLastMessage()?.body || '';
    assert.match(lastMsg, /EMAIL SENT SUCCESSFULLY/);
    assert.match(lastMsg, /client\.partner@acme-corp\.com/);
  });

  await t.test('8. CANCEL at any step cleanly discards draft', async () => {
    // Start compose again
    await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, messageId: 'msg-compose-8a', text: 'NEW MAIL', timestamp: Date.now() },
      waMock
    );
    // Send Cancel
    const cancelRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, messageId: 'msg-compose-8b', text: 'CANCEL', timestamp: Date.now() },
      waMock
    );

    assert.equal(cancelRes.action, 'SESSION_RESET');

    const resetSession = await prisma.whatsappSession.findUnique({ where: { id: session.id } });
    assert.equal(resetSession?.state, 'IDLE');
    assert.equal(resetSession?.composeRecipient, null);
  });

  await t.test('9. Duplicate SEND prevention: Repeated SEND does not trigger duplicate emails', async () => {
    // When session is in IDLE, sending SEND returns error/notice without creating outbound emails
    const countBefore = await prisma.outboundEmail.count({ where: { emailAccountId: { in: user.emailAccounts.map((a) => a.id) } } });
    const duplicateRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(
      { from: testPhone, messageId: 'msg-compose-dup-send', text: 'SEND', timestamp: Date.now() },
      waMock
    );

    assert.equal(duplicateRes.action, 'IGNORED');
    const countAfter = await prisma.outboundEmail.count({ where: { emailAccountId: { in: user.emailAccounts.map((a) => a.id) } } });
    assert.equal(countBefore, countAfter);
  });

  // Cleanup test user
  await prisma.outboundEmail.deleteMany({ where: { emailAccountId: { in: user.emailAccounts.map((a) => a.id) } } });
  await prisma.whatsappSession.deleteMany({ where: { userId: user.id } });
  await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
});
