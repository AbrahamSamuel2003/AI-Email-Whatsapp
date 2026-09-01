import { IEmailProvider, SendResult } from './email.interface.js';
import { EmailMetadata, OutboundReplyPayload } from '../../core/types.js';

export class MockGmailAdapter implements IEmailProvider {
  private messages: Map<string, EmailMetadata> = new Map();
  private sentReplies: OutboundReplyPayload[] = [];

  constructor() {
    // Pre-populate with typical test fixture
    const initialEmail: EmailMetadata = {
      externalMessageId: 'msg-proj-meeting-001',
      externalThreadId: 'thread-proj-100',
      rfcMessageId: '<msg-proj-meeting-001@client.example.com>',
      senderName: 'Raj Kumar',
      senderEmail: 'raj.kumar@example.com',
      recipientEmail: 'client@company.com',
      subject: 'Project Meeting',
      cleanBody: 'Hi Sir,\n\nCan we have a meeting tomorrow at 11 AM to discuss the roadmap deliverables?\n\nThanks,\nRaj',
      rawSnippet: 'Can we have a meeting tomorrow at 11 AM to discuss...',
      receivedAt: new Date(),
    };
    this.messages.set(initialEmail.externalMessageId, initialEmail);
  }

  addMockEmail(email: EmailMetadata): void {
    this.messages.set(email.externalMessageId, email);
  }

  async fetchMessage(messageId: string): Promise<EmailMetadata> {
    const email = this.messages.get(messageId);
    if (!email) {
      throw new Error(`Mock email with id ${messageId} not found`);
    }
    return email;
  }

  async sendReply(payload: OutboundReplyPayload): Promise<SendResult> {
    this.sentReplies.push(payload);
    const sentId = `sent-msg-${Date.now()}`;
    return {
      externalMessageId: sentId,
      threadId: payload.threadId,
      sentAt: new Date(),
      status: 'SENT',
    };
  }

  async sendNewEmail(payload: import('../../core/types.js').OutboundNewEmailPayload): Promise<SendResult> {
    this.sentReplies.push({
      toEmail: payload.toEmail,
      subject: payload.subject,
      body: payload.body,
      threadId: `thread-mock-${Date.now()}`,
    });
    const sentId = `sent-msg-${Date.now()}`;
    return {
      externalMessageId: sentId,
      threadId: `thread-mock-${Date.now()}`,
      sentAt: new Date(),
      status: 'SENT',
    };
  }

  async getThreadMessages(threadId: string): Promise<EmailMetadata[]> {
    return Array.from(this.messages.values()).filter((m) => m.externalThreadId === threadId);
  }

  getSentReplies(): OutboundReplyPayload[] {
    return [...this.sentReplies];
  }

  clear(): void {
    this.messages.clear();
    this.sentReplies = [];
  }
}
