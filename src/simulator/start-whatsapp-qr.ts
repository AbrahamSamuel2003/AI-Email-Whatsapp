import { WhatsAppFactory } from '../services/whatsapp/whatsapp.factory.js';
import { GmailPollerService } from '../services/email/gmail-poller.service.js';
import { buildServer } from '../server/server.js';
import { config } from '../config/env.js';

async function startWhatsAppBridge() {
  console.log('\n' + '═'.repeat(65));
  console.log('📱 AI EMAIL ➔ WHATSAPP LIVE BRIDGE (QR CODE LOGIN)');
  console.log(`📱 Client Number: ${config.CLIENT_WHATSAPP_NUMBER}`);
  console.log(`⚡ AI Engine:     [${config.AI_PROVIDER.toUpperCase()}]`);
  console.log('═'.repeat(65) + '\n');

  // Initialize WhatsApp Provider (Baileys)
  WhatsAppFactory.getProvider();

  // Start Automated Real-Time Gmail Poller
  if (config.AUTO_SYNC_ENABLED) {
    GmailPollerService.start(config.AUTO_SYNC_INTERVAL_SECONDS);
  }

  // Start Fastify API Server
  const server = await buildServer();
  await server.listen({ port: config.PORT, host: config.HOST });
  console.log(`🚀 Web server running on http://localhost:${config.PORT}`);
  console.log(`📥 Listening for Gmail webhooks and WhatsApp messages...\n`);
}

startWhatsAppBridge().catch(console.error);
