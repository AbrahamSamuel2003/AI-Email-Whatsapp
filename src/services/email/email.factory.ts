import { IEmailProvider } from './email.interface.js';
import { GmailAdapter } from './gmail.adapter.js';
import { MockGmailAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';

export class EmailFactory {
  private static instance: IEmailProvider;

  static getProvider(accessToken?: string, refreshToken?: string): IEmailProvider {
    if (!this.instance) {
      if (config.EMAIL_PROVIDER === 'gmail' && config.GOOGLE_CLIENT_ID && accessToken) {
        this.instance = new GmailAdapter(accessToken, refreshToken);
      } else {
        this.instance = new MockGmailAdapter();
      }
    }
    return this.instance;
  }

  static setProvider(provider: IEmailProvider): void {
    this.instance = provider;
  }
}
