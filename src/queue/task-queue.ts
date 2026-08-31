import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { EmailMetadata, WhatsAppInboundMessage } from '../core/types.js';
import { EmailIngestionPipeline } from '../services/email/ingestion-pipeline.js';
import { WhatsAppReplyOrchestrator } from '../services/state/reply-orchestrator.js';
import { config } from '../config/env.js';

export interface EmailJobData {
  type: 'PROCESS_INCOMING_EMAIL';
  email: EmailMetadata;
}

export interface WhatsAppJobData {
  type: 'PROCESS_WHATSAPP_INBOUND';
  message: WhatsAppInboundMessage;
}

export type QueueJobData = EmailJobData | WhatsAppJobData;

export class TaskQueueManager {
  private static emailQueue: Queue | null = null;
  private static emailWorker: Worker | null = null;
  private static isRedisAvailable: boolean = false;

  static async init(): Promise<void> {
    if (!config.USE_REDIS_QUEUE) {
      console.log('⚡ TaskQueue running in Direct In-Memory Mode (Zero-Config local setup)');
      return;
    }

    try {
      const redisConnection = new (Redis as any)({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        connectTimeout: 2000,
      });

      redisConnection.on('error', (err: any) => {
        console.warn('⚠️ Redis connection error, falling back to direct processing:', err.message);
        this.isRedisAvailable = false;
      });

      await new Promise<void>((resolve, reject) => {
        redisConnection.once('connect', () => {
          this.isRedisAvailable = true;
          resolve();
        });
        setTimeout(() => {
          if (!this.isRedisAvailable) resolve();
        }, 1500);
      });

      if (this.isRedisAvailable) {
        this.emailQueue = new Queue('email-whatsapp-queue', {
          connection: redisConnection,
        });

        this.emailWorker = new Worker(
          'email-whatsapp-queue',
          async (job: Job<QueueJobData>) => {
            await this.processJob(job.data);
          },
          { connection: redisConnection }
        );

        console.log('✅ BullMQ + Redis Queue successfully initialized');
      }
    } catch (err: any) {
      console.warn('⚠️ Redis not available. Running with in-memory direct execution:', err.message);
      this.isRedisAvailable = false;
    }
  }

  static async enqueueEmail(email: EmailMetadata): Promise<void> {
    if (this.emailQueue && this.isRedisAvailable) {
      await this.emailQueue.add('incoming-email', {
        type: 'PROCESS_INCOMING_EMAIL',
        email,
      });
    } else {
      // Direct in-memory processing
      await EmailIngestionPipeline.processIncomingEmail(email);
    }
  }

  static async enqueueWhatsApp(message: WhatsAppInboundMessage): Promise<void> {
    if (this.emailQueue && this.isRedisAvailable) {
      await this.emailQueue.add('inbound-whatsapp', {
        type: 'PROCESS_WHATSAPP_INBOUND',
        message,
      });
    } else {
      // Direct in-memory processing
      await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(message);
    }
  }

  private static async processJob(data: QueueJobData): Promise<void> {
    if (data.type === 'PROCESS_INCOMING_EMAIL') {
      await EmailIngestionPipeline.processIncomingEmail(data.email);
    } else if (data.type === 'PROCESS_WHATSAPP_INBOUND') {
      await WhatsAppReplyOrchestrator.handleInboundWhatsAppMessage(data.message);
    }
  }

  static async close(): Promise<void> {
    if (this.emailWorker) await this.emailWorker.close();
    if (this.emailQueue) await this.emailQueue.close();
  }
}
