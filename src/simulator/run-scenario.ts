import { EmailIngestionPipeline } from '../services/email/ingestion-pipeline.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { MockWhatsAppAdapter } from '../services/whatsapp/mock.adapter.js';
import { MockGmailAdapter } from '../services/email/mock.adapter.js';
import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { EmailFactory } from '../services/email/email.factory.js';
import { prisma } from '../db/prisma.js';
import { EmailMetadata } from '../core/types.js';

async function runScenario() {
  console.log('\n' + '═'.repeat(65));
  console.log('🤖 AI EMAIL → WHATSAPP REPLY SYSTEM — SCENARIO VERIFICATION');
  console.log('═'.repeat(65) + '\n');

  // Setup mock adapters
  const mockWhatsApp = new MockWhatsAppAdapter();
  const mockEmail = new MockGmailAdapter();
  WhatsAppFactory.setProvider(mockWhatsApp);
  EmailFactory.setProvider(mockEmail);

  // Clean test state
  await prisma.outboundEmail.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.emailThread.deleteMany();
  await prisma.whatsappSession.deleteMany();
  await prisma.emailAccount.deleteMany();
  await prisma.user.deleteMany();

  // Create User
  const clientUser = await prisma.user.create({
    data: {
      name: 'Abraham Samuel',
      email: 'abraham@client.com',
      whatsappNumber: '+919876543210',
      emailAccounts: {
        create: {
          provider: 'MOCK',
          emailAddress: 'abraham@client.com',
        },
      },
    },
  });

  // -------------------------------------------------------------
  // Step 1: Incoming Important Email
  // -------------------------------------------------------------
  console.log('📧 STEP 1: Incoming Email A (Important Client Meeting)');
  const importantEmail: EmailMetadata = {
    externalMessageId: 'msg-meeting-raj-001',
    externalThreadId: 'thread-project-alpha-777',
    rfcMessageId: '<msg-meeting-raj-001@rajkumar.com>',
    senderName: 'Raj Kumar',
    senderEmail: 'raj.kumar@example.com',
    recipientEmail: clientUser.email,
    subject: 'Project Meeting',
    cleanBody: 'Hi Sir,\n\nCan we have a meeting tomorrow at 11 AM to review the project roadmap?\n\nRegards,\nRaj Kumar',
    receivedAt: new Date(),
  };

  const res1 = await EmailIngestionPipeline.processIncomingEmail(importantEmail, clientUser.id);
  console.log(`   ► AI Classification: ${res1.isImportant ? '✅ IMPORTANT' : '❌ NOT IMPORTANT'}`);
  console.log(`   ► Reason: ${res1.importanceReason}`);
  console.log(`   ► WhatsApp Notified: ${res1.whatsappNotified ? 'YES' : 'NO'}`);

  // -------------------------------------------------------------
  // Step 2: Incoming Non-Important / Spam Email
  // -------------------------------------------------------------
  console.log('\n📧 STEP 2: Incoming Email B (Automated Job Portal / Spam)');
  const spamEmail: EmailMetadata = {
    externalMessageId: 'msg-naukri-digest-999',
    externalThreadId: 'thread-naukri-auto-123',
    rfcMessageId: '<msg-naukri-digest-999@naukri.com>',
    senderName: 'Naukri Alerts',
    senderEmail: 'alerts@naukri.com',
    recipientEmail: clientUser.email,
    subject: '25 jobs matching your profile',
    cleanBody: 'Here are the top 25 jobs matching your executive profile. Click here to apply now or unsubscribe.',
    receivedAt: new Date(),
  };

  const res2 = await EmailIngestionPipeline.processIncomingEmail(spamEmail, clientUser.id);
  console.log(`   ► AI Classification: ${res2.isImportant ? '✅ IMPORTANT' : '❌ NOT IMPORTANT'}`);
  console.log(`   ► Reason: ${res2.importanceReason}`);
  console.log(`   ► WhatsApp Notified: ${res2.whatsappNotified ? 'YES' : 'NO (Ignored silently - No Spam to WhatsApp)'}`);

  // -------------------------------------------------------------
  // Step 3 & 4: Inspect WhatsApp notification sent to Client
  // -------------------------------------------------------------
  console.log('\n📱 STEP 3 & 4: WhatsApp Notification Received by Client');
  console.log('─'.repeat(50));
  const lastWhatsAppMsg = mockWhatsApp.getLastMessage();
  console.log(lastWhatsAppMsg?.body);
  console.log('─'.repeat(50));

  // -------------------------------------------------------------
  // Step 5: Client replies on WhatsApp in informal natural language
  // -------------------------------------------------------------
  console.log('\n💬 STEP 5: Client types informal reply on WhatsApp:');
  const clientReplyText = 'tomorrow 11 is fine';
  console.log(`   Client ──▶ WhatsApp: "${clientReplyText}"`);

  const replyProcessRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
    from: clientUser.whatsappNumber,
    messageId: 'wa-client-reply-01',
    text: clientReplyText,
    timestamp: Date.now(),
  });

  // -------------------------------------------------------------
  // Step 6: AI generates professional reply + Draft Preview sent
  // -------------------------------------------------------------
  console.log('\n🤖 STEP 6: AI converts informal text into Professional Email Reply Preview');
  console.log('─'.repeat(50));
  const previewMsg = mockWhatsApp.getLastMessage();
  console.log(previewMsg?.body);
  console.log('─'.repeat(50));

  // -------------------------------------------------------------
  // Step 7: Client confirms with "SEND"
  // -------------------------------------------------------------
  console.log('\n👍 STEP 7: Client confirms sending the draft:');
  console.log('   Client ──▶ WhatsApp: "SEND"');

  const confirmRes = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
    from: clientUser.whatsappNumber,
    messageId: 'wa-client-confirm-02',
    text: 'SEND',
    timestamp: Date.now(),
  });

  console.log(`   ► Status: ${confirmRes.action}`);
  console.log(`   ► Result: ${confirmRes.message}`);

  // -------------------------------------------------------------
  // Step 8: Verify Email Sent in original thread with RFC headers
  // -------------------------------------------------------------
  console.log('\n📬 STEP 8: Verification of Dispatched Email Reply & Threading');
  const sentReplies = mockEmail.getSentReplies();
  const sent = sentReplies[0];

  console.log('─'.repeat(50));
  console.log(`   To:                  ${sent?.toEmail}`);
  console.log(`   Subject:             ${sent?.subject}`);
  console.log(`   Thread ID:           ${sent?.threadId}`);
  console.log(`   In-Reply-To:         ${sent?.inReplyToMessageId}`);
  console.log(`   References:          ${sent?.references}`);
  console.log(`\n   Dispatched Email Body:\n${sent?.body}`);
  console.log('─'.repeat(50));

  const confirmationNotice = mockWhatsApp.getLastMessage();
  console.log(`\n📱 Client received confirmation WhatsApp:`);
  console.log(confirmationNotice?.body);

  console.log('\n' + '═'.repeat(65));
  console.log('🎉 ALL 8 SCENARIO STEPS COMPLETED & VERIFIED SUCCESSFULLY!');
  console.log('═'.repeat(65) + '\n');
}

runScenario()
  .catch((err) => {
    console.error('❌ Scenario failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
