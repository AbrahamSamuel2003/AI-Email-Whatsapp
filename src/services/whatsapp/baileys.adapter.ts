import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  useMultiFileAuthState,
  WASocket,
  Browsers,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { IWhatsAppProvider, WhatsAppSendResult } from './whatsapp.interface.js';
import { WhatsAppInboundMessage } from '../../core/types.js';
import { WhatsAppReplyOrchestrator } from '../state/reply-orchestrator.js';
import { VoiceTranscriberService } from '../ai/voice-transcriber.service.js';
import { config } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import path from 'path';
import fs from 'fs';

export class BaileysAdapter implements IWhatsAppProvider {
  private baseAuthDir: string = path.resolve(process.cwd(), 'baileys_auth');
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private latestQr: string | null = null;
  private connectedPhone: string | null = null;
  private sentMessageIds: Set<string> = new Set();
  private welcomeDispatchedSet: Set<string> = new Set();

  constructor() {
    this.startSocket(true);
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

  private cleanPhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
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

  private reconnectTimer: NodeJS.Timeout | null = null;

  /**
   * Starts the single unified WASocket connection
   */
  async startSocket(printTerminalQr: boolean = true): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }

    if (!fs.existsSync(this.baseAuthDir)) {
      fs.mkdirSync(this.baseAuthDir, { recursive: true });
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.baseAuthDir);

      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        syncFullHistory: false, // Memory optimization
        browser: Browsers.macOS('Desktop'),
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
      });

      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.latestQr = qr;
          if (printTerminalQr) {
            console.log('\n' + '═'.repeat(60));
            console.log('SCAN THIS QR CODE WITH WHATSAPP ON YOUR PHONE:');
            console.log('   (WhatsApp > Settings > Linked Devices > Link a Device)');
            console.log('═'.repeat(60) + '\n');
            qrcode.generate(qr, { small: true });
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          this.isReady = false;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.log(`\n[WhatsApp] Session logged out / unlinked. Resetting auth directory...`);
            this.connectedPhone = null;
            this.latestQr = null;
            try {
              if (fs.existsSync(this.baseAuthDir)) {
                fs.rmSync(this.baseAuthDir, { recursive: true, force: true });
              }
            } catch {}
            this.reconnectTimer = setTimeout(() => this.startSocket(true), 2000);
          } else if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
            console.log(`[WhatsApp] Connection replaced by another session/process. Socket closed gracefully.`);
            try {
              sock.ev.removeAllListeners('connection.update');
              sock.ev.removeAllListeners('creds.update');
              sock.ev.removeAllListeners('messages.upsert');
              sock.end(undefined);
            } catch {}
          } else {
            console.log(`[WhatsApp] Connection closed (status: ${statusCode || 'temp'}). Reconnecting in 3s...`);
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.startSocket(false), 3000);
          }
        } else if (connection === 'open') {
          this.isReady = true;
          this.latestQr = null;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          const userJid = sock.user?.id || '';
          const detectedPhone = userJid.split(':')[0]?.split('@')[0] || '';
          this.connectedPhone = detectedPhone;

          console.log('\n' + '═'.repeat(60));
          console.log(`[WhatsApp +${detectedPhone}] Connected Successfully!`);
          console.log(`Logged in as: ${userJid.split(':')[0] || userJid}`);
          console.log('═'.repeat(60) + '\n');

          // Dynamically associate connected phone number with primary user in DB
          if (detectedPhone) {
            try {
              const formattedPhone = `+${detectedPhone}`;
              const existingUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    { whatsappNumber: formattedPhone },
                    { whatsappNumber: detectedPhone },
                  ],
                },
              });

              if (!existingUser) {
                const latestUser = await prisma.user.findFirst({
                  orderBy: { createdAt: 'desc' },
                });
                if (latestUser) {
                  await prisma.user.update({
                    where: { id: latestUser.id },
                    data: { whatsappNumber: formattedPhone },
                  });
                }
              }
            } catch (err: any) {}
          }
        }
      });

      // Listen for incoming messages
      sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
          const rawRemoteJid = msg.key?.remoteJid || '';
          if (
            !rawRemoteJid ||
            rawRemoteJid === 'status@broadcast' ||
            rawRemoteJid.endsWith('@g.us') ||
            rawRemoteJid.endsWith('@newsletter') ||
            rawRemoteJid.endsWith('@broadcast')
          ) {
            continue;
          }

          const msgId = msg.key?.id || '';
          if (this.sentMessageIds.has(msgId)) continue;

          // Zero-interference privacy filter: only accept user's own sent messages
          if (!msg.key?.fromMe) {
            continue;
          }

          // Strict Self-Chat Isolation: ONLY accept messages sent to YOURSELF (Self-Chat / Notes to Self)
          const myPhone = this.connectedPhone || (sock.user?.id?.split(':')[0]?.split('@')[0] || '').replace(/\D/g, '');
          const myJidBase = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : myPhone;
          const myLidBase = (sock.user?.lid || (sock as any).authState?.creds?.me?.lid)?.split(':')[0]?.split('@')[0];

          const chatJidBase = rawRemoteJid.split(':')[0].split('@')[0];

          const isSelfChat = 
            (myPhone && chatJidBase === myPhone) ||
            (myJidBase && chatJidBase === myJidBase) ||
            (myLidBase && chatJidBase === myLidBase);

          if (!isSelfChat) {
            // This message was sent in a chat with another person -> Ignore completely!
            continue;
          }

          let text = this.extractMessageText(msg);

          // Check for voice note audio message
          const isAudio = Boolean(
            msg.message?.audioMessage ||
            msg.message?.ephemeralMessage?.message?.audioMessage ||
            msg.message?.viewOnceMessage?.message?.audioMessage
          );

          if (isAudio && !text) {
            try {
              console.log(`[WhatsApp Audio] Downloading voice note from ${rawRemoteJid}...`);
              const audioBuffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
              if (audioBuffer && audioBuffer.length > 0) {
                const transcribed = await VoiceTranscriberService.transcribeAudio(audioBuffer);
                if (transcribed) {
                  text = transcribed;
                  console.log(`[Whisper AI Transcribed]: "${text}"`);
                }
              }
            } catch (err: any) {
              console.warn('[Voice Download/Transcribe Error]', err.message);
            }
          }

          if (!text || !text.trim() || this.isBotOutput(text)) continue;

          const senderNumber = myPhone || this.cleanPhone(config.CLIENT_WHATSAPP_NUMBER);
          console.log(`[WhatsApp Inbound Self-Chat] Received: "${text}"`);

          const inbound: WhatsAppInboundMessage = {
            messageId: msgId || `inbound-${Date.now()}`,
            from: `+${senderNumber}`,
            text: text.trim(),
            timestamp: Number(msg.messageTimestamp) * 1000 || Date.now(),
            isVoiceNote: isAudio,
          };

          try {
            await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(inbound, this);
          } catch (err: any) {
            console.error('[WhatsApp Orchestrator Error]', err.message);
          }
        }
      });
    } catch (err: any) {
      console.error('[Baileys Socket Startup Error]', err.message);
    }
  }

  getLatestQr(): string | null {
    return this.latestQr;
  }

  getLatestQrForNumber(_phone?: string): string | null {
    return this.latestQr;
  }

  isSessionReady(_phone?: string): boolean {
    return this.isReady;
  }

  getConnectedPhoneNumber(): string | null {
    return this.connectedPhone ? `+${this.connectedPhone}` : null;
  }

  async resetSession(clearCredentials: boolean = true): Promise<void> {
    try {
      console.log('[Baileys] Resetting WhatsApp session on user request...');
      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners('connection.update');
          this.sock.ev.removeAllListeners('creds.update');
          this.sock.ev.removeAllListeners('messages.upsert');
          this.sock.end(undefined);
        } catch (e) {}
        this.sock = null;
      }
      this.isReady = false;
      this.connectedPhone = null;
      this.latestQr = null;

      if (clearCredentials) {
        if (fs.existsSync(this.baseAuthDir)) {
          fs.rmSync(this.baseAuthDir, { recursive: true, force: true });
        }
      }

      await this.startSocket(false);
      // Wait for fresh QR code generation
      let waited = 0;
      while (!this.latestQr && !this.isReady && waited < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        waited += 200;
      }
    } catch (err: any) {
      console.warn('[Session Reset Warning]', err.message);
    }
  }

  async requestPairingCodeForNumber(phoneNumber: string, forceReset: boolean = false): Promise<string> {
    const cleanNum = this.cleanPhone(phoneNumber);
    if (!cleanNum) {
      throw new Error('Please enter a valid phone number with country code');
    }

    if (forceReset || (this.isReady && this.connectedPhone !== cleanNum)) {
      await this.resetSession(true);
    } else if (this.isReady) {
      throw new Error(`WhatsApp is already connected! (Phone: +${this.connectedPhone || cleanNum})`);
    }

    if (!this.sock) {
      await this.startSocket(false);
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (!this.sock) {
      throw new Error('WhatsApp connection is initializing. Please try again in a few seconds.');
    }

    // Call Baileys requestPairingCode on live socket
    const rawCode = await this.sock.requestPairingCode(cleanNum);
    const formatted = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
    console.log(`\n[WhatsApp Pairing Code] Generated for +${cleanNum}: ${formatted}\n`);
    return formatted;
  }

  async sendWelcomeGreeting(phoneNumber: string): Promise<void> {
    const cleanNum = this.cleanPhone(phoneNumber) || this.connectedPhone || (config.CLIENT_WHATSAPP_NUMBER ? this.cleanPhone(config.CLIENT_WHATSAPP_NUMBER) : '') || '';
    const formattedPhone = cleanNum ? (cleanNum.startsWith('+') ? cleanNum : `+${cleanNum}`) : (phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`);

    const user = (await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: formattedPhone },
          ...(cleanNum ? [{ whatsappNumber: cleanNum }] : []),
        ],
      },
      include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
    })) || (await prisma.user.findFirst({
      include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }));

    const session = user
      ? await prisma.whatsappSession.findFirst({
          where: { userId: user.id },
        })
      : null;

    const allAccounts: any[] = (user as any)?.emailAccounts || [];
    const clientName = user?.name || 'Client';
    const isStandardMode = (user as any)?.mode === 'STANDARD';

    const activeAccObj = (session?.activeEmailAccountId
      ? allAccounts.find((a: any) => a.id === session.activeEmailAccountId)
      : null) || allAccounts[0];

    const activeEmailStr = activeAccObj?.emailAddress || 'Connected Mailbox';

    let emailSection = '';
    let instructionsSection = '';

    if (isStandardMode) {
      emailSection = [
        `*Mode:* Standard (Minimalist)`,
        `*Active Mailbox:* \`${activeEmailStr}\``,
      ].join('\n');

      instructionsSection = [
        `*How it works:*`,
        `• When important emails arrive, you will receive notifications here automatically.`,
        `• Reply via voice note or text in any language to draft professional responses.`,
        `• One-touch SEND | EDIT | CANCEL.`,
        `• Send *SWITCH* to change your active mailbox.`,
        `• Send *SUPPORT* for direct contact channels.`,
      ].join('\n');
    } else {
      if (allAccounts.length > 1) {
        const accountLines = (allAccounts as any[]).map((acc: any, idx: number) => {
          const isCur = acc.id === activeAccObj?.id ? ' [Active]' : '';
          return `${idx + 1}. ${acc.emailAddress}${isCur}`;
        });
        emailSection = [
          `*Mode:* Executive Pro`,
          `*Connected Mailboxes (${allAccounts.length}):*`,
          ...accountLines,
          ``,
          `*Reply with 1, 2, or 3* to select which mailbox to open and monitor.`,
        ].join('\n');

        if (user) {
          await prisma.whatsappSession.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              whatsappNumber: formattedPhone,
              state: 'IDLE',
              isSelectingMailbox: true,
              activeEmailAccountId: activeAccObj?.id || allAccounts[0].id,
            },
            update: {
              isSelectingMailbox: true,
              activeEmailAccountId: activeAccObj?.id || allAccounts[0].id,
            },
          });
        }
      } else {
        emailSection = [
          `*Mode:* Executive Pro`,
          `*Connected Mail:* \`${activeEmailStr}\``,
        ].join('\n');
      }

      instructionsSection = [
        `*Commands & Instructions:*`,
        `• Send *NEW MAIL* (or voice note) to compose and send a new email.`,
        `• Send *CHECK MAIL* (or voice note) to scan your inbox.`,
        `• Send *SWITCH* to change your active mailbox.`,
        `• When an email arrives, reply via voice note or text in any language.`,
        `• Reply *SEND* to approve and dispatch in Corporate English.`,
      ].join('\n');
    }

    const welcomeLines = [
      `*[SS40 AI EMAIL ASSISTANT ACTIVATED]*`,
      `───────────────────────────`,
      `Hi *${clientName}*,`,
      ``,
      `Your AI Assistant is active and monitoring your mailbox.`,
      ``,
      emailSection,
      `*Connected WhatsApp:* \`${formattedPhone}\``,
      `───────────────────────────`,
      instructionsSection,
      `───────────────────────────`,
      `*Company:* SS40 Network`,
      `*Support:* ${config.ADMIN_SUPPORT_EMAIL}`,
      `*Portal:* ${config.SS40_PORTAL_URL}`,
      `───────────────────────────`,
    ];

    await this.sendTextMessage(formattedPhone, welcomeLines.join('\n'));
  }

  getActiveSessionsCount(): number {
    return this.isReady ? 1 : 0;
  }

  async sendTextMessage(to: string, body: string): Promise<WhatsAppSendResult> {
    if (!this.sock || !this.isReady) {
      // Wait up to 10s if socket is establishing
      const start = Date.now();
      while ((!this.sock || !this.isReady) && Date.now() - start < 10000) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!this.sock || !this.isReady) {
      throw new Error(`WhatsApp connection is not ready. Please scan the QR code first.`);
    }

    let cleanNumber = this.cleanPhone(to) || this.connectedPhone;
    const myUserPhone = (this.sock.user?.id?.split(':')[0]?.split('@')[0] || '').replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 10) {
      if (myUserPhone && myUserPhone.length >= 10) {
        cleanNumber = myUserPhone;
      }
    }

    const jid = `${cleanNumber}@s.whatsapp.net`;
    console.log(`[WhatsApp Outbound] Sending message to ${jid}...`);

    const sent = await this.sock.sendMessage(jid, { text: body });
    const messageId = sent?.key?.id || `baileys-${Date.now()}`;
    this.sentMessageIds.add(messageId);

    return {
      messageId,
      recipient: to,
      status: 'SENT',
      timestamp: new Date(),
    };
  }

  async sendInteractiveMessage(
    to: string,
    body: string,
    _buttons: Array<{ id: string; title: string }>
  ): Promise<WhatsAppSendResult> {
    return this.sendTextMessage(to, body);
  }

  parseInboundWebhook(body: any): WhatsAppInboundMessage | null {
    if (body?.from && (body?.text || body?.body)) {
      return {
        messageId: body.messageId || body.id || `baileys-in-${Date.now()}`,
        from: body.from,
        text: (body.text || body.body || '').trim(),
        timestamp: Number(body.timestamp) || Date.now(),
        isVoiceNote: Boolean(body.isVoiceNote),
      };
    }
    return null;
  }
}
