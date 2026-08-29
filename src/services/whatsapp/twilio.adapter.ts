import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';
import { config } from '../../config/env.js';

export class TwilioWhatsAppAdapter implements IWhatsAppProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid?: string, authToken?: string, fromNumber?: string) {
    this.accountSid = accountSid || process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = authToken || process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = fromNumber || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const cleanTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to.replace(/\s+/g, '')}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    const params = new URLSearchParams();
    params.append('To', cleanTo);
    params.append('From', this.fromNumber);
    params.append('Body', body);

    const authHeader = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Twilio WhatsApp error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as any;

    return {
      messageId: data.sid || `twilio-${Date.now()}`,
      recipient: to,
      timestamp: new Date(),
      status: 'SENT',
    };
  }

  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>
  ): Promise<WhatsAppSendResult> {
    const buttonText = buttons.map((b) => `👉 Reply *${b.title}*`).join('\n');
    return this.sendTextMessage(to, `${body}\n\n${buttonText}`);
  }

  parseInboundWebhook(body: any): WhatsAppInboundMessage | null {
    try {
      const from = body?.From ? body.From.replace('whatsapp:', '') : '';
      const text = body?.Body || '';
      const messageId = body?.MessageSid || `twilio-${Date.now()}`;

      if (!from || !text) return null;

      return {
        from: from.startsWith('+') ? from : `+${from}`,
        messageId,
        text: text.trim(),
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }
}
