import { IWhatsAppProvider } from './whatsapp.interface.js';
import { WhatsAppCloudAdapter } from './cloud-api.adapter.js';
import { BaileysAdapter } from './baileys.adapter.js';
import { TwilioWhatsAppAdapter } from './twilio.adapter.js';
import { MockWhatsAppAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';

export class WhatsAppFactory {
  private static instance: IWhatsAppProvider;

  static getProvider(): IWhatsAppProvider {
    if (!this.instance) {
      const providerType = config.WHATSAPP_PROVIDER.toLowerCase();

      switch (providerType) {
        case 'baileys':
          this.instance = new BaileysAdapter();
          break;
        case 'cloud_api':
          this.instance = new WhatsAppCloudAdapter();
          break;
        case 'twilio':
          this.instance = new TwilioWhatsAppAdapter();
          break;
        case 'mock':
        default:
          this.instance = new MockWhatsAppAdapter();
          break;
      }
    }
    return this.instance;
  }

  static setProvider(provider: IWhatsAppProvider): void {
    this.instance = provider;
  }
}
