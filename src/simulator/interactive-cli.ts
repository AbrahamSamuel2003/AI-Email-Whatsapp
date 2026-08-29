import * as readline from 'readline';
import { EmailIngestionPipeline } from '../services/email/ingestion-pipeline.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { GmailSyncService } from '../services/email/gmail-sync.service.js';
import { MockWhatsAppAdapter } from '../services/whatsapp/mock.adapter.js';
import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { prisma } from '../db/prisma.js';
import { EmailMetadata } from '../core/types.js';
import { config } from '../config/env.js';

const mockWhatsApp = new MockWhatsAppAdapter();
WhatsAppFactory.setProvider(mockWhatsApp);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function printMenu() {
  console.log('\n' + '═'.repeat(65));
  console.log('🤖 AI EMAIL → WHATSAPP REPLY SYSTEM (MANUAL CONTROL CLI)');
  console.log('═'.repeat(65));
  console.log('1. 📥 Sync Latest Emails from Real Gmail (Live OAuth)');
  console.log('2. 💬 Send WhatsApp Message / Reply (e.g. "tomorrow 11 is fine")');
  console.log('3. 👍 Confirm & Send Email (Type "SEND")');
  console.log('4. 📊 Inspect Current WhatsApp Session & Active Thread');
  console.log('5. 📬 View All Dispatched Email Replies in Database');
  console.log('6. 🔐 Simulate Devin Login OTP Code Email');
  console.log('7. 🧪 Simulate Custom Test Email (Offline test)');
  console.log('8. 🔄 Reset WhatsApp Session to IDLE');
  console.log('9. 🚪 Exit');
  console.log('═'.repeat(65));
}

