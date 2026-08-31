import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';
import { WhatsAppReplyOrchestrator } from '../state/reply-orchestrator.js';
import { VoiceTranscriberService } from '../ai/voice-transcriber.service.js';
import { config } from '../../config/env.js';
import path from 'path';
import fs from 'fs';

interface UserSocketSession {
  phoneNumber: string;
  authDir: string;
  sock: WASocket | null;
  isReady: boolean;
  latestQr: string | null;
  startTime: number;
}

export class BaileysAdapter implements IWhatsAppProvider {
  private sessions: Map<string, UserSocketSession> = new Map();
  private baseAuthDir: string = path.resolve(process.cwd(), 'baileys_auth');
  private sentMessageIds: Set<string> = new Set();

  constructor() {
    this.initializeAllSessions();
  }

  private isBotOutput(text: string): boolean {
    const trimmed = text.trim();
    return (
      trimmed.startsWith('*[NEW EMAIL RECEIVED]*') ||
      trimmed.startsWith('*[SECURITY VERIFICATION CODE]*') ||
      trimmed.startsWith('*[AI EMAIL DRAFT PREVIEW]*') ||
      trimmed.startsWith('*[EMAIL SENT SUCCESSFULLY]*') ||
      trimmed.startsWith('*[SS40 NETWORK AI EMAIL ASSISTANT]*') ||
      trimmed.startsWith('*[AI EMAIL ASSISTANT]*') ||
      trimmed.startsWith('*[SESSION CLEARED]*') ||
      trimmed.startsWith('*[NOTICE]*') ||
      trimmed.startsWith('*[IMPORTANT EMAIL]*') ||
      trimmed.startsWith('*[SECURITY ALERT]*') ||
      trimmed.startsWith('*[REPLY DRAFT PREVIEW]*') ||
      trimmed.startsWith('*[Session Reset]*') ||
      trimmed.startsWith('Reply *SEND* to dispatch') ||
      trimmed.startsWith('Informational alert only') ||
      trimmed.startsWith('[Notice]')
    );
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private async initializeAllSessions(): Promise<void> {
    if (!fs.existsSync(this.baseAuthDir)) {
      fs.mkdirSync(this.baseAuthDir, { recursive: true });
    }

    // 1. Initialize default configured client
    const defaultNumber = this.cleanPhone(config.CLIENT_WHATSAPP_NUMBER);
    await this.initSessionForNumber(defaultNumber, true);

    // 2. Discover any other user sessions saved in ./baileys_auth/
    try {
      const subdirs = fs.readdirSync(this.baseAuthDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const dirName of subdirs) {
        if (dirName !== defaultNumber && /^\d+$/.test(dirName)) {
          await this.initSessionForNumber(dirName, false);
        }
      }
    } catch {}
  }

  private extractMessageText(msg: any): string {
    if (!msg?.message) return '';
    const m = msg.message;
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.buttonsResponseMessage?.selectedButtonId ||
      m.buttonsResponseMessage?.selectedDisplayText ||
      m.templateButtonReplyMessage?.selectedId ||
      m.templateButtonReplyMessage?.selectedDisplayText ||
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      m.ephemeralMessage?.message?.conversation ||
      m.ephemeralMessage?.message?.extendedTextMessage?.text ||
      m.viewOnceMessage?.message?.conversation ||
      m.viewOnceMessage?.message?.extendedTextMessage?.text ||
      ''
    );
  }

