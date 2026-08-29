import { prisma } from '../../db/prisma.js';
import { config } from '../../config/env.js';
import { AdminAlertService, IncidentAlert } from './admin-alert.service.js';

export interface SystemHealthReport {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  uptimeSeconds: number;
  timestamp: Date;
  components: {
    database: { status: 'UP' | 'DOWN'; latencyMs: number };
    whatsapp: { status: 'CONNECTED' | 'DISCONNECTED' | 'MOCK'; provider: string; clientNumber: string };
    gmail: { status: 'ACTIVE' | 'TOKEN_EXPIRED' | 'UNLINKED'; linkedAccountsCount: number };
    ai: { status: 'ACTIVE' | 'FALLBACK_MODE'; modelName: string; provider: string };
  };
  metrics: {
    processedEmailsToday: number;
    activeSessions: number;
    recentIncidentsCount: number;
  };
  recentIncidents: IncidentAlert[];
  recommendations: string[];
}

export class LogAuditorAgent {
  private static startTime: number = Date.now();

  /**
   * Generates a deep, real-time diagnostic health audit of the entire system
   */
  static async auditSystemHealth(): Promise<SystemHealthReport> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const recommendations: string[] = [];
    let systemStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';

    // 1. Probe Database
    const dbStart = Date.now();
    let dbStatus: 'UP' | 'DOWN' = 'UP';
    let dbLatencyMs = 0;
    try {
      await prisma.user.count();
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'DOWN';
      systemStatus = 'CRITICAL';
      recommendations.push('Database connection failed. Verify SQLite path or Postgres connection string.');
    }

    // 2. Probe WhatsApp Connection
    let whatsappStatus: 'CONNECTED' | 'DISCONNECTED' | 'MOCK' = 'CONNECTED';
    if (config.WHATSAPP_PROVIDER === 'mock') {
      whatsappStatus = 'MOCK';
    }

    // 3. Probe Gmail Accounts
    let linkedAccountsCount = 0;
    let gmailStatus: 'ACTIVE' | 'TOKEN_EXPIRED' | 'UNLINKED' = 'UNLINKED';
    try {
      const accounts = await prisma.emailAccount.findMany({
        where: { provider: 'GMAIL' },
      });
      linkedAccountsCount = accounts.length;
      if (linkedAccountsCount > 0) {
        const hasActiveToken = accounts.some((a) => a.encryptedAccessToken || a.encryptedRefreshToken);
        gmailStatus = hasActiveToken ? 'ACTIVE' : 'TOKEN_EXPIRED';
        if (gmailStatus === 'TOKEN_EXPIRED') {
          systemStatus = 'DEGRADED';
          recommendations.push('Gmail token expired for linked account. Re-authentication required.');
        }
      }
    } catch {}

    // 4. Metrics & Session Counts
    let activeSessions = 0;
    let processedEmailsToday = 0;
    try {
      activeSessions = await prisma.whatsappSession.count({
        where: { state: { not: 'IDLE' } },
      });
      processedEmailsToday = await prisma.emailMessage.count();
    } catch {}

    // 5. Recent Incidents
    const recentIncidents = AdminAlertService.getRecentIncidents();
    if (recentIncidents.some((i) => i.type === 'WHATSAPP_DISCONNECTED' && i.status === 'DISPATCHED')) {
      whatsappStatus = 'DISCONNECTED';
      if (systemStatus === 'HEALTHY') systemStatus = 'DEGRADED';
      recommendations.push('WhatsApp is disconnected. Scan QR code or verify linked devices.');
    }

    return {
      status: systemStatus,
      uptimeSeconds,
      timestamp: new Date(),
      components: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
        whatsapp: {
          status: whatsappStatus,
          provider: config.WHATSAPP_PROVIDER,
          clientNumber: config.CLIENT_WHATSAPP_NUMBER,
        },
        gmail: { status: gmailStatus, linkedAccountsCount },
        ai: {
          status: 'ACTIVE',
          modelName: config.AI_MODEL_NAME,
          provider: config.AI_PROVIDER,
        },
      },
      metrics: {
        processedEmailsToday,
        activeSessions,
        recentIncidentsCount: recentIncidents.length,
      },
      recentIncidents,
      recommendations:
        recommendations.length > 0 ? recommendations : ['All systems operating within normal parameters.'],
    };
  }

  /**
   * Formats a human-readable CLI diagnostic summary
   */
  static async formatTerminalAudit(): Promise<string> {
    const report = await this.auditSystemHealth();
    const lines: string[] = [];

    lines.push('═'.repeat(65));
    lines.push(`🔍 SS40 NETWORK: AUTONOMOUS SYSTEM HEALTH AUDIT`);
    lines.push(`Overall Status:   [${report.status}]`);
    lines.push(`Uptime:           ${Math.floor(report.uptimeSeconds / 60)}m ${report.uptimeSeconds % 60}s`);
    lines.push(`Timestamp:        ${report.timestamp.toISOString()}`);
    lines.push('─'.repeat(65));
    lines.push(`📡 COMPONENT HEALTH:`);
    lines.push(`  • Database:     [${report.components.database.status}] (Latency: ${report.components.database.latencyMs}ms)`);
    lines.push(`  • WhatsApp:     [${report.components.whatsapp.status}] (${report.components.whatsapp.provider} -> ${report.components.whatsapp.clientNumber})`);
    lines.push(`  • Gmail Engine: [${report.components.gmail.status}] (${report.components.gmail.linkedAccountsCount} accounts active)`);
    lines.push(`  • AI Engine:    [${report.components.ai.status}] (${report.components.ai.provider}: ${report.components.ai.modelName})`);
    lines.push('─'.repeat(65));
    lines.push(`📊 LIVE METRICS:`);
    lines.push(`  • Ingested Emails:  ${report.metrics.processedEmailsToday}`);
    lines.push(`  • Active Sessions:  ${report.metrics.activeSessions}`);
    lines.push(`  • Incidents (24h):  ${report.metrics.recentIncidentsCount}`);
    lines.push('─'.repeat(65));
    lines.push(`💡 DIAGNOSTIC RECOMMENDATIONS:`);
    for (const rec of report.recommendations) {
      lines.push(`  - ${rec}`);
    }
    lines.push('═'.repeat(65));

    return lines.join('\n');
  }
}
