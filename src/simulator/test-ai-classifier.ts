import { prisma } from '../db/prisma.js';
import { AIFactory } from '../services/ai/ai.factory.js';
import { config } from '../config/env.js';

async function runClassifierTest() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧠 PHASE 3: AI EMAIL IMPORTANCE CLASSIFIER TEST REPORT');
  console.log(`⚡ Active AI Provider: [${config.AI_PROVIDER.toUpperCase()}]`);
  console.log('═'.repeat(70));

  const messages = await prisma.emailMessage.findMany({
    include: { thread: true },
    orderBy: { receivedAt: 'desc' },
  });

  if (messages.length === 0) {
    console.log('No messages found in DB. Run "npm run verify:sync" to sync emails first.');
    return;
  }

  const aiProvider = AIFactory.getProvider();
  let importantCount = 0;
  let filteredCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const emailMeta = {
      externalMessageId: msg.externalMessageId,
      externalThreadId: msg.thread.externalThreadId,
      rfcMessageId: msg.rfcMessageId || undefined,
      senderName: msg.senderName || undefined,
      senderEmail: msg.senderEmail,
      recipientEmail: msg.recipientEmail,
      subject: msg.subject,
      cleanBody: msg.cleanBody,
      receivedAt: msg.receivedAt,
    };

    const classification = await aiProvider.classifyImportance(emailMeta);

    if (classification.isImportant) {
      importantCount++;
    } else {
      filteredCount++;
    }

    console.log('\n' + '─'.repeat(70));
    console.log(`📧 Email #${i + 1}:`);
    console.log(`   From:        ${msg.senderName ? msg.senderName + ' ' : ''}<${msg.senderEmail}>`);
    console.log(`   Subject:     ${msg.subject}`);
    console.log(`   Date:        ${msg.receivedAt.toISOString()}`);
    console.log(`\n   🎯 AI Evaluation:`);
    console.log(`   • Result:     ${classification.isImportant ? '🟢 IMPORTANT' : '🔴 NOT_IMPORTANT'}`);
    console.log(`   • Summary:    "${classification.summary}"`);
    console.log(`   • Reason:     ${classification.reasoning}`);
    console.log(`   • Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
    console.log(`   • Urgency:    ${classification.urgency}`);
    console.log(`   • WhatsApp:   ${classification.isImportant ? '✅ Dispatched to WhatsApp' : '🚫 Ignored Silently (No spam to WhatsApp)'}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`📊 SUMMARY METRICS:`);
  console.log(`   Total Emails Analyzed: ${messages.length}`);
  console.log(`   ✅ Important (Alerted): ${importantCount}`);
  console.log(`   🚫 Filtered (Silenced): ${filteredCount}`);
  console.log(`   Noise Reduction Rate:  ${((filteredCount / messages.length) * 100).toFixed(1)}%`);
  console.log('═'.repeat(70) + '\n');
}

runClassifierTest().finally(async () => {
  await prisma.$disconnect();
});
