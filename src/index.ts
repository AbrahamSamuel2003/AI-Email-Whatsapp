import { buildServer } from './server/server.js';
import { TaskQueueManager } from './queue/task-queue.js';
import { config } from './config/env.js';

async function start() {
  try {
    console.log('🚀 Starting AI Email to WhatsApp Connect System...');
    await TaskQueueManager.init();

    const server = await buildServer();
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    console.log(`\n======================================================`);
    console.log(`✅ Server running at http://${config.HOST}:${config.PORT}`);
    console.log(`⚡ AI Engine:         ${config.AI_PROVIDER}`);
    console.log(`📧 Email Provider:    ${config.EMAIL_PROVIDER}`);
    console.log(`📱 WhatsApp Provider: ${config.WHATSAPP_PROVIDER}`);
    console.log(`======================================================\n`);

    if (config.AUTO_SYNC_ENABLED) {
      const { GmailPollerService } = await import('./services/email/gmail-poller.service.js');
      GmailPollerService.start(config.AUTO_SYNC_INTERVAL_SECONDS || 10);
    }
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

start();
