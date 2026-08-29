import { config } from '../../config/env.js';
import { AdminAlertService } from './admin-alert.service.js';

export class ExternalWatchdog {
  private static consecutiveFailures: number = 0;
  private static lastSuccessfulPing: Date | null = null;
  private static timer: NodeJS.Timeout | null = null;

  /**
   * Starts independent periodic heartbeat checks
   */
  static start(intervalSeconds: number = 30, targetUrl?: string): void {
    const probeUrl = targetUrl || `http://127.0.0.1:${config.PORT}/health/deep`;
    console.log(`\n📡 [External Watchdog] Health probe activated on ${probeUrl} (interval: ${intervalSeconds}s)...`);

    this.timer = setInterval(async () => {
      await this.probe(probeUrl);
    }, intervalSeconds * 1000);
  }

  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async probe(url: string): Promise<{ success: boolean; latencyMs: number; status?: string }> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        this.consecutiveFailures = 0;
        this.lastSuccessfulPing = new Date();
        return { success: true, latencyMs, status: 'ok' };
      }

      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3) {
        const downtimeEstSeconds = this.consecutiveFailures * 30;
        await AdminAlertService.notifyProcessWatchdogOutage(downtimeEstSeconds, this.lastSuccessfulPing || undefined);
      }
      return { success: false, latencyMs, status: `HTTP ${res.status}` };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= 3) {
        const downtimeEstSeconds = this.consecutiveFailures * 30;
        await AdminAlertService.notifyProcessWatchdogOutage(downtimeEstSeconds, this.lastSuccessfulPing || undefined);
      }

      return { success: false, latencyMs, status: err.message };
    }
  }
}

// Standalone execution if launched directly
if (process.argv[1]?.endsWith('external-watchdog.ts') || process.argv[1]?.endsWith('external-watchdog.js')) {
  ExternalWatchdog.start(30);
}
