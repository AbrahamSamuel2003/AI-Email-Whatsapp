import { config } from '../../config/env.js';

export interface PhoneAlertOptions {
  title: string;
  message: string;
  priority?: 'min' | 'low' | 'default' | 'high' | 'urgent';
  tags?: string;
  clickUrl?: string;
}

export class PhoneAlertService {
  /**
   * Dispatches a clean, concise push notification to the user's phone via ntfy
   */
  static async sendAlert(options: PhoneAlertOptions): Promise<void> {
    const topic = config.PHONE_ALERT_TOPIC || `siva-alerts-${config.CLIENT_WHATSAPP_NUMBER.replace(/\D/g, '').slice(-4)}`;
    
    // Map string priority to ntfy integer priority (1-5)
    const priorityMap: Record<string, number> = {
      min: 1,
      low: 2,
      default: 3,
      high: 4,
      urgent: 5,
    };

    const priorityVal = options.priority ? (priorityMap[options.priority] || 4) : 4;
    const tagArray = options.tags ? options.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

    try {
      const response = await fetch('https://ntfy.sh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic,
          title: options.title,
          message: options.message,
          priority: priorityVal,
          ...(tagArray.length > 0 ? { tags: tagArray } : {}),
          click: options.clickUrl || 'whatsapp://',
        }),
      });

      if (response.ok) {
        console.log(`[Phone Alert] Sent successfully to "${topic}"`);
      } else {
        console.warn(`[Phone Alert Warning] Status: ${response.status}`);
      }
    } catch (err: any) {
      console.warn(`[Phone Alert Error] ${err.message}`);
    }
  }
}
