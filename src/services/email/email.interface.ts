import { EmailMetadata, OutboundNewEmailPayload, OutboundReplyPayload } from '../../core/types.js';

export interface SendResult {
  externalMessageId: string;
  threadId: string;
  sentAt: Date;
  status: 'SENT' | 'FAILED';
}

export interface IEmailProvider {
  fetchMessage(messageId: string): Promise<EmailMetadata>;
  sendReply(payload: OutboundReplyPayload): Promise<SendResult>;
  sendNewEmail(payload: OutboundNewEmailPayload): Promise<SendResult>;
  getThreadMessages(threadId: string): Promise<EmailMetadata[]>;
}
