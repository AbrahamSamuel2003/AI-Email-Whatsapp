import fs from 'fs';
import path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'AUDIT';

export type LogCategory =
  | 'AUTH'
  | 'GMAIL_SYNC'
  | 'AI_ENGINE'
  | 'WHATSAPP'
  | 'QUEUE'
  | 'SECURITY'
  | 'SYSTEM'
  | 'SESSION';

export interface AuditEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  actor?: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export class AuditLogger {
  private static logDir = path.resolve(process.cwd(), 'logs');
  private static ringBuffer: AuditEntry[] = [];
  private static maxBufferLength = 200;

  static {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch {}
  }

  private static getLogFilePath(): string {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `audit-${dateStr}.log`);
  }

  private static formatConsole(entry: AuditEntry): void {
    const time = entry.timestamp.split('T')[1].split('.')[0];
    let levelBadge = `[${entry.level}]`;

    // ANSI Colors for Production Terminal Output
    switch (entry.level) {
      case 'DEBUG':
        levelBadge = `\x1b[90m[DEBUG]\x1b[0m`;
        break;
      case 'INFO':
        levelBadge = `\x1b[36m[INFO]\x1b[0m`;
        break;
      case 'AUDIT':
        levelBadge = `\x1b[32m[AUDIT]\x1b[0m`;
        break;
      case 'WARN':
        levelBadge = `\x1b[33m[WARN]\x1b[0m`;
        break;
      case 'ERROR':
        levelBadge = `\x1b[31m\x1b[1m[ERROR]\x1b[0m`;
        break;
      case 'CRITICAL':
        levelBadge = `\x1b[41m\x1b[37m\x1b[1m[CRITICAL]\x1b[0m`;
        break;
    }

    const catBadge = `\x1b[35m[${entry.category}]\x1b[0m`;
    const actorStr = entry.actor ? ` \x1b[90m(actor: ${entry.actor})\x1b[0m` : '';

    console.log(`\x1b[90m${time}\x1b[0m ${levelBadge} ${catBadge} ${entry.message}${actorStr}`);

    if (entry.error) {
      console.error(`  \x1b[31m└─ Error: ${entry.error.message}\x1b[0m`);
      if (entry.error.stack && (entry.level === 'ERROR' || entry.level === 'CRITICAL')) {
        const topStack = entry.error.stack.split('\n').slice(1, 3).join('\n');
        console.error(`\x1b[90m${topStack}\x1b[0m`);
      }
    }
  }

  private static appendToFile(entry: AuditEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.getLogFilePath(), line, 'utf-8');
    } catch {}
  }

  private static log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    opts?: { actor?: string; metadata?: Record<string, any>; error?: any }
  ): AuditEntry {
    const errObj = opts?.error
      ? {
          message: opts.error.message || String(opts.error),
          stack: opts.error.stack,
          code: opts.error.code,
        }
      : undefined;

    const entry: AuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      actor: opts?.actor,
      metadata: opts?.metadata,
      error: errObj,
    };

    // Store in ring buffer
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > this.maxBufferLength) {
      this.ringBuffer.shift();
    }

    // Output to console & persistent file
    this.formatConsole(entry);
    this.appendToFile(entry);

    return entry;
  }

  static info(category: LogCategory, message: string, metadata?: Record<string, any>): AuditEntry {
    return this.log('INFO', category, message, { metadata });
  }

  static warn(category: LogCategory, message: string, metadata?: Record<string, any>): AuditEntry {
    return this.log('WARN', category, message, { metadata });
  }

  static error(category: LogCategory, message: string, error?: any, metadata?: Record<string, any>): AuditEntry {
    return this.log('ERROR', category, message, { error, metadata });
  }

  static critical(category: LogCategory, message: string, error?: any, metadata?: Record<string, any>): AuditEntry {
    return this.log('CRITICAL', category, message, { error, metadata });
  }

  static audit(category: LogCategory, message: string, actor: string, metadata?: Record<string, any>): AuditEntry {
    return this.log('AUDIT', category, message, { actor, metadata });
  }

  /**
   * Scan memory ring buffer and latest log file to find errors & diagnose root causes
   */
  static scanRecentErrors(limit: number = 20): {
    totalErrors: number;
    errors: AuditEntry[];
    diagnostics: { category: string; count: number; commonReason: string }[];
  } {
    const errorEntries = this.ringBuffer.filter(
      (e) => e.level === 'ERROR' || e.level === 'CRITICAL' || e.level === 'WARN'
    );

    const counts: Record<string, { count: number; reasons: string[] }> = {};

    errorEntries.forEach((e) => {
      if (!counts[e.category]) {
        counts[e.category] = { count: 0, reasons: [] };
      }
      counts[e.category].count++;
      if (e.error?.message && !counts[e.category].reasons.includes(e.error.message)) {
        counts[e.category].reasons.push(e.error.message);
      }
    });

    const diagnostics = Object.entries(counts).map(([category, val]) => ({
      category,
      count: val.count,
      commonReason: val.reasons.slice(0, 2).join(' | ') || 'Warning state detected',
    }));

    return {
      totalErrors: errorEntries.length,
      errors: errorEntries.slice(-limit),
      diagnostics,
    };
  }

  static getRecentEntries(count: number = 50): AuditEntry[] {
    return this.ringBuffer.slice(-count);
  }
}
