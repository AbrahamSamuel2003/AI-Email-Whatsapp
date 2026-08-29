import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';
import { config } from '../../config/env.js';

export class WhatsAppCloudAdapter implements IWhatsAppProvider {
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string = 'v20.0';

  constructor(phoneNumberId?: string, accessToken?: string) {
    this.phoneNumberId = phoneNumberId || config.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = accessToken || config.WHATSAPP_ACCESS_TOKEN || '';
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const cleanTo = to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { body },
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`WhatsApp Cloud API error (${res.status}): ${errorData}`);
    }

    const data = (await res.json()) as any;
    const messageId = data?.messages?.[0]?.id || `wa-msg-${Date.now()}`;

    return {
      messageId,
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
    const cleanTo = to.replace(/\D/g, '');
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Fallback to text message if interactive fails
      return this.sendTextMessage(to, body);
    }

    const data = (await res.json()) as any;
    const messageId = data?.messages?.[0]?.id || `wa-msg-${Date.now()}`;

    return {
      messageId,
      recipient: to,
      timestamp: new Date(),
      status: 'SENT',
    };
  }

  parseInboundWebhook(body: any): WhatsAppInboundMessage | null {
    try {
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) return null;

      let text = '';
      if (message.type === 'text') {
        text = message.text?.body || '';
      } else if (message.type === 'interactive') {
        text = message.interactive?.button_reply?.title || message.interactive?.button_reply?.id || '';
      }

      return {
        from: `+${message.from}`,
        messageId: message.id,
        text: text.trim(),
        timestamp: Number(message.timestamp) || Date.now(),
      };
    } catch {
      return null;
    }
  }
}
