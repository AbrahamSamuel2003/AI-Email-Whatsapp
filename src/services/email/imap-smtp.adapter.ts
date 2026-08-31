import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { IEmailProvider, SendResult } from './email.interface.js';
import { EmailMetadata, OutboundReplyPayload } from '../../core/types.js';
import { decryptToken } from '../crypto/encryption.js';

export interface ImapSmtpConfig {
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUser?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  encryptedPassword: string;
}

export class ImapSmtpAdapter implements IEmailProvider {
  private config: ImapSmtpConfig;
  private plainPassword: string;

  constructor(config: ImapSmtpConfig) {
    this.config = config;
    this.plainPassword = decryptToken(config.encryptedPassword);
  }

  private getImapClient(): ImapFlow {
    return new ImapFlow({
      host: this.config.imapHost,
      port: this.config.imapPort || 993,
      secure: this.config.imapPort === 993 || this.config.imapPort === 465,
      auth: {
        user: this.config.imapUser || this.config.emailAddress,
        pass: this.plainPassword,
      },
      logger: false,
    });
  }

  private getSmtpTransporter(): nodemailer.Transporter {
    const isSecure = this.config.smtpPort === 465;
    return nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort || 465,
      secure: isSecure,
      auth: {
        user: this.config.smtpUser || this.config.emailAddress,
        pass: this.plainPassword,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  /**
   * Fetches recent unread or latest emails from the IMAP inbox
   */
  async fetchRecentEmails(maxCount: number = 10): Promise<EmailMetadata[]> {
    const client = this.getImapClient();
    const results: EmailMetadata[] = [];

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Fetch the latest N messages by sequence
      const mailbox = client.mailbox;
      const totalMessages = typeof mailbox === 'object' && mailbox !== null ? mailbox.exists : 0;
      if (totalMessages === 0) {
        return [];
      }

      const startSeq = Math.max(1, totalMessages - maxCount + 1);
      const range = `${startSeq}:*`;

      for await (const message of client.fetch(range, { source: true, envelope: true, uid: true })) {
        if (!message.source) continue;

        const parsed = await simpleParser(message.source);
        const externalId = message.uid ? String(message.uid) : (parsed.messageId || `imap-${Date.now()}`);
        const rfcMessageId = parsed.messageId || undefined;
        const threadId = parsed.inReplyTo || rfcMessageId || externalId;

        const sender = parsed.from?.value?.[0];
        const senderEmail = sender?.address || this.config.emailAddress;
        const senderName = sender?.name || senderEmail.split('@')[0];
        const subject = parsed.subject || '(No Subject)';
        const cleanBody = (parsed.text || parsed.html || '').trim();

        results.push({
          externalMessageId: externalId,
          externalThreadId: threadId,
          rfcMessageId,
          inReplyTo: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : undefined,
          references: Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references,
          senderEmail,
          senderName,
          recipientEmail: this.config.emailAddress,
          subject,
          cleanBody,
          rawSnippet: cleanBody.slice(0, 150),
          receivedAt: parsed.date || new Date(),
        });
      }
    } finally {
      lock.release();
      await client.logout();
    }

    return results.reverse();
  }

  async fetchMessage(messageId: string): Promise<EmailMetadata> {
    const recent = await this.fetchRecentEmails(25);
    const found = recent.find((m) => m.externalMessageId === messageId);
    if (!found) {
      throw new Error(`IMAP message ${messageId} not found in recent inbox fetch`);
    }
    return found;
  }

  async getThreadMessages(threadId: string): Promise<EmailMetadata[]> {
    const recent = await this.fetchRecentEmails(25);
    return recent.filter((m) => m.externalThreadId === threadId);
  }

  /**
   * Dispatches outbound reply via SMTP with conversation threading headers
   */
  async sendReply(payload: OutboundReplyPayload): Promise<SendResult> {
    const transporter = this.getSmtpTransporter();

    const headers: Record<string, string> = {};
    if (payload.inReplyToMessageId) {
      headers['In-Reply-To'] = payload.inReplyToMessageId;
    }
    if (payload.references) {
      headers['References'] = payload.references;
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${this.config.emailAddress.split('@')[0]}" <${this.config.emailAddress}>`,
      to: payload.toEmail,
      subject: payload.subject.startsWith('Re:') ? payload.subject : `Re: ${payload.subject}`,
      text: payload.body,
      headers,
    };

    const info = await transporter.sendMail(mailOptions);

    return {
      externalMessageId: info.messageId || `smtp-${Date.now()}`,
      threadId: payload.threadId,
      sentAt: new Date(),
      status: 'SENT',
    };
  }

  /**
   * Handshake tester to verify IMAP & SMTP credentials
   */
  static async verifyConnection(config: ImapSmtpConfig): Promise<{ imap: boolean; smtp: boolean; error?: string }> {
    const plainPassword = decryptToken(config.encryptedPassword);

    // 1. Verify IMAP
    let imapOk = false;
    try {
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort || 993,
        secure: config.imapPort === 993 || config.imapPort === 465,
        auth: {
          user: config.imapUser || config.emailAddress,
          pass: plainPassword,
        },
        logger: false,
      });
      await client.connect();
      await client.logout();
      imapOk = true;
    } catch (err: any) {
      return { imap: false, smtp: false, error: `IMAP connection failed: ${err.message}` };
    }

    // 2. Verify SMTP
    let smtpOk = false;
    try {
      const isSecure = config.smtpPort === 465;
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 465,
        secure: isSecure,
        auth: {
          user: config.smtpUser || config.emailAddress,
          pass: plainPassword,
        },
        tls: { rejectUnauthorized: false },
      });
      await transporter.verify();
      smtpOk = true;
    } catch (err: any) {
      return { imap: true, smtp: false, error: `SMTP verification failed: ${err.message}` };
    }

    return { imap: imapOk, smtp: smtpOk };
  }
}
