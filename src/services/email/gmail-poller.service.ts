import { prisma } from '../../db/prisma.js';
import { GmailSyncService } from './gmail-sync.service.js';
import { config } from '../../config/env.js';

export class GmailPollerService {
  private static timer: NodeJS.Timeout | null = null;
  private static isPolling: boolean = false;

  static start(intervalSeconds: number = 10): void {
    if (this.timer) {
      console.log('ℹ️ [Gmail Poller] Already running.');
      return;
    }

    const intervalMs = intervalSeconds * 1000;
    console.log(`\n🔄 [Gmail Poller] Automated real-time polling activated (checking every ${intervalSeconds}s)...`);

    // Run first sync immediately after 2 seconds
    setTimeout(() => {
      this.pollAllAccounts();
    }, 2000);

    this.timer = setInterval(() => {
      this.pollAllAccounts();
    }, intervalMs);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('🛑 [Gmail Poller] Stopped.');
    }
  }

  static async pollAllAccounts(): Promise<void> {
    if (this.isPolling) return; // Prevent overlapping runs
    this.isPolling = true;

    try {
      const gmailAccounts = await prisma.emailAccount.findMany({
        where: {
          provider: 'GMAIL',
          NOT: { encryptedAccessToken: null },
        },
      });

      for (const account of gmailAccounts) {
        try {
          const res = await GmailSyncService.syncRecentEmails(account.id, 5);
          if (res.syncedCount > 0) {
            console.log(`⚡ [Gmail Poller] Auto-detected and processed ${res.syncedCount} new email(s) for ${account.emailAddress}!`);
          }
        } catch (err: any) {
          // Log only unexpected errors, silent on no-change
          if (!err.message?.includes('invalid_grant')) {
            console.warn(`[Gmail Poller] Sync error for ${account.emailAddress}:`, err.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[Gmail Poller Error]', err.message);
    } finally {
      this.isPolling = false;
    }
  }
}
