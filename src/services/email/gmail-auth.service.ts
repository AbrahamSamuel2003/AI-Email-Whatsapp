import { google, Auth } from 'googleapis';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/env.js';
import { encryptToken, decryptToken } from '../crypto/encryption.js';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export class GmailAuthService {
  /**
   * Creates a configured OAuth2 client instance
   */
  static getOAuth2Client(): Auth.OAuth2Client {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env for Google OAuth'
      );
    }

    return new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generates Google OAuth 2.0 authorization URL
   */
  static generateAuthUrl(state?: string): string {
    const oauth2Client = this.getOAuth2Client();

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent', // Forces Google Account picker and refresh token generation
      scope: GMAIL_SCOPES,
      state: state || config.CLIENT_WHATSAPP_NUMBER,
    });
  }

  /**
   * Exchanges OAuth authorization code for tokens and persists account
   */
  static async handleOAuthCallback(code: string, state?: string) {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Retrieve user profile info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const emailAddress = userInfo.data.email;
    const displayName = userInfo.data.name || 'Gmail User';

    if (!emailAddress) {
      throw new Error('Failed to retrieve user email address from Google');
    }

    let customWhatsAppNumber = state;
    let customName: string | undefined = undefined;

    if (state) {
      try {
        if (state.startsWith('{')) {
          const parsed = JSON.parse(state);
          customWhatsAppNumber = parsed.whatsapp;
          customName = parsed.name;
        }
      } catch {}
    }

    const whatsappNumber = customWhatsAppNumber || config.CLIENT_WHATSAPP_NUMBER;

    // Encrypt sensitive tokens
    const encryptedAccessToken = tokens.access_token ? encryptToken(tokens.access_token) : null;
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber },
          { email: emailAddress },
        ],
      },
    });

    const finalName = customName || existingUser?.name || displayName || 'Executive Client';

    // Find or create User
    const user = await prisma.user.upsert({
      where: { whatsappNumber },
      update: {
        name: finalName,
        email: emailAddress,
      },
      create: {
        name: finalName,
        email: emailAddress,
        whatsappNumber,
      },
    });

    // Upsert EmailAccount
    const emailAccount = await prisma.emailAccount.upsert({
      where: {
        userId_emailAddress: {
          userId: user.id,
          emailAddress,
        },
      },
      update: {
        provider: 'GMAIL',
        encryptedAccessToken,
        ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
        tokenExpiry,
      },
      create: {
        userId: user.id,
        provider: 'GMAIL',
        emailAddress,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiry,
      },
    });

    return {
      user,
      emailAccount,
      emailAddress,
      displayName,
    };
  }

  /**
   * Retrieves an authenticated OAuth2 client for an EmailAccount with auto-refresh
   */
  static async getAuthenticatedClientForAccount(emailAccountId: string): Promise<Auth.OAuth2Client> {
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });

    if (!account) {
      throw new Error(`EmailAccount ${emailAccountId} not found`);
    }

    const oauth2Client = this.getOAuth2Client();

    const accessToken = account.encryptedAccessToken
      ? decryptToken(account.encryptedAccessToken)
      : undefined;
    const refreshToken = account.encryptedRefreshToken
      ? decryptToken(account.encryptedRefreshToken)
      : undefined;

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Handle token refresh events automatically
    oauth2Client.on('tokens', async (newTokens) => {
      const updateData: any = {};
      if (newTokens.access_token) {
        updateData.encryptedAccessToken = encryptToken(newTokens.access_token);
      }
      if (newTokens.refresh_token) {
        updateData.encryptedRefreshToken = encryptToken(newTokens.refresh_token);
      }
      if (newTokens.expiry_date) {
        updateData.tokenExpiry = new Date(newTokens.expiry_date);
      }

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: updateData,
      });
    });

    return oauth2Client;
  }
}
