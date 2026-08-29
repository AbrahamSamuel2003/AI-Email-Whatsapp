import * as readline from 'readline';
import { GmailAuthService } from '../services/email/gmail-auth.service.js';
import { GmailSyncService } from '../services/email/gmail-sync.service.js';
import { GmailAdapter } from '../services/email/gmail.adapter.js';
import { prisma } from '../db/prisma.js';
import { config } from '../config/env.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('📬 GMAIL OAUTH 2.0 & SYNC TEST UTILITY');
  console.log('═'.repeat(60));
  console.log('1. 🔗 Generate Google OAuth 2.0 Authorization URL');
  console.log('2. 🔑 Exchange Authorization Code & Link Account');
  console.log('3. 📥 Fetch & Inspect Recent Messages from Linked Account');
  console.log('4. 🔄 Sync Recent Emails to DB & Queue');
  console.log('5. 📊 List All Connected Gmail Accounts in DB');
  console.log('6. 🚪 Exit');
  console.log('═'.repeat(60));

  while (true) {
    const choice = (await prompt('\nSelect an option (1-6): ')).trim();

    if (choice === '1') {
      try {
        const url = GmailAuthService.generateAuthUrl(config.CLIENT_WHATSAPP_NUMBER);
        console.log('\n👉 Open this URL in your browser to authorize access:');
        console.log('─'.repeat(60));
        console.log(url);
        console.log('─'.repeat(60));
        console.log('After sign in, Google will redirect to: ' + config.GOOGLE_REDIRECT_URI);
      } catch (err: any) {
        console.error('❌ Error generating Auth URL:', err.message);
      }
    } else if (choice === '2') {
      const code = (await prompt('\nPaste the authorization code (or the full redirect URL): ')).trim();
      let extractedCode = code;

      if (code.includes('code=')) {
        try {
          const parsed = new URL(code);
          extractedCode = parsed.searchParams.get('code') || code;
        } catch {
          // Keep raw
        }
      }

      try {
        console.log('Exchanging code for encrypted tokens...');
        const result = await GmailAuthService.handleOAuthCallback(extractedCode);
        console.log('✅ Success! Linked Gmail Account:');
        console.log(`   Email:        ${result.emailAddress}`);
        console.log(`   User:         ${result.displayName}`);
        console.log(`   User ID:      ${result.user.id}`);
        console.log(`   Account ID:   ${result.emailAccount.id}`);
      } catch (err: any) {
        console.error('❌ OAuth token exchange failed:', err.message);
      }
    } else if (choice === '3') {
      const account = await prisma.emailAccount.findFirst({
        where: { provider: 'GMAIL' },
      });

      if (!account) {
        console.log('❌ No connected Gmail account found in DB. Connect one using Option 1 & 2 first.');
        continue;
      }

      try {
        const authClient = await GmailAuthService.getAuthenticatedClientForAccount(account.id);
        const gmail = new GmailAdapter(authClient);

        console.log(`\nFetching recent messages for ${account.emailAddress}...`);
        const msgIds = await gmail.listRecentMessages('label:INBOX', 3);

        if (msgIds.length === 0) {
          console.log('Inbox is empty or no messages found.');
        }

        for (const id of msgIds) {
          const msg = await gmail.fetchMessage(id);
          console.log('\n' + '─'.repeat(50));
          console.log(`From:         ${msg.senderName} <${msg.senderEmail}>`);
          console.log(`Subject:      ${msg.subject}`);
          console.log(`Date:         ${msg.receivedAt.toISOString()}`);
          console.log(`Thread ID:    ${msg.externalThreadId}`);
          console.log(`RFC Msg ID:   ${msg.rfcMessageId || 'N/A'}`);
          console.log(`Snippet:      ${msg.rawSnippet}`);
          console.log(`Body (Clean): ${msg.cleanBody.slice(0, 150)}...`);
        }
      } catch (err: any) {
        console.error('❌ Error fetching messages:', err.message);
      }
    } else if (choice === '4') {
      const account = await prisma.emailAccount.findFirst({
        where: { provider: 'GMAIL' },
      });

      if (!account) {
        console.log('❌ No connected Gmail account found in DB.');
        continue;
      }

      try {
        console.log(`Syncing recent emails for ${account.emailAddress}...`);
        const res = await GmailSyncService.syncRecentEmails(account.id, 5);
        console.log(`✅ Successfully synced ${res.syncedCount} email(s) into DB & Queue.`);
      } catch (err: any) {
        console.error('❌ Sync failed:', err.message);
      }
    } else if (choice === '5') {
      const accounts = await prisma.emailAccount.findMany({
        where: { provider: 'GMAIL' },
        include: { user: true, threads: true },
      });

      console.log(`\n📊 Connected Gmail Accounts: ${accounts.length}`);
      accounts.forEach((a) => {
        console.log(`\n- Account ID:   ${a.id}`);
        console.log(`  Email:        ${a.emailAddress}`);
        console.log(`  User:         ${a.user.name} (${a.user.whatsappNumber})`);
        console.log(`  Threads:      ${a.threads.length}`);
        console.log(`  Tokens:       ${a.encryptedRefreshToken ? 'Stored & Encrypted (AES-256-GCM)' : 'No Refresh Token'}`);
      });
    } else if (choice === '6') {
      console.log('Goodbye!');
      rl.close();
      await prisma.$disconnect();
      process.exit(0);
    }
  }
}

main().catch(console.error);
