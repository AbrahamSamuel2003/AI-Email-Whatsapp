import { WhatsAppInboundMessage } from '../../core/types.js';

export interface WhatsAppSendResult {
  messageId: string;
  recipient: string;
  timestamp: Date;
  status: 'SENT' | 'FAILED';
}

export interface IWhatsAppProvider {
  sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult>;
  sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<WhatsAppSendResult>;
  parseInboundWebhook(body: any): WhatsAppInboundMessage | null;
}
