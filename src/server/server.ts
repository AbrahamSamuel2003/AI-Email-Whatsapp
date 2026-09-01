import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { config } from '../config/env.js';
import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { TaskQueueManager } from '../queue/task-queue.js';
import { prisma } from '../db/prisma.js';
import { GmailAuthService } from '../services/email/gmail-auth.service.js';
import { GmailSyncService } from '../services/email/gmail-sync.service.js';
import { PhoneAlertService } from '../services/notification/phone-alert.service.js';
import { getOnboardingHtml } from './onboarding-ui.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await server.register(cors);
  await server.register(sensible);

  // Onboarding Portal UI
  server.get('/', async (request, reply) => {
    const query = request.query as any;
    const phone = query.whatsapp || query.phone || config.CLIENT_WHATSAPP_NUMBER;
    return reply
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type('text/html')
      .send(getOnboardingHtml(phone));
  });

  server.get('/connect', async (request, reply) => {
    const query = request.query as any;
    const phone = query.whatsapp || query.phone || config.CLIENT_WHATSAPP_NUMBER;
    return reply
      .header('Cache-Control', 'no-cache, no-store, must-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .type('text/html')
      .send(getOnboardingHtml(phone));
  });

  // Liveness Check
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'ai-email-whatsapp-connect',
      timestamp: new Date().toISOString(),
    };
  });

  // Deep Dependency Health Check (Database, WhatsApp, Gmail, Memory)
  server.get('/health/deep', async (_req, reply) => {
    const { LogAuditorAgent } = await import('../services/monitoring/log-auditor.agent.js');
    const audit = await LogAuditorAgent.auditSystemHealth();
    const statusCode = audit.status === 'CRITICAL' ? 503 : 200;
    return reply.code(statusCode).send(audit);
  });

  // Diagnostics & Incident Audit API
  server.get('/api/diagnostics', async () => {
    const { LogAuditorAgent } = await import('../services/monitoring/log-auditor.agent.js');
    return LogAuditorAgent.auditSystemHealth();
  });

  // System Status & Connected Accounts
  server.get('/api/status', async () => {
    const userCount = await prisma.user.count();
    const threadCount = await prisma.emailThread.count();
    const messageCount = await prisma.emailMessage.count();
    const outboundCount = await prisma.outboundEmail.count();
    const emailAccounts = await prisma.emailAccount.findMany({
      include: { user: true },
    });
    const activeSessions = await prisma.whatsappSession.findMany({
      include: { user: true },
    });

    return {
      status: 'active',
      providers: {
        ai: config.AI_PROVIDER,
        email: config.EMAIL_PROVIDER,
        whatsapp: config.WHATSAPP_PROVIDER,
      },
      stats: {
        users: userCount,
        threads: threadCount,
        emails: messageCount,
        outboundReplies: outboundCount,
      },
      emailAccounts: emailAccounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        emailAddress: a.emailAddress,
        userName: a.user.name,
        whatsappNumber: a.user.whatsappNumber,
        hasAccessToken: Boolean(a.encryptedAccessToken),
        hasRefreshToken: Boolean(a.encryptedRefreshToken),
        tokenExpiry: a.tokenExpiry,
        syncCursor: a.syncCursor,
      })),
      activeSessions: activeSessions.map((s) => ({
        whatsappNumber: s.whatsappNumber,
        userName: s.user.name,
        state: s.state,
        activeThreadId: s.activeThreadId,
        updatedAt: s.updatedAt,
      })),
    };
  });

  // -------------------------------------------------------------
  // Google OAuth 2.0 Endpoints
  // -------------------------------------------------------------

  // Initiates Google OAuth consent flow
  server.get('/auth/google', async (request, reply) => {
    const query = request.query as any;
    const customWhatsApp = query.whatsapp || config.CLIENT_WHATSAPP_NUMBER;
    const customName = query.name || undefined;
    const format = query.format;

    try {
      const statePayload = JSON.stringify({ whatsapp: customWhatsApp, name: customName });
      const authUrl = GmailAuthService.generateAuthUrl(statePayload);

      if (format === 'json') {
        return reply.code(200).send({ authUrl });
      }

      return reply.redirect(authUrl);
    } catch (err: any) {
      return reply.code(500).send({
        error: 'Failed to generate Google OAuth URL',
        message: err.message,
        hint: 'Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are configured in .env',
      });
    }
  });

  // Authenticates or Registers User Identity (Full Name & WhatsApp Mobile Number Credentials)
  server.post('/api/user/profile', async (request, reply) => {
    const body = (request.body as any) || {};
    const name = body.name?.trim();
    const phone = (body.whatsappNumber || body.phone || '').trim();

    if (!name || !phone) {
      return reply.code(400).send({
        success: false,
        error: 'Please enter both Full Name and Mobile Number.',
      });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone ? (phone.startsWith('+') ? phone : `+${cleanPhone}`) : phone;

    // Search for existing user with this mobile number
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: formattedPhone },
          { whatsappNumber: cleanPhone },
          ...(cleanPhone.length >= 10 ? [{ whatsappNumber: { endsWith: cleanPhone.slice(-10) } }] : []),
        ],
      },
      include: { emailAccounts: true },
    });

    if (existingUser) {
      // If user exists, strictly verify that the Full Name matches the registered name
      const isMatch = existingUser.name.trim().toLowerCase() === name.trim().toLowerCase();
      if (!isMatch) {
        return reply.code(403).send({
          success: false,
          error: 'Access Denied',
        });
      }

      return reply.code(200).send({
        success: true,
        isNewUser: false,
        name: existingUser.name,
        phone: existingUser.whatsappNumber,
      });
    } else {
      // First time registration: create new user database record with all capabilities
      const newUser = await prisma.user.create({
        data: {
          name: name.trim(),
          email: `${cleanPhone || Date.now()}@connect.ss40network.com`,
          whatsappNumber: formattedPhone,
          mode: 'STANDARD',
        } as any,
      });

      return reply.code(200).send({
        success: true,
        isNewUser: true,
        name: newUser.name,
        phone: newUser.whatsappNumber,
      });
    }
  });

  // Handles Google OAuth callback
  server.get('/auth/google/callback', async (request, reply) => {
    const query = request.query as any;
    const code = query.code;
    const state = query.state; // Contains WhatsApp number

    if (!code) {
      return reply.code(400).send({ error: 'Missing authorization code from Google' });
    }

    try {
      await GmailAuthService.handleOAuthCallback(code, state);
      // Redirect back to Onboarding Portal Step 3 cleanly without exposing numbers in URL
      return reply.redirect('/?step=3');
    } catch (err: any) {
      server.log.error(`OAuth callback error: ${err.message}`);
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Sign-In Expired</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0F172A; color: #F8FAFC; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 2rem; max-width: 440px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
            h3 { color: #38BDF8; margin-top: 0; }
            p { color: #94A3B8; font-size: 0.9rem; line-height: 1.5; }
            .btn { display: inline-block; background: #0F766E; color: #FFFFFF; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 8px; font-weight: 600; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>Authorization Code Expired</h3>
            <p>This Google sign-in authorization code was already processed or expired. Please click below to authorize your mailbox fresh.</p>
            <a href="/?step=2" class="btn">Return to Step 2 & Sign In with Google</a>
          </div>
        </body>
        </html>
      `);
    }
  });

  // Detect IMAP/SMTP server presets by email domain
  server.post('/api/email/detect-preset', async (request, reply) => {
    const body = (request.body as any) || {};
    const emailAddress = body.emailAddress || '';
    const { ImapSmtpService } = await import('../services/email/imap-smtp.service.js');
    const preset = await ImapSmtpService.detectServerPreset(emailAddress);
    return reply.code(200).send(preset);
  });

  // Verify IMAP & SMTP connection before saving
  server.post('/api/email/verify-smtp', async (request, reply) => {
    const body = (request.body as any) || {};
    const { ImapSmtpAdapter } = await import('../services/email/imap-smtp.adapter.js');
    const { encryptToken } = await import('../services/crypto/encryption.js');

    try {
      const encryptedPassword = encryptToken(body.password || '');
      const result = await ImapSmtpAdapter.verifyConnection({
        emailAddress: body.emailAddress,
        imapHost: body.imapHost,
        imapPort: Number(body.imapPort) || 993,
        imapUser: body.imapUser || body.emailAddress,
        smtpHost: body.smtpHost,
        smtpPort: Number(body.smtpPort) || 465,
        smtpUser: body.smtpUser || body.emailAddress,
        encryptedPassword,
      });

      if (!result.imap || !result.smtp) {
        return reply.code(400).send({ success: false, error: result.error });
      }

      return reply.code(200).send({ success: true, message: 'IMAP & SMTP connection verified successfully!' });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // Connect Custom IMAP/SMTP Email Account
  server.post('/api/email/connect-smtp', async (request, reply) => {
    const body = (request.body as any) || {};
    const { ImapSmtpService } = await import('../services/email/imap-smtp.service.js');

    try {
      let user = await prisma.user.findFirst({
        orderBy: { updatedAt: 'desc' },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            name: body.userName || 'Executive Client',
            email: body.emailAddress,
            whatsappNumber: body.whatsappNumber || config.CLIENT_WHATSAPP_NUMBER,
          },
        });
      }

      const result = await ImapSmtpService.connectMailbox({
        userId: user.id,
        emailAddress: body.emailAddress,
        password: body.password,
        imapHost: body.imapHost,
        imapPort: Number(body.imapPort) || 993,
        imapUser: body.imapUser,
        smtpHost: body.smtpHost,
        smtpPort: Number(body.smtpPort) || 465,
        smtpUser: body.smtpUser,
      });

      return reply.code(200).send({
        success: true,
        emailAddress: result.emailAccount.emailAddress,
        provider: result.emailAccount.provider,
        message: 'Custom business email connected and monitoring active!',
      });
    } catch (err: any) {
      return reply.code(400).send({
        success: false,
        error: err.message,
      });
    }
  });

  // Trigger manual sync of recent Gmail inbox messages
  server.post('/gmail/sync', async (request, reply) => {
    const body = (request.body as any) || {};
    let accountId = body.emailAccountId;

    if (!accountId) {
      const account = await prisma.emailAccount.findFirst({
        where: { provider: 'GMAIL' },
      });
      if (!account) {
        return reply.code(404).send({
          error: 'No connected Gmail account found',
          hint: 'Connect a Gmail account first via http://localhost:3000/auth/google',
        });
      }
      accountId = account.id;
    }

    try {
      const result = await GmailSyncService.syncRecentEmails(accountId, body.maxEmails || 10);
      return reply.code(200).send({
        status: 'sync_completed',
        emailAccountId: accountId,
        ...result,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Sync failed', message: err.message });
    }
  });

  // Trigger Gmail Pub/Sub push watch
  server.post('/gmail/watch', async (request, reply) => {
    const body = (request.body as any) || {};
    const topicName = body.topicName;

    if (!topicName) {
      return reply.code(400).send({ error: 'Missing required field "topicName" (Google Cloud Pub/Sub topic)' });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { provider: 'GMAIL' },
    });

    if (!account) {
      return reply.code(404).send({ error: 'No connected Gmail account found' });
    }

    try {
      const watchRes = await GmailSyncService.enableMailboxWatch(account.id, topicName);
      return reply.code(200).send({ status: 'watch_enabled', ...watchRes });
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to enable watch', message: err.message });
    }
  });

  // Gmail Push Notification Webhook (Google Cloud Pub/Sub push receiver)
  server.post('/webhooks/gmail', async (request, reply) => {
    const body = request.body as any;
    const messageData = body?.message?.data;

    if (messageData) {
      try {
        const decoded = Buffer.from(messageData, 'base64').toString('utf-8');
        const json = JSON.parse(decoded);
        const historyId = json.historyId;
        const emailAddress = json.emailAddress;

        if (emailAddress && historyId) {
          server.log.info(`Received Gmail push notification for ${emailAddress} (historyId: ${historyId})`);
          await GmailSyncService.handleHistoryPush(emailAddress, String(historyId));
        }
      } catch (err: any) {
        server.log.error(`Failed to process Gmail push webhook: ${err.message}`);
      }
    }

    return reply.code(200).send({ status: 'ack' });
  });

  // -------------------------------------------------------------
  // Multi-User WhatsApp QR & Session Management
  // -------------------------------------------------------------
  server.get('/whatsapp/qr', async (request, reply) => {
    const query = request.query as any;
    const phone = query.phone || config.CLIENT_WHATSAPP_NUMBER;
    const provider = WhatsAppFactory.getProvider() as any;

    if (typeof provider.getLatestQrForNumber !== 'function') {
      return reply.code(400).send({ error: 'QR login is only available when WHATSAPP_PROVIDER=baileys' });
    }

    // Initialize session if not existing
    if (typeof provider.initSessionForNumber === 'function') {
      await provider.initSessionForNumber(phone, false);
    }

    const qrString = provider.getLatestQrForNumber(phone);

    if (!qrString) {
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head><title>WhatsApp Connected</title><style>body{font-family:sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;} .card{background:#1e293b;padding:2rem;border-radius:12px;text-align:center;}</style></head>
        <body><div class="card"><h2>WhatsApp Connected</h2><p>Session for <strong>${phone}</strong> is active and connected!</p></div></body></html>
      `);
    }

    // Render HTML page with live QR generator script
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Scan WhatsApp QR - ${phone}</title>
        <meta http-equiv="refresh" content="5">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 16px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); max-width: 420px; border: 1px solid #334155; }
          #qrcode { background: #fff; padding: 16px; border-radius: 12px; display: inline-block; margin: 1.5rem 0; }
          h2 { margin: 0 0 8px; font-size: 1.4rem; color: #38bdf8; }
          p { color: #94a3b8; font-size: 0.9rem; margin: 0.5rem 0; }
          .badge { background: #10b981; color: #fff; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">Multi-User Session</span>
          <h2>Link WhatsApp</h2>
          <p>Scan with WhatsApp on: <strong>${phone}</strong></p>
          <div id="qrcode"></div>
          <p>Open WhatsApp ➔ Linked Devices ➔ Link a Device</p>
          <p style="font-size:0.75rem;color:#64748b;">Auto-refreshing every 5 seconds...</p>
        </div>
        <script>
          new QRCode(document.getElementById("qrcode"), {
            text: ${JSON.stringify(qrString)},
            width: 256,
            height: 256
          });
        </script>
      </body>
      </html>
    `;

    return reply.type('text/html').send(html);
  });

  // API to fetch QR Data as JSON for UI components
  server.get('/api/whatsapp/qr-data', async (request, reply) => {
    const provider = WhatsAppFactory.getProvider() as any;

    if (typeof provider.getLatestQr !== 'function' && typeof provider.getLatestQrForNumber !== 'function') {
      return reply.code(200).send({ qr: null, connected: true });
    }

    let qr = typeof provider.getLatestQr === 'function' ? provider.getLatestQr() : provider.getLatestQrForNumber();
    const isReady = typeof provider.isSessionReady === 'function' ? provider.isSessionReady() : false;
    const connectedPhone = typeof provider.getConnectedPhoneNumber === 'function' ? provider.getConnectedPhoneNumber() : null;

    if (!qr && !isReady) {
      const start = Date.now();
      while (!qr && !provider.isSessionReady() && Date.now() - start < 3500) {
        await new Promise((r) => setTimeout(r, 200));
        qr = typeof provider.getLatestQr === 'function' ? provider.getLatestQr() : provider.getLatestQrForNumber();
      }
    }

    return reply.code(200).send({
      qr,
      connected: isReady,
      connectedPhone,
    });
  });

  // API to generate 8-Digit Pairing Code on demand
  server.post('/api/whatsapp/pairing-code', async (request, reply) => {
    const body = (request.body as any) || {};
    const phone = body.phone || config.CLIENT_WHATSAPP_NUMBER;
    const forceReset = Boolean(body.forceReset);
    const provider = WhatsAppFactory.getProvider() as any;

    if (typeof provider.requestPairingCodeForNumber !== 'function') {
      return reply.code(400).send({ error: 'Pairing code is only available when WHATSAPP_PROVIDER=baileys' });
    }

    try {
      const code = await provider.requestPairingCodeForNumber(phone, forceReset);
      return reply.code(200).send({ status: 'ok', phone, code });
    } catch (err: any) {
      return reply.code(200).send({ status: 'error', message: err.message, code: null });
    }
  });

  // API to reset WhatsApp session and generate fresh QR / Pairing Code
  server.post('/api/whatsapp/reset-session', async (_request, reply) => {
    const provider = WhatsAppFactory.getProvider() as any;
    if (typeof provider.resetSession === 'function') {
      await provider.resetSession(true);
    }
    try {
      await prisma.whatsappSession.deleteMany({});
    } catch (e) {}
    return reply.code(200).send({ status: 'ok', message: 'WhatsApp session reset. Generating fresh QR/Pairing...' });
  });

  // API to check user connection status (Gmail & WhatsApp)
  server.get('/api/user/status', async (request, reply) => {
    const provider = WhatsAppFactory.getProvider() as any;
    const whatsappConnected = typeof provider.isSessionReady === 'function'
      ? provider.isSessionReady()
      : (typeof provider.getActiveSessionsCount === 'function' ? provider.getActiveSessionsCount() > 0 : true);
    const connectedPhone = typeof provider.getConnectedPhoneNumber === 'function'
      ? provider.getConnectedPhoneNumber()
      : null;

    const query = (request.query as any) || {};
    const queryPhone = (query.whatsapp || query.phone || '').trim();

    let user = null;
    if (queryPhone) {
      const cleanQ = queryPhone.replace(/\D/g, '');
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { whatsappNumber: queryPhone },
            ...(cleanQ ? [{ whatsappNumber: `+${cleanQ}` }, { whatsappNumber: cleanQ }] : []),
            ...(cleanQ.length >= 10 ? [{ whatsappNumber: { endsWith: cleanQ.slice(-10) } }] : []),
          ],
        },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      });
    }

    // Find the active connected Email account (Gmail or IMAP_SMTP)
    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        OR: [
          { provider: 'GMAIL', encryptedAccessToken: { not: null } },
          { provider: 'GMAIL', encryptedRefreshToken: { not: null } },
          { provider: 'IMAP_SMTP', encryptedPassword: { not: null } },
        ],
        ...(user ? { userId: user.id } : {}),
      },
      include: { user: { include: { emailAccounts: { orderBy: { createdAt: 'asc' } } } } },
      orderBy: { updatedAt: 'desc' },
    });

    if (!user) {
      user = emailAccount?.user || (await prisma.user.findFirst({
        orderBy: { updatedAt: 'desc' },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      }));
    }

    const allAccounts = (user as any)?.emailAccounts || (emailAccount ? [emailAccount] : []);

    return reply.code(200).send({
      whatsappNumber: connectedPhone || user?.whatsappNumber || config.CLIENT_WHATSAPP_NUMBER,
      userName: user?.name || 'Executive Client',
      mode: (user as any)?.mode || 'ADVANCED',
      emailConnected: Boolean(emailAccount || allAccounts.length > 0),
      emailAddress: emailAccount?.emailAddress || allAccounts[0]?.emailAddress || null,
      provider: emailAccount?.provider || allAccounts[0]?.provider || 'GMAIL',
      emailAccounts: allAccounts.map((a: any) => ({
        id: a.id,
        email: a.emailAddress,
        provider: a.provider,
      })),
      whatsappConnected,
      ntfyTopic: PhoneAlertService.getTopicForUser(user || connectedPhone || config.CLIENT_WHATSAPP_NUMBER),
      timestamp: new Date().toISOString(),
    });
  });

  // API to send a test push notification to user's NTFY mobile app
  server.post('/api/user/test-ntfy', async (request, reply) => {
    const body = (request.body as any) || {};
    const topic = body.topic?.trim() || PhoneAlertService.getTopicForUser(body.whatsapp || config.CLIENT_WHATSAPP_NUMBER);
    const title = body.title || 'SS40 Push Alert Connected';
    const message = body.message || 'Push alerts connected. Real-time email and AI notifications are active.';

    const sent = await PhoneAlertService.sendAlert(
      {
        title,
        message,
        priority: 'high',
        clickUrl: 'whatsapp://',
      },
      topic
    );

    return reply.code(200).send({
      success: sent,
      topic,
      message: sent ? 'Test push notification sent successfully.' : 'Failed to send notification to ntfy server.',
    });
  });

  // API to update user Assistant Mode (STANDARD vs ADVANCED)
  server.post('/api/user/mode', async (request, reply) => {
    const body = (request.body as any) || {};
    const mode = (body.mode || '').toUpperCase();
    if (mode !== 'STANDARD' && mode !== 'ADVANCED') {
      return reply.code(400).send({ error: 'Invalid mode. Allowed values: STANDARD, ADVANCED' });
    }

    const updated = await (prisma.user as any).updateMany({
      data: { mode },
    });

    if (updated.count === 0) {
      const defaultPhone = config.CLIENT_WHATSAPP_NUMBER || '+1234567890';
      const clean = defaultPhone.replace(/\D/g, '');
      await prisma.user.create({
        data: {
          whatsappNumber: defaultPhone,
          email: `${clean || Date.now()}@connect.ss40network.com`,
          name: 'Client',
          mode: mode,
        } as any,
      });
    }

    return reply.code(200).send({ success: true, mode });
  });

  // API to dispatch welcome greeting to WhatsApp
  server.post('/api/user/welcome', async (request, reply) => {
    const body = (request.body as any) || {};
    const provider = WhatsAppFactory.getProvider() as any;
    const connectedPhone = typeof provider.getConnectedPhoneNumber === 'function' ? provider.getConnectedPhoneNumber() : null;

    let whatsapp = body.whatsapp || connectedPhone;
    if (!whatsapp) {
      const user = await prisma.user.findFirst({ orderBy: { updatedAt: 'desc' } });
      whatsapp = user?.whatsappNumber || config.CLIENT_WHATSAPP_NUMBER;
    }

    if (typeof provider.sendWelcomeGreeting === 'function') {
      await provider.sendWelcomeGreeting(whatsapp);
      return reply.code(200).send({ status: 'dispatched', whatsapp });
    }

    return reply.code(200).send({ status: 'mock_dispatched', whatsapp });
  });

  // Enable Pub/Sub watch for all connected Gmail accounts
  server.post('/gmail/watch/all', async (request, reply) => {
    const body = (request.body as any) || {};
    const topicName = body.topicName || config.GMAIL_PUBSUB_TOPIC;

    if (!topicName) {
      return reply.code(400).send({
        error: 'Missing topicName',
        hint: 'Provide "topicName" in request body or set GMAIL_PUBSUB_TOPIC in .env',
      });
    }

    const accounts = await prisma.emailAccount.findMany({
      where: { provider: 'GMAIL' },
    });

    const results = [];
    for (const account of accounts) {
      try {
        const res = await GmailSyncService.enableMailboxWatch(account.id, topicName);
        results.push({ emailAddress: account.emailAddress, status: 'watching', ...res });
      } catch (err: any) {
        results.push({ emailAddress: account.emailAddress, status: 'failed', error: err.message });
      }
    }

    return reply.code(200).send({
      status: 'watch_batch_completed',
      topicName,
      totalAccounts: accounts.length,
      results,
    });
  });

  // -------------------------------------------------------------
  // WhatsApp Webhooks & Simulation
  // -------------------------------------------------------------

  // WhatsApp Webhook Verification
  server.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as any;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).send(challenge);
    }
    return reply.code(403).send('Verification failed');
  });

  // WhatsApp Inbound Webhook
  server.post('/webhooks/whatsapp', async (request, reply) => {
    const body = request.body as any;
    const whatsappProvider = WhatsAppFactory.getProvider();
    const inbound = whatsappProvider.parseInboundWebhook(body);

    if (inbound) {
      await TaskQueueManager.enqueueWhatsApp(inbound);
    }

    return reply.code(200).send({ status: 'received' });
  });

  // Manual Trigger Endpoint for simulating email ingestion via REST
  server.post('/api/simulate/email', async (request, reply) => {
    const email = request.body as any;
    if (!email.subject || !email.cleanBody || !email.senderEmail) {
      return reply.code(400).send({ error: 'Missing required email fields' });
    }

    const emailPayload = {
      externalMessageId: email.externalMessageId || `sim-msg-${Date.now()}`,
      externalThreadId: email.externalThreadId || `sim-thread-${Date.now()}`,
      rfcMessageId: email.rfcMessageId || `<${Date.now()}@example.com>`,
      senderName: email.senderName || 'Sender',
      senderEmail: email.senderEmail,
      recipientEmail: email.recipientEmail || 'client@company.com',
      subject: email.subject,
      cleanBody: email.cleanBody,
      receivedAt: new Date(),
    };

    await TaskQueueManager.enqueueEmail(emailPayload);
    return reply.code(200).send({ status: 'enqueued', email: emailPayload });
  });

  return server;
}
