import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  ENCRYPTION_KEY: z.string().min(32).default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  
  // AI
  AI_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  AI_MODEL_NAME: z.string().default('gemini-1.5-flash'),

  // WhatsApp
  WHATSAPP_PROVIDER: z.enum(['mock', 'cloud_api', 'baileys']).default('mock'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default('whatsapp_secret_verify_token_123'),
  CLIENT_WHATSAPP_NUMBER: z.string().default('+919876543210'),

  // Email & Auto Sync
  EMAIL_PROVIDER: z.enum(['mock', 'gmail']).default('mock'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3000/auth/google/callback'),
  AUTO_SYNC_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  AUTO_SYNC_INTERVAL_SECONDS: z.coerce.number().default(10),

  // Monitoring & Admin Alerting
  ADMIN_SUPPORT_EMAIL: z.string().default('support@ss40network.com'),
  ADMIN_ALERT_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  SS40_PORTAL_URL: z.string().default('https://connect.ss40network.com'),
  ALERT_COOLDOWN_MINUTES: z.coerce.number().default(60),

  // Redis / Queue
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  USE_REDIS_QUEUE: z.string().transform((v) => v === 'true').default('false'),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
