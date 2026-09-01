import { prisma } from '../../db/prisma.js';
import { ImapSmtpAdapter, ImapSmtpConfig } from './imap-smtp.adapter.js';
import { EmailIngestionPipeline } from './ingestion-pipeline.js';
import { encryptToken } from '../crypto/encryption.js';

export interface EmailServerPreset {
  providerName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
}

export class ImapSmtpService {
  /**
   * Auto-detects server settings based on email domain and live DNS MX records
   */
  static async detectServerPreset(emailAddress: string): Promise<EmailServerPreset> {
    const domain = (emailAddress.split('@')[1] || '').toLowerCase().trim();

    if (domain.includes('zoho.in')) {
      return {
        providerName: 'Zoho Mail (India)',
        imapHost: 'imap.zoho.in',
        imapPort: 993,
        smtpHost: 'smtp.zoho.in',
        smtpPort: 465,
      };
    }

    if (domain.includes('zoho')) {
      return {
        providerName: 'Zoho Mail (Global)',
        imapHost: 'imap.zoho.com',
        imapPort: 993,
        smtpHost: 'smtp.zoho.com',
        smtpPort: 465,
      };
    }

    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('office365')) {
      return {
        providerName: 'Microsoft Outlook / Office 365',
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
      };
    }

    if (domain.includes('gmail')) {
      return {
        providerName: 'Google Workspace (App Password)',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 465,
      };
    }

    // Live DNS MX Lookup for Custom Business Domains (e.g. ss40network.com)
    if (domain && domain.includes('.')) {
      try {
        const dns = await import('dns');
        const mxRecords = await dns.promises.resolveMx(domain);
        const mxString = JSON.stringify(mxRecords).toLowerCase();

        if (mxString.includes('zoho.in')) {
          return {
            providerName: 'Zoho Mail (India - Custom Domain)',
            imapHost: 'imap.zoho.in',
            imapPort: 993,
            smtpHost: 'smtp.zoho.in',
            smtpPort: 465,
          };
        }

        if (mxString.includes('zoho')) {
          return {
            providerName: 'Zoho Mail (Global - Custom Domain)',
            imapHost: 'imap.zoho.com',
            imapPort: 993,
            smtpHost: 'smtp.zoho.com',
            smtpPort: 465,
          };
        }

        if (mxString.includes('google') || mxString.includes('googlemail')) {
          return {
            providerName: 'Google Workspace (Custom Domain)',
            imapHost: 'imap.gmail.com',
            imapPort: 993,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
          };
        }

        if (mxString.includes('outlook') || mxString.includes('office365')) {
          return {
            providerName: 'Microsoft 365 (Custom Domain)',
            imapHost: 'outlook.office365.com',
            imapPort: 993,
            smtpHost: 'smtp.office365.com',
            smtpPort: 587,
          };
        }

        if (mxString.includes('hostinger')) {
          return {
            providerName: 'Hostinger (Custom Domain)',
            imapHost: 'imap.hostinger.com',
            imapPort: 993,
            smtpHost: 'smtp.hostinger.com',
            smtpPort: 465,
          };
        }
      } catch {}
    }

    // Default Custom Business Domain
    return {
      providerName: 'Custom Business Domain',
      imapHost: `mail.${domain || 'example.com'}`,
      imapPort: 993,
      smtpHost: `mail.${domain || 'example.com'}`,
      smtpPort: 465,
    };
  }

  /**
   * Connects and saves a custom IMAP & SMTP mailbox
   */
  static async connectMailbox(params: {
    userId: string;
    emailAddress: string;
    password: string;
    imapHost?: string;
    imapPort?: number;
    imapUser?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
  }) {
    const preset = await this.detectServerPreset(params.emailAddress);

    const imapHost = params.imapHost || preset.imapHost;
    const imapPort = params.imapPort || preset.imapPort;
    const smtpHost = params.smtpHost || preset.smtpHost;
    const smtpPort = params.smtpPort || preset.smtpPort;
    const imapUser = params.imapUser || params.emailAddress;
    const smtpUser = params.smtpUser || params.emailAddress;
    const encryptedPassword = encryptToken(params.password);

    const config: ImapSmtpConfig = {
      emailAddress: params.emailAddress,
      imapHost,
      imapPort,
      imapUser,
      smtpHost,
      smtpPort,
      smtpUser,
      encryptedPassword,
    };

    // 1. Verify connection credentials
    const verification = await ImapSmtpAdapter.verifyConnection(config);
    if (!verification.imap || !verification.smtp) {
      throw new Error(verification.error || 'Failed to authenticate IMAP/SMTP server. Please check your email, host, and app password.');
    }

    // 2. Upsert EmailAccount
    const emailAccount = await prisma.emailAccount.upsert({
      where: {
        userId_emailAddress: {
          userId: params.userId,
          emailAddress: params.emailAddress,
        },
      },
      update: {
        provider: 'IMAP_SMTP',
        imapHost,
        imapPort,
        imapUser,
        smtpHost,
        smtpPort,
        smtpUser,
        encryptedPassword,
      },
      create: {
        userId: params.userId,
        provider: 'IMAP_SMTP',
        emailAddress: params.emailAddress,
        imapHost,
        imapPort,
        imapUser,
        smtpHost,
        smtpPort,
        smtpUser,
        encryptedPassword,
      },
    });

    return { success: true, emailAccount };
  }

  /**
   * Syncs recent emails from an IMAP account and ingests into pipeline
   */
  static async syncRecentEmails(
    accountId: string,
    maxEmails: number = 10,
    isQuiet: boolean = false
  ): Promise<{ syncedCount: number; emails: any[] }> {
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId },
      include: { user: true },
    });

    if (!account || !account.encryptedPassword || !account.imapHost || !account.smtpHost) {
      throw new Error(`IMAP account ${accountId} is missing required connection details`);
    }

    const adapter = new ImapSmtpAdapter({
      emailAddress: account.emailAddress,
      imapHost: account.imapHost,
      imapPort: account.imapPort || 993,
      imapUser: account.imapUser || account.emailAddress,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort || 465,
      smtpUser: account.smtpUser || account.emailAddress,
      encryptedPassword: account.encryptedPassword,
    });

    const recentEmails = await adapter.fetchRecentEmails(maxEmails);
    const processedEmails = [];

    const isInitialSync = !account.syncCursor;
    const quietMode = isQuiet || isInitialSync;

    for (const emailMeta of recentEmails) {
      const result = await EmailIngestionPipeline.processIncomingEmail(
        emailMeta,
        account.userId,
        quietMode
      );
      processedEmails.push(result);
    }

    if (isInitialSync) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { syncCursor: new Date().toISOString() },
      });
    }

    return {
      syncedCount: processedEmails.length,
      emails: processedEmails,
    };
  }
}
