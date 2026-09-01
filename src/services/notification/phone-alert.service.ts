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
   * Generates or retrieves the unique NTFY topic code for a given user or phone number
   */
  static getTopicForUser(userOrPhone: { whatsappNumber?: string; ntfyTopic?: string | null } | string | null | undefined): string {
    if (!userOrPhone) {
      return config.PHONE_ALERT_TOPIC || 'ss40-alerts-broadcast';
    }
    if (typeof userOrPhone === 'string') {
      if (userOrPhone.startsWith('ss40-')) return userOrPhone.trim();
      const clean = userOrPhone.replace(/\D/g, '');
      return clean ? `ss40-alerts-${clean}` : (config.PHONE_ALERT_TOPIC || 'ss40-alerts-broadcast');
    }
    if (userOrPhone.ntfyTopic) {
      return userOrPhone.ntfyTopic.trim();
    }
    const clean = (userOrPhone.whatsappNumber || '').replace(/\D/g, '');
    return clean ? `ss40-alerts-${clean}` : (config.PHONE_ALERT_TOPIC || 'ss40-alerts-broadcast');
  }

  /**
   * Dispatches a clean push notification to the user's phone via ntfy
   */
  static async sendAlert(options: PhoneAlertOptions, targetTopic?: string): Promise<boolean> {
    const topic = targetTopic || config.PHONE_ALERT_TOPIC || 'ss40-alerts-broadcast';
    
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
        return true;
      } else {
        console.warn(`[Phone Alert Warning] Status: ${response.status}`);
        return false;
      }
    } catch (err: any) {
      console.warn(`[Phone Alert Error] ${err.message}`);
      return false;
    }
  }
}
