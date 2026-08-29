import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';

export interface SentWhatsAppMessage {
  to: string;
  body: string;
  buttons?: Array<{ id: string; title: string }>;
  timestamp: Date;
  messageId: string;
}

export class MockWhatsAppAdapter implements IWhatsAppProvider {
  private sentLog: SentWhatsAppMessage[] = [];

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const messageId = `mock-wa-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const record: SentWhatsAppMessage = {
      to,
      body,
      timestamp: new Date(),
      messageId,
    };
    this.sentLog.push(record);
    return {
      messageId,
      recipient: to,
      timestamp: record.timestamp,
      status: 'SENT',
    };
  }

  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<WhatsAppSendResult> {
    const messageId = `mock-wa-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const record: SentWhatsAppMessage = {
      to,
      body,
      buttons,
      timestamp: new Date(),
      messageId,
    };
    this.sentLog.push(record);
    return {
      messageId,
      recipient: to,
      timestamp: record.timestamp,
      status: 'SENT',
    };
  }

  parseInboundWebhook(body: any): WhatsAppInboundMessage | null {
    if (body.from && body.text) {
      return {
        from: body.from,
        messageId: body.messageId || `mock-in-${Date.now()}`,
        text: body.text,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  getLastMessage(): SentWhatsAppMessage | undefined {
    return this.sentLog[this.sentLog.length - 1];
  }

  getAllMessages(): SentWhatsAppMessage[] {
    return [...this.sentLog];
  }

  clear(): void {
    this.sentLog = [];
  }
}
