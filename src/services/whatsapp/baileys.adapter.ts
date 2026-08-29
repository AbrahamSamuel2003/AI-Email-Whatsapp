import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';
import { WhatsAppReplyOrchestrator } from '../state/reply-orchestrator.js';
import { config } from '../../config/env.js';
import path from 'path';
import fs from 'fs';

export class BaileysAdapter implements IWhatsAppProvider {
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private authDir: string = path.resolve(process.cwd(), 'baileys_auth');
  private initPromise: Promise<void> | null = null;
  private startTime: number = Date.now();
  private sentMessageIds: Set<string> = new Set();

  constructor() {
    this.initPromise = this.initialize();
  }

  private isBotOutput(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.startsWith('📧 *Important Email') ||
      trimmed.startsWith('🔐 *Security') ||
      trimmed.startsWith('✉️ *Reply Preview') ||
      trimmed.startsWith('✅ *Email Sent') ||
      trimmed.startsWith('👋 Hello!') ||
      trimmed.startsWith('🤖 WhatsApp') ||
      trimmed.startsWith('👉 Reply *SEND*') ||
      trimmed.startsWith('ℹ️ This is an informational alert')
    );
  }

  private async initialize(): Promise<void> {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      this.sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('\n' + '═'.repeat(60));
          console.log('📲 SCAN THIS QR CODE WITH YOUR WHATSAPP APP:');
          console.log('   (WhatsApp > Settings > Linked Devices > Link a Device)');
          console.log('═'.repeat(60) + '\n');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          this.isReady = false;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log('\n⚠️ [WhatsApp Baileys] Device was unlinked/logged out. Clearing session to generate fresh QR...');
            try {
              if (fs.existsSync(this.authDir)) {
                fs.rmSync(this.authDir, { recursive: true, force: true });
              }
            } catch {}
            setTimeout(() => this.initialize(), 1500);
          } else {
            console.log(`[WhatsApp Baileys] Reconnecting connection (code: ${statusCode || 'temp'})...`);
            setTimeout(() => this.initialize(), 2000);
          }
        } else if (connection === 'open') {
          this.isReady = true;
          this.startTime = Date.now(); // Reset start time on fresh connect
          const userJid = this.sock?.user?.id;
          console.log('\n' + '═'.repeat(60));
          console.log(`✅ [WhatsApp Baileys] Connected Successfully!`);
          console.log(`📱 Logged in as: ${userJid?.split(':')[0] || userJid}`);
          console.log('═'.repeat(60) + '\n');
        }
      });

      // Listen for incoming messages
      this.sock.ev.on('messages.upsert', async (m) => {
        // Only process live notifications, ignore bulk history sync
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (msg.key.remoteJid === 'status@broadcast') continue;

          const msgId = msg.key.id || '';
          // Ignore if this is an outbound message ID sent by our bot
          if (this.sentMessageIds.has(msgId)) continue;

          // Ignore messages sent prior to bot bootup
          const msgTimestamp = Number(msg.messageTimestamp) * 1000 || Date.now();
          if (msgTimestamp < this.startTime - 5000) continue;

          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedButtonId ||
            msg.message?.templateButtonReplyMessage?.selectedId ||
            '';

          if (!text.trim()) continue;

          // Anti-loop defense: If the text is bot-generated output, never process it as a user command!
          if (this.isBotOutput(text)) {
            continue;
          }

          const rawSender = msg.key.remoteJid || '';
          const senderPhone = '+' + rawSender.replace(/@.+/, '');

          const isFromClient =
            senderPhone.includes(config.CLIENT_WHATSAPP_NUMBER.replace(/\D/g, '')) ||
            msg.key.fromMe;

          if (isFromClient) {
            console.log(`\n💬 [WhatsApp Inbound] Received from user (${senderPhone}): "${text.trim()}"`);
            await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
              from: config.CLIENT_WHATSAPP_NUMBER,
              messageId: msgId || `baileys-msg-${Date.now()}`,
              text: text.trim(),
              timestamp: msgTimestamp,
            });
          }
        }
      });
    } catch (err: any) {
      console.error('[Baileys Init Error]', err.message);
    }
  }

  private async ensureConnection(timeoutMs: number = 30000): Promise<void> {
    if (this.isReady && this.sock?.user?.id) return;
    const start = Date.now();
    while ((!this.isReady || !this.sock?.user?.id) && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!this.sock || !this.isReady) {
      throw new Error('WhatsApp connection is not ready. Please scan the QR code first.');
    }
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    await this.ensureConnection();

    if (!this.sock) {
      throw new Error('Baileys socket is not initialized');
    }

    const cleanNumber = to.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;

    const sent = await this.sock.sendMessage(jid, { text: body });
    const messageId = sent?.key?.id || `baileys-${Date.now()}`;

    // Track bot-generated message ID to prevent self-echo loops
    this.sentMessageIds.add(messageId);

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
    const buttonPrompt = buttons.map((b) => `👉 Reply *${b.title}*`).join('\n');
    const fullText = `${body}\n\n${buttonPrompt}`;
    return this.sendTextMessage(to, fullText);
  }

  parseInboundWebhook(_body: any): WhatsAppInboundMessage | null {
    return null;
  }
}
