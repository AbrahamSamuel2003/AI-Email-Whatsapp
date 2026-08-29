import { prisma } from '../db/prisma.js';
import { GmailAuthService } from '../services/email/gmail-auth.service.js';
import { GmailAdapter } from '../services/email/gmail.adapter.js';
import { GeminiAIAdapter } from '../services/ai/gemini.adapter.js';
import { config } from '../config/env.js';

async function analyze15Emails() {
  console.log('\n' + '═'.repeat(75));
  console.log('🤖 AI EMAIL IMPORTANCE REPORT — ANALYZING 15 REAL GMAIL INBOX EMAILS');
  console.log(`⚡ Model: [${config.AI_MODEL_NAME}] via Live Google Gemini API`);
  console.log('═'.repeat(75) + '\n');

  // 1. Resolve live Gmail Account
  let account = await prisma.emailAccount.findFirst({
    where: {
      provider: 'GMAIL',
      NOT: { encryptedAccessToken: null },
      emailAddress: { not: 'oauth-test@gmail.com' },
    },
    include: { user: true },
  });

  if (!account) {
    account = await prisma.emailAccount.findFirst({
      where: {
        provider: 'GMAIL',
        NOT: { encryptedAccessToken: null },
      },
      include: { user: true },
    });
  }

  if (!account || !account.encryptedAccessToken) {
    console.log('❌ No authenticated Gmail account found in DB.');
    console.log('👉 Please open http://localhost:3005/auth/google in your browser to authorize access in 5 seconds.');
    return;
  }

  console.log(`📬 Connected Mailbox: ${account.emailAddress} (${account.user.name})`);
  console.log('🔄 Fetching latest 15 messages from Gmail inbox...\n');

  const authClient = await GmailAuthService.getAuthenticatedClientForAccount(account.id);
  const gmailAdapter = new GmailAdapter(authClient);
  const geminiAI = new GeminiAIAdapter(config.GEMINI_API_KEY, config.AI_MODEL_NAME);

  const messageIds = await gmailAdapter.listRecentMessages('label:INBOX', 15);

  if (messageIds.length === 0) {
    console.log('Inbox is empty.');
    return;
  }

  console.log(`Found ${messageIds.length} emails. Running Gemini AI importance analysis...\n`);

  let importantCount = 0;
  let notImportantCount = 0;
  const results = [];

  for (let i = 0; i < messageIds.length; i++) {
    const id = messageIds[i];
    let success = false;

    while (!success) {
      try {
        const email = await gmailAdapter.fetchMessage(id);
        const analysis = await geminiAI.classifyImportance(email);

        if (analysis.isImportant) {
          importantCount++;
        } else {
          notImportantCount++;
        }

        results.push({
          num: i + 1,
          sender: email.senderName ? `${email.senderName} (${email.senderEmail})` : email.senderEmail,
          senderEmail: email.senderEmail,
          subject: email.subject,
          date: email.receivedAt.toLocaleDateString('en-GB') + ' ' + email.receivedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          isImportant: analysis.isImportant,
          summary: analysis.summary,
          reason: analysis.reasoning,
          urgency: analysis.urgency,
          actionRequired: analysis.actionRequired,
        });

        console.log(`[${i + 1}/${messageIds.length}] Analyzed: "${email.subject.slice(0, 45)}..." ➔ ${analysis.isImportant ? '🟢 IMPORTANT' : '🔴 NOT IMPORTANT'}`);
        success = true;

        // Pacing delay (13s) to stay strictly within 5 RPM free tier limit
        if (i < messageIds.length - 1) {
          await new Promise((r) => setTimeout(r, 13000));
        }
      } catch (err: any) {
        if (err.message?.includes('429') || err.status === 429) {
          console.log(`⏳ Rate limit reached. Pausing 15s before retrying email #${i + 1}...`);
          await new Promise((r) => setTimeout(r, 15000));
        } else {
          console.error(`Error processing email ${id}:`, err.message);
          break;
        }
      }
    }
  }

  // Print Detailed Report
  console.log('\n' + '═'.repeat(75));
  console.log('📋 DETAILED GEMINI AI CLASSIFICATION REPORT FOR 15 EMAILS');
  console.log('═'.repeat(75));

  for (const r of results) {
    console.log('\n' + '─'.repeat(75));
    console.log(`📧 #${r.num} | ${r.isImportant ? '🟢 IMPORTANT' : '🔴 NOT IMPORTANT'} [Urgency: ${r.urgency}]`);
    console.log(`   From:     ${r.sender}`);
    console.log(`   Subject:  ${r.subject}`);
    console.log(`   Date:     ${r.date}`);
    console.log(`   Summary:  ${r.summary}`);
    console.log(`   Reason:   ${r.reason}`);
    if (r.actionRequired) {
      console.log(`   Action:   👉 ${r.actionRequired}`);
    }
    console.log(`   WhatsApp: ${r.isImportant ? '✅ Will Alert on WhatsApp' : '🚫 Filtered (No Alert)'}`);
  }

  console.log('\n' + '═'.repeat(75));
  console.log('📊 ACCURACY & SUMMARY STATS:');
  console.log(`   Total Emails:            ${results.length}`);
  console.log(`   🟢 Important (Alerted):   ${importantCount} (${((importantCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   🔴 Filtered (Silenced):   ${notImportantCount} (${((notImportantCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`   Noise Reduction Rate:    ${((notImportantCount / results.length) * 100).toFixed(1)}%`);
  console.log('═'.repeat(75) + '\n');
}

analyze15Emails()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
