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
    console.log(`\n[Gmail Poller] Automated real-time polling activated (checking every ${intervalSeconds}s)...`);

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
      console.log('[Gmail Poller] Stopped.');
    }
  }

  static async pollAllAccounts(): Promise<void> {
    if (this.isPolling) return; // Prevent overlapping runs
    this.isPolling = true;

    try {
      // 1. Poll Gmail OAuth accounts
      const gmailAccounts = await prisma.emailAccount.findMany({
        where: {
          provider: 'GMAIL',
          NOT: [
            { encryptedAccessToken: null },
            { emailAddress: { startsWith: 'oauth-test-' } },
          ],
        },
      });

      for (const account of gmailAccounts) {
        try {
          const res = await GmailSyncService.syncRecentEmails(account.id, 5);
          if (res.syncedCount > 0) {
            console.log(`[Gmail Poller] Auto-detected and processed ${res.syncedCount} new email(s) for ${account.emailAddress}!`);
          }
        } catch (err: any) {
          const { AuditLogger } = await import('../logging/audit-logger.service.js');
          AuditLogger.error('GMAIL_SYNC', `Sync error for ${account.emailAddress}`, err, {
            email: account.emailAddress,
          });

          if (err.message?.includes('Insufficient Permission')) {
            console.warn(`[Gmail Poller] ${account.emailAddress} is missing Gmail OAuth permissions. Re-link at http://localhost:3005/?step=2 and check permission boxes.`);
          } else if (!err.message?.includes('invalid_grant')) {
            console.warn(`[Gmail Poller] Sync error for ${account.emailAddress}:`, err.message);
          }
        }
      }

      // 2. Poll Custom Business Email / Zoho / Outlook IMAP accounts
      const imapAccounts = await prisma.emailAccount.findMany({
        where: {
          provider: 'IMAP_SMTP',
          NOT: [{ encryptedPassword: null }],
        },
      });

      for (const account of imapAccounts) {
        try {
          const { ImapSmtpService } = await import('./imap-smtp.service.js');
          const res = await ImapSmtpService.syncRecentEmails(account.id, 5);
          if (res.syncedCount > 0) {
            console.log(`[IMAP Poller] Auto-detected and processed ${res.syncedCount} new email(s) for ${account.emailAddress}!`);
          }
        } catch (err: any) {
          const { AuditLogger } = await import('../logging/audit-logger.service.js');
          AuditLogger.error('GMAIL_SYNC', `IMAP sync error for ${account.emailAddress}`, err, {
            email: account.emailAddress,
          });
          console.warn(`[IMAP Poller] Sync error for ${account.emailAddress}:`, err.message);
        }
      }
    } catch (err: any) {
      const { AuditLogger } = await import('../logging/audit-logger.service.js');
      AuditLogger.error('GMAIL_SYNC', 'Email Poller Loop Exception', err);
      console.error('[Email Poller Error]', err.message);
    } finally {
      this.isPolling = false;
    }
  }
}
