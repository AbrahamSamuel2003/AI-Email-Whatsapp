import { EmailMetadata, OutboundReplyPayload } from '../../core/types.js';

export interface SendResult {
  externalMessageId: string;
  threadId: string;
  sentAt: Date;
  status: 'SENT' | 'FAILED';
}

export interface IEmailProvider {
  fetchMessage(messageId: string): Promise<EmailMetadata>;
  sendReply(payload: OutboundReplyPayload): Promise<SendResult>;
  getThreadMessages(threadId: string): Promise<EmailMetadata[]>;
}