async function main() {
  while (true) {
    await printMenu();
    const choice = (await prompt('\nSelect an option (1-8): ')).trim();

    if (choice === '1') {
      const account = await prisma.emailAccount.findFirst({
        where: { provider: 'GMAIL' },
        include: { user: true },
      });

      if (!account) {
        console.log('❌ No connected Gmail account found in DB.');
        console.log('👉 Please connect first by visiting: http://localhost:3005/auth/google');
        continue;
      }

      console.log(`\n📥 Fetching newest emails for ${account.emailAddress}...`);
      try {
        const res = await GmailSyncService.syncRecentEmails(account.id, 5);
        console.log(`✅ Synced ${res.syncedCount} email(s).`);

        const lastMsg = mockWhatsApp.getLastMessage();
        if (lastMsg) {
          console.log('\n📱 WhatsApp Notification Received:');
          console.log('─'.repeat(50));
          console.log(lastMsg.body);
          console.log('─'.repeat(50));
        } else {
          console.log('ℹ️ No new *important* emails required notification.');
        }
      } catch (err: any) {
        console.error('❌ Sync failed:', err.message);
      }
    } else if (choice === '2') {
      const text = await prompt('\nEnter your WhatsApp response (e.g. "Tomorrow 11 AM is good"): ');
      if (!text.trim()) continue;

      console.log(`\n💬 Processing WhatsApp message: "${text}"...`);
      const result = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
        from: config.CLIENT_WHATSAPP_NUMBER,
        messageId: `wa-msg-${Date.now()}`,
        text,
        timestamp: Date.now(),
      });

      console.log(`\nStatus: [${result.action}]`);
      const lastMsg = mockWhatsApp.getLastMessage();
      if (lastMsg) {
        console.log('\n📱 WhatsApp Message Response:');
        console.log('─'.repeat(50));
        console.log(lastMsg.body);
        console.log('─'.repeat(50));
      }
    } else if (choice === '3') {
      console.log(`\n👍 Confirming draft dispatch with "SEND"...`);
      const result = await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
        from: config.CLIENT_WHATSAPP_NUMBER,
        messageId: `wa-msg-confirm-${Date.now()}`,
        text: 'SEND',
        timestamp: Date.now(),
      });

      console.log(`\nStatus: [${result.action}]`);
      console.log(`Result: ${result.message}`);
      const lastMsg = mockWhatsApp.getLastMessage();
      if (lastMsg) {
        console.log('\n📱 WhatsApp Confirmation:');
        console.log('─'.repeat(50));
        console.log(lastMsg.body);
        console.log('─'.repeat(50));
      }
    } else if (choice === '4') {
      const session = await prisma.whatsappSession.findUnique({
        where: { whatsappNumber: config.CLIENT_WHATSAPP_NUMBER },
        include: { user: true },
      });

      console.log('\n📊 Current Session:');
      console.log(`   - State:          ${session?.state || 'IDLE'}`);
      console.log(`   - Active Thread:  ${session?.activeThreadId || 'None'}`);
      console.log(`   - Active Message: ${session?.activeMessageId || 'None'}`);
      console.log(`   - Pending Draft:  ${session?.generatedDraft ? '\n' + session.generatedDraft : 'None'}`);
    } else if (choice === '5') {
      const outbounds = await prisma.outboundEmail.findMany({
        orderBy: { createdAt: 'desc' },
      });

      console.log(`\n📬 Total Dispatched Emails in DB: ${outbounds.length}`);
      outbounds.forEach((o, i) => {
        console.log('\n' + '─'.repeat(50));
        console.log(`Email #${i + 1}:`);
        console.log(`To:          ${o.toEmail}`);
        console.log(`Subject:     ${o.subject}`);
        console.log(`Status:      ${o.status}`);
        console.log(`Gmail MsgID: ${o.externalSentId || 'N/A'}`);
        console.log(`Sent At:     ${o.sentAt?.toISOString() || 'N/A'}`);
        console.log(`Body:\n${o.body}`);
      });
    } else if (choice === '6') {
      const email: EmailMetadata = {
        externalMessageId: `otp-msg-${Date.now()}`,
        externalThreadId: `otp-thread-${Date.now()}`,
        rfcMessageId: `<otp-${Date.now()}@devin.ai>`,
        senderName: 'Devin',
        senderEmail: 'no-reply@devin.ai',
        recipientEmail: 'abrahamsamuelclg2028@gmail.com',
        subject: 'Your Devin Login Code',
        cleanBody: 'Verify your email address. To start using Devin, please enter the verification code: 849201. This code expires in 10 minutes.',
        receivedAt: new Date(),
      };

      console.log('\n📥 Processing Devin login code email...');
      const res = await EmailIngestionPipeline.processIncomingEmail(email);
      console.log(`\n🎯 AI Classification: ${res.isImportant ? 'IMPORTANT ✅' : 'NOT IMPORTANT ❌'} [Type: ${res.notificationType}]`);
      if (res.extractedCode) {
        console.log(`🔑 Extracted Code: ${res.extractedCode}`);
      }
      const lastMsg = mockWhatsApp.getLastMessage();
      if (lastMsg) {
        console.log('\n📱 WhatsApp Notification Sent:');
        console.log('─'.repeat(50));
        console.log(lastMsg.body);
        console.log('─'.repeat(50));
      }
    } else if (choice === '7') {
      const sender = await prompt('Sender Name: ') || 'Raj Kumar';
      const senderEmail = await prompt('Sender Email: ') || 'raj@example.com';
      const subject = await prompt('Subject: ') || 'Contract Review Meeting';
      const body = await prompt('Email Body: ') || 'Hi, can we meet tomorrow at 11 AM?';

      const email: EmailMetadata = {
        externalMessageId: `custom-msg-${Date.now()}`,
        externalThreadId: `custom-thread-${Date.now()}`,
        rfcMessageId: `<custom-${Date.now()}@test.com>`,
        senderName: sender,
        senderEmail,
        recipientEmail: 'abrahamsamuelclg2028@gmail.com',
        subject,
        cleanBody: body,
        receivedAt: new Date(),
      };

      const res = await EmailIngestionPipeline.processIncomingEmail(email);
      console.log(`\n🎯 AI Classification: ${res.isImportant ? 'IMPORTANT ✅' : 'NOT IMPORTANT ❌'} [Type: ${res.notificationType}]`);
      const lastMsg = mockWhatsApp.getLastMessage();
      if (lastMsg) {
        console.log('\n📱 WhatsApp Notification:');
        console.log(lastMsg.body);
      }
    } else if (choice === '8') {
      await prisma.whatsappSession.updateMany({
        where: { whatsappNumber: config.CLIENT_WHATSAPP_NUMBER },
        data: { state: 'IDLE', activeThreadId: null, activeMessageId: null, generatedDraft: null },
      });
      console.log('🔄 Session reset to IDLE.');
    } else if (choice === '9') {
      console.log('Goodbye!');
      rl.close();
      await prisma.$disconnect();
      process.exit(0);
    }
  }
}

main().catch(console.error);
