import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { config } from '../config/env.js';
import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { TaskQueueManager } from '../queue/task-queue.js';
import { prisma } from '../db/prisma.js';
import { GmailAuthService } from '../services/email/gmail-auth.service.js';
import { GmailSyncService } from '../services/email/gmail-sync.service.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await server.register(cors);
  await server.register(sensible);

  // Health Check
  server.get('/health', async () => {
    return {
      status: 'ok',
      service: 'ai-email-whatsapp-connect',
      timestamp: new Date().toISOString(),
    };
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
    const format = query.format;

    try {
      const authUrl = GmailAuthService.generateAuthUrl(customWhatsApp);

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

  // Handles Google OAuth callback
  server.get('/auth/google/callback', async (request, reply) => {
    const query = request.query as any;
    const code = query.code;
    const state = query.state; // Contains WhatsApp number

    if (!code) {
      return reply.code(400).send({ error: 'Missing authorization code from Google' });
    }

    try {
      const result = await GmailAuthService.handleOAuthCallback(code, state);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Account Connected</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 480px; text-align: center; border: 1px solid #334155; }
            .badge { background: #10b981; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; display: inline-block; margin-bottom: 1rem; }
            h2 { margin: 0 0 10px; color: #f8fafc; }
            p { color: #94a3b8; line-height: 1.5; }
            .details { background: #0f172a; padding: 1rem; border-radius: 8px; text-align: left; margin: 1.5rem 0; font-family: monospace; font-size: 0.85rem; }
            .details div { margin-bottom: 5px; }
            .details strong { color: #38bdf8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">Connected Successfully</div>
            <h2>Gmail Account Linked</h2>
            <p>Your Gmail account has been securely connected and tokens are encrypted.</p>
            <div class="details">
              <div><strong>Account:</strong> ${result.emailAddress}</div>
              <div><strong>User:</strong> ${result.displayName}</div>
              <div><strong>WhatsApp:</strong> ${result.user.whatsappNumber}</div>
              <div><strong>Status:</strong> Ready for Sync & Reply</div>
            </div>
            <p style="font-size: 0.85rem;">You can now close this tab and return to the terminal or simulator.</p>
          </div>
        </body>
        </html>
      `;

      return reply.type('text/html').send(html);
    } catch (err: any) {
      server.log.error(`OAuth callback error: ${err.message}`);
      return reply.code(500).send({
        error: 'OAuth token exchange failed',
        message: err.message,
      });
    }
  });

  // -------------------------------------------------------------
  // Gmail Sync & Watch Endpoints
  // -------------------------------------------------------------

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
