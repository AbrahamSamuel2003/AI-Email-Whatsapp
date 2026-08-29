import { google, gmail_v1, Auth } from 'googleapis';
import { IEmailProvider, SendResult } from './email.interface.js';
import { EmailMetadata, OutboundReplyPayload } from '../../core/types.js';
import { config } from '../../config/env.js';

export class GmailAdapter implements IEmailProvider {
  private gmail: gmail_v1.Gmail;
  private authClient: Auth.OAuth2Client;

  constructor(authOrAccessToken?: string | Auth.OAuth2Client, refreshToken?: string) {
    if (typeof authOrAccessToken === 'object' && authOrAccessToken !== null) {
      this.authClient = authOrAccessToken;
    } else {
      this.authClient = new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        config.GOOGLE_REDIRECT_URI
      );

      if (authOrAccessToken || refreshToken) {
        this.authClient.setCredentials({
          access_token: authOrAccessToken as string | undefined,
          refresh_token: refreshToken,
        });
      }
    }

    this.gmail = google.gmail({ version: 'v1', auth: this.authClient });
  }

  /**
   * Helper to recursively extract text body from MIME multipart message
   */
  private extractBodyFromPayload(payload?: gmail_v1.Schema$MessagePart): string {
    if (!payload) return '';

    // Direct body data
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Traverse parts
    if (payload.parts && payload.parts.length > 0) {
      // Prioritize text/plain
      const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
      if (textPart && textPart.body?.data) {
        return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }

      // Check text/html if plain text is absent
      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
      if (htmlPart && htmlPart.body?.data) {
        const rawHtml = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
        // Simple HTML strip for clean text
        return rawHtml
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Recursive check nested parts
      for (const part of payload.parts) {
        const extracted = this.extractBodyFromPayload(part);
        if (extracted) return extracted;
      }
    }

    return '';
  }

  async fetchMessage(messageId: string): Promise<EmailMetadata> {
    const res = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const msg = res.data;
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject') || '(No Subject)';
    const from = getHeader('From') || '';
    const to = getHeader('To') || '';
    const rfcMessageId = getHeader('Message-ID') || '';
    const inReplyTo = getHeader('In-Reply-To') || '';
    const references = getHeader('References') || '';

    // Extract sender name and email
    let senderName = '';
    let senderEmail = from;
    const match = from.match(/^(.*?)\s*<(.+?)>$/);
    if (match) {
      senderName = match[1].replace(/^["']|["']$/g, '').trim();
      senderEmail = match[2].trim();
    }

    let cleanBody = this.extractBodyFromPayload(msg.payload) || msg.snippet || '';

    return {
      externalMessageId: msg.id || messageId,
      externalThreadId: msg.threadId || messageId,
      rfcMessageId,
      inReplyTo,
      references,
      senderName,
      senderEmail,
      recipientEmail: to,
      subject,
      cleanBody: cleanBody.trim(),
      rawSnippet: msg.snippet || '',
      receivedAt: new Date(Number(msg.internalDate) || Date.now()),
    };
  }

  async listRecentMessages(query?: string, maxResults: number = 10): Promise<string[]> {
    const res = await this.gmail.users.messages.list({
      userId: 'me',
      q: query || 'label:INBOX',
      maxResults,
    });

    const messages = res.data.messages || [];
    return messages.map((m) => m.id!).filter(Boolean);
  }

  async sendReply(payload: OutboundReplyPayload): Promise<SendResult> {
    const utf8Subject = `=?utf-8?B?${Buffer.from(payload.subject).toString('base64')}?=`;

    const messageParts = [
      `To: ${payload.toEmail}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      `Content-Transfer-Encoding: 7bit`,
    ];

    if (payload.inReplyToMessageId) {
      messageParts.push(`In-Reply-To: ${payload.inReplyToMessageId}`);
    }
    if (payload.references) {
      messageParts.push(`References: ${payload.references}`);
    }

    messageParts.push('', payload.body);
    const rawMessage = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const isHexThreadId = /^[0-9a-fA-F]{16}$/.test(payload.threadId);
    const requestBody: any = { raw: encodedMessage };
    if (isHexThreadId) {
      requestBody.threadId = payload.threadId;
    }

    const res = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody,
    });

    return {
      externalMessageId: res.data.id || `gmail-${Date.now()}`,
      threadId: res.data.threadId || payload.threadId,
      sentAt: new Date(),
      status: 'SENT',
    };
  }

  async getThreadMessages(threadId: string): Promise<EmailMetadata[]> {
    const res = await this.gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const messages = res.data.messages || [];
    return messages.map((msg) => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const from = getHeader('From');
      let senderName = '';
      let senderEmail = from;
      const match = from.match(/^(.*?)\s*<(.+?)>$/);
      if (match) {
        senderName = match[1].replace(/^["']|["']$/g, '').trim();
        senderEmail = match[2].trim();
      }

      return {
        externalMessageId: msg.id || '',
        externalThreadId: threadId,
        rfcMessageId: getHeader('Message-ID'),
        inReplyTo: getHeader('In-Reply-To'),
        references: getHeader('References'),
        senderName,
        senderEmail,
        recipientEmail: getHeader('To'),
        subject: getHeader('Subject'),
        cleanBody: this.extractBodyFromPayload(msg.payload) || msg.snippet || '',
        rawSnippet: msg.snippet || '',
        receivedAt: new Date(Number(msg.internalDate) || Date.now()),
      };
    });
  }

  /**
   * Sets up Gmail push notifications with Google Cloud Pub/Sub
   */
  async watchMailbox(topicName: string): Promise<{ historyId: string; expiration: string }> {
    const res = await this.gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName,
        labelIds: ['INBOX'],
      },
    });

    return {
      historyId: res.data.historyId || '',
      expiration: res.data.expiration || '',
    };
  }

  /**
   * Stops Gmail push notification watch
   */
  async stopWatch(): Promise<void> {
    await this.gmail.users.stop({
      userId: 'me',
    });
  }

  /**
   * Fetches new messages added since a specific history ID
   */
  async fetchHistoryDeltas(startHistoryId: string): Promise<string[]> {
    const res = await this.gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
    });

    const messageIds: string[] = [];
    const histories = res.data.history || [];

    for (const record of histories) {
      if (record.messagesAdded) {
        for (const added of record.messagesAdded) {
          if (added.message?.id) {
            messageIds.push(added.message.id);
          }
        }
      }
    }

    return Array.from(new Set(messageIds));
  }
}