  async initSessionForNumber(phoneNumber: string, printTerminalQr: boolean = false): Promise<UserSocketSession> {
    const cleanNum = this.cleanPhone(phoneNumber);
    const existing = this.sessions.get(cleanNum);
    if (existing && existing.sock && existing.isReady) {
      return existing;
    }

    const sessionAuthDir = path.join(this.baseAuthDir, cleanNum);
    if (!fs.existsSync(sessionAuthDir)) {
      fs.mkdirSync(sessionAuthDir, { recursive: true });
    }

    const session: UserSocketSession = {
      phoneNumber: cleanNum,
      authDir: sessionAuthDir,
      sock: null,
      isReady: false,
      latestQr: null,
      startTime: Date.now(),
    };

    this.sessions.set(cleanNum, session);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionAuthDir);

      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        syncFullHistory: false, // Memory-saving optimization for KVM 1 VPS
        browser: ['AI Email Assistant', 'Chrome', '1.0.0'],
      });

      session.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          session.latestQr = qr;
          if (printTerminalQr) {
            console.log('\n' + '═'.repeat(60));
            console.log(`📲 SCAN QR CODE FOR +${cleanNum}:`);
            console.log('   (WhatsApp > Settings > Linked Devices > Link a Device)');
            console.log('═'.repeat(60) + '\n');
            qrcode.generate(qr, { small: true });
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          session.isReady = false;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log(`\n⚠️ [WhatsApp +${cleanNum}] Device unlinked. Clearing session auth...`);
            try {
              if (fs.existsSync(sessionAuthDir)) {
                fs.rmSync(sessionAuthDir, { recursive: true, force: true });
              }
            } catch {}
            setTimeout(() => this.initSessionForNumber(cleanNum, false), 1500);
          } else {
            console.log(`[WhatsApp +${cleanNum}] Reconnecting connection (code: ${statusCode || 'temp'})...`);
            setTimeout(() => this.initSessionForNumber(cleanNum, false), 2000);
          }
        } else if (connection === 'open') {
          session.isReady = true;
          session.latestQr = null;
          session.startTime = Date.now();
          const userJid = sock.user?.id;
          console.log('\n' + '═'.repeat(60));
          console.log(`✅ [WhatsApp +${cleanNum}] Connected Successfully!`);
          console.log(`📱 Logged in as: ${userJid?.split(':')[0] || userJid}`);
          console.log('═'.repeat(60) + '\n');
        }
      });

      // Listen for incoming messages (both notify and append for self-chat sync)
      sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
          const rawRemoteJid = msg.key?.remoteJid || '';
          if (!rawRemoteJid || rawRemoteJid === 'status@broadcast' || rawRemoteJid.endsWith('@g.us')) {
            continue;
          }

          const msgId = msg.key?.id || '';
          if (this.sentMessageIds.has(msgId)) continue;

          let text = this.extractMessageText(msg);

          // Check if message is a voice note / audio message
          const isAudio = Boolean(
            msg.message?.audioMessage ||
            msg.message?.ephemeralMessage?.message?.audioMessage ||
            msg.message?.viewOnceMessage?.message?.audioMessage
          );

          if (isAudio && !text) {
            try {
              console.log(`🎙️ [WhatsApp Audio] Downloading voice note from ${rawRemoteJid}...`);
              const audioBuffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
              if (audioBuffer && audioBuffer.length > 0) {
                const transcribed = await VoiceTranscriberService.transcribeAudio(audioBuffer);
                if (transcribed) {
                  text = transcribed;
                  console.log(`🎙️ [Whisper AI Transcribed]: "${text}"`);
                }
              }
            } catch (err: any) {
              console.warn('[Voice Download/Transcribe Error]', err.message);
            }
          }

          if (!text || !text.trim() || this.isBotOutput(text)) continue;

          // STRICT ZERO-INTERFERENCE PRIVACY FILTER:
          // 1. Ignore groups, broadcasts, and newsletters
          if (
            rawRemoteJid.endsWith('@g.us') ||
            rawRemoteJid.includes('@newsletter') ||
            rawRemoteJid === 'status@broadcast'
          ) {
            continue;
          }

          // 2. ONLY accept messages sent by YOU (fromMe === true)
          // Any incoming messages from friends, family, contacts, or Meta AI (fromMe === false) are ignored!
          if (!msg.key?.fromMe) {
            continue;
          }

          // 3. ONLY accept messages inside your personal "Message Yourself" / Self-Chat thread
          // Messages you send to any other person (friends, family, coworkers) are strictly ignored!
          const myUserPhone = (sock.user?.id?.split(':')[0]?.split('@')[0] || cleanNum).replace(/\D/g, '');
          const myUserLid = (
            (sock.user as any)?.lid?.split(':')[0]?.split('@')[0] ||
            (sock.authState as any)?.creds?.me?.lid?.split(':')[0]?.split('@')[0] ||
            ''
          );
          const remoteClean = rawRemoteJid.split(':')[0]?.split('@')[0]?.replace(/\D/g, '') || '';

          const isMySelfPhone = Boolean(
            (cleanNum && remoteClean === cleanNum) ||
            (myUserPhone && remoteClean === myUserPhone)
          );
          const isMySelfLid = Boolean(
            myUserLid && (rawRemoteJid.startsWith(`${myUserLid}@`) || rawRemoteJid.startsWith(`${myUserLid}:`))
          );

          // If this message was sent to another person's chat (their phone or their LID), IGNORE IT!
          if (!isMySelfPhone && !isMySelfLid) {
            continue;
          }

          // Format clean fromPhone
          let senderNum = cleanNum || myUserPhone;

          const fromPhone = `+${senderNum}`;
          const msgTimestamp = Number(msg.messageTimestamp) * 1000 || Date.now();

          console.log(`\n💬 [WhatsApp Inbound] Received from (${fromPhone}): "${text.trim()}"`);
          await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage({
            from: fromPhone,
            messageId: msgId || `baileys-msg-${Date.now()}`,
            text: text.trim(),
            timestamp: msgTimestamp,
          });
        }
      });

      return session;
    } catch (err: any) {
      console.error(`[Baileys Multi-Session Error for ${cleanNum}]`, err.message);
      return session;
    }
  }

  getLatestQrForNumber(phoneNumber: string): string | null {
    const cleanNum = this.cleanPhone(phoneNumber);
    return this.sessions.get(cleanNum)?.latestQr || null;
  }

  getActiveSessionsCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isReady) count++;
    }
    return count;
  }

  private async getReadySession(targetNumber: string, timeoutMs: number = 20000): Promise<UserSocketSession> {
    const cleanNum = this.cleanPhone(targetNumber);
    let session = this.sessions.get(cleanNum);

    if (!session) {
      session = await this.initSessionForNumber(cleanNum, false);
    }

    if (session.isReady && session.sock?.user?.id) return session;

    // Fall back to default session if target is not ready
    const defaultNum = this.cleanPhone(config.CLIENT_WHATSAPP_NUMBER);
    const defaultSession = this.sessions.get(defaultNum);
    if (defaultSession?.isReady && defaultSession.sock?.user?.id) {
      return defaultSession;
    }

    const start = Date.now();
    while ((!session.isReady || !session.sock?.user?.id) && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 600));
    }

    if (!session.sock || !session.isReady) {
      if (defaultSession?.isReady && defaultSession.sock) {
        return defaultSession;
      }
      throw new Error(`WhatsApp connection for ${targetNumber} is not ready. Please scan the QR code first.`);
    }

    return session;
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    const session = await this.getReadySession(to);

    if (!session.sock) {
      throw new Error('Baileys socket is not initialized');
    }

    const cleanNumber = this.cleanPhone(to);
    const jid = `${cleanNumber}@s.whatsapp.net`;

    const sent = await session.sock.sendMessage(jid, { text: body });
    const messageId = sent?.key?.id || `baileys-${Date.now()}`;

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
    const buttonPrompt = buttons.map((b) => `Reply *${b.title}*`).join('\n');
    const fullText = `${body}\n\n${buttonPrompt}`;
    return this.sendTextMessage(to, fullText);
  }

  parseInboundWebhook(_body: any): WhatsAppInboundMessage | null {
    return null;
  }
}
