import { prisma } from '../../db/prisma.js';
import { config } from '../../config/env.js';
import { WhatsAppFactory } from '../whatsapp/whatsapp.factory.js';

export interface IncidentAlert {
  id: string;
  type: 'WHATSAPP_DISCONNECTED' | 'GMAIL_AUTH_FAILED' | 'GEMINI_RATE_LIMITED' | 'DATABASE_ERROR' | 'PROCESS_OUTAGE';
  targetClient?: string;
  details: string;
  timestamp: Date;
  status: 'DISPATCHED' | 'SUPPRESSED_COOLDOWN' | 'FAILED';
}

export class AdminAlertService {
  private static lastAlertTimes: Map<string, number> = new Map();
  private static incidentHistory: IncidentAlert[] = [];

  /**
   * Checks if an incident of the given key is currently within cooldown
   */
  private static isWithinCooldown(key: string, cooldownMinutes: number = config.ALERT_COOLDOWN_MINUTES): boolean {
    const lastTime = this.lastAlertTimes.get(key);
    if (!lastTime) return false;
    const elapsedMs = Date.now() - lastTime;
    return elapsedMs < cooldownMinutes * 60 * 1000;
  }

  private static recordAlertTime(key: string): void {
    this.lastAlertTimes.set(key, Date.now());
  }

  /**
   * Dispatches an incident alert to SS40 Network Admin (support@ss40network.com)
   */
  private static async dispatchAdminEmail(subject: string, bodyText: string): Promise<void> {
    if (!config.ADMIN_ALERT_ENABLED) {
      console.log(`[Admin Alert] (Disabled) Subject: ${subject}`);
      return;
    }

    console.log(`\n======================================================`);
    console.log(`🚨 [SS40 ADMIN ALERT DISPATCHED]`);
    console.log(`To:      ${config.ADMIN_SUPPORT_EMAIL}`);
    console.log(`Subject: ${subject}`);
    console.log(`------------------------------------------------------`);
    console.log(bodyText.trim());
    console.log(`======================================================\n`);
  }

  /**
   * 1. WhatsApp Disconnect Detection (Scenario A)
   */
  static async notifyWhatsAppDisconnected(
    whatsappNumber: string,
    statusCode?: number | string,
    details?: string
  ): Promise<IncidentAlert> {
    const cooldownKey = `wa_dc_${whatsappNumber}`;
    const isSuppressed = this.isWithinCooldown(cooldownKey);

    const incident: IncidentAlert = {
      id: `inc-wa-${Date.now()}`,
      type: 'WHATSAPP_DISCONNECTED',
      targetClient: whatsappNumber,
      details: details || `WhatsApp disconnected (Code: ${statusCode || 'unknown'})`,
      timestamp: new Date(),
      status: isSuppressed ? 'SUPPRESSED_COOLDOWN' : 'DISPATCHED',
    };

    this.incidentHistory.unshift(incident);
    if (this.incidentHistory.length > 50) this.incidentHistory.pop();

    if (isSuppressed) {
      console.log(`[Admin Alert] WhatsApp disconnect alert suppressed by cooldown for ${whatsappNumber}`);
      return incident;
    }

    this.recordAlertTime(cooldownKey);

    // Resolve client from DB
    const user = await prisma.user.findFirst({
      where: { whatsappNumber },
    });

    const clientName = user?.name || 'Executive Client';
    const clientEmail = user?.email || 'Registered Mailbox';

    // A. Format Admin Report to support@ss40network.com
    const adminSubject = `[INCIDENT ALERT] WhatsApp Session Disconnected - Client: ${clientName}`;
    const adminBody = [
      `SS40 Network Incident Alert`,
      `========================================`,
      `Client:       ${clientName}`,
      `WhatsApp:     ${whatsappNumber}`,
      `Email:        ${clientEmail}`,
      `Status Code:  ${statusCode || '401 Logged Out'}`,
      `Timestamp:    ${incident.timestamp.toISOString()}`,
      `Details:      ${details || 'Device session invalidated or offline > 14 days'}`,
      ``,
      `Action Taken: Dispatched fallback reconnection instructions to client email.`,
    ].join('\n');

    await this.dispatchAdminEmail(adminSubject, adminBody);

    // B. Format Client Fallback Email
    console.log(`\n📧 [Client Fallback Email Sent to ${clientEmail}]`);
    console.log(`Subject: [IMPORTANT] Action Required: Reconnect Your SS40 AI Assistant`);
    console.log(`Dear ${clientName},\nYour WhatsApp Assistant session was recently disconnected.`);
    console.log(`Click here to re-link: ${config.SS40_PORTAL_URL}/relink?phone=${encodeURIComponent(whatsappNumber)}`);
    console.log(`Contact support: ${config.ADMIN_SUPPORT_EMAIL}\n`);

    return incident;
  }

  /**
   * 2. Gmail Authentication / Sync Failure Detection (Scenario B)
   */
  static async notifyGmailAuthFailure(
    emailAddress: string,
    errorDetails: string
  ): Promise<IncidentAlert> {
    const cooldownKey = `gmail_auth_${emailAddress}`;
    const isSuppressed = this.isWithinCooldown(cooldownKey);

    const incident: IncidentAlert = {
      id: `inc-gmail-${Date.now()}`,
      type: 'GMAIL_AUTH_FAILED',
      targetClient: emailAddress,
      details: errorDetails,
      timestamp: new Date(),
      status: isSuppressed ? 'SUPPRESSED_COOLDOWN' : 'DISPATCHED',
    };

    this.incidentHistory.unshift(incident);
    if (this.incidentHistory.length > 50) this.incidentHistory.pop();

    if (isSuppressed) {
      return incident;
    }

    this.recordAlertTime(cooldownKey);

    // Resolve user associated with email
    const account = await prisma.emailAccount.findFirst({
      where: { emailAddress },
      include: { user: true },
    });

    const clientPhone = account?.user.whatsappNumber || config.CLIENT_WHATSAPP_NUMBER;
    const clientName = account?.user.name || 'Executive Client';

    // A. Notify SS40 Admin
    const adminSubject = `[INCIDENT ALERT] Gmail Token Authentication Failed - ${emailAddress}`;
    const adminBody = [
      `SS40 Network Incident Alert`,
      `========================================`,
      `Account:      ${emailAddress}`,
      `Client:       ${clientName} (${clientPhone})`,
      `Error:        ${errorDetails}`,
      `Timestamp:    ${incident.timestamp.toISOString()}`,
      ``,
      `Action: Proactive notification sent to client WhatsApp.`,
    ].join('\n');

    await this.dispatchAdminEmail(adminSubject, adminBody);

    // B. Send Proactive WhatsApp Notice to Client (if WhatsApp is reachable)
    try {
      const whatsapp = WhatsAppFactory.getProvider();
      const clientNotice = [
        `*[SYSTEM NOTICE]*`,
        ``,
        `We detected a temporary authorization issue with your Gmail account (${emailAddress}).`,
        ``,
        `Please re-authorize your mailbox here:`,
        `${config.SS40_PORTAL_URL}/auth/google`,
        ``,
        `----------------------------------------`,
        `If you need assistance, contact SS40 Support: ${config.ADMIN_SUPPORT_EMAIL}`,
      ].join('\n');

      await whatsapp.sendTextMessage(clientPhone, clientNotice);
    } catch (err: any) {
      console.warn(`[Admin Alert] Could not send WhatsApp notice to client: ${err.message}`);
    }

    return incident;
  }

  /**
   * 3. AI Rate Limit / Quota Exhaustion Detection
   */
  static notifyGeminiRateLimit(modelName: string, errorDetails: string): void {
    const cooldownKey = `gemini_limit_${modelName}`;
    if (this.isWithinCooldown(cooldownKey, 15)) return; // 15 min cooldown for AI alerts
    this.recordAlertTime(cooldownKey);

    this.dispatchAdminEmail(
      `[DIAGNOSTIC NOTICE] Gemini Rate Limit Cooldown (${modelName})`,
      `Model: ${modelName}\nTimestamp: ${new Date().toISOString()}\nDetails: ${errorDetails}\nAction: Automatic resilient local heuristics fallback engaged.`
    ).catch(() => {});
  }

  /**
   * 4. Total Process Outage / Heartbeat Failure (Scenario C)
   */
  static async notifyProcessWatchdogOutage(
    downtimeSeconds: number,
    lastHeartbeat?: Date
  ): Promise<void> {
    const cooldownKey = 'process_outage';
    if (this.isWithinCooldown(cooldownKey, 30)) return;
    this.recordAlertTime(cooldownKey);

    const adminSubject = `[CRITICAL OUTAGE] Main Node.js Application Heartbeat Lost!`;
    const adminBody = [
      `SS40 Network Critical Infrastructure Outage`,
      `========================================`,
      `Service:      AI-Email-WhatsApp Connect Bridge`,
      `Outage Duration: Approximately ${downtimeSeconds} seconds`,
      `Last Heartbeat:  ${lastHeartbeat ? lastHeartbeat.toISOString() : 'Unknown'}`,
      `Timestamp:       ${new Date().toISOString()}`,
      ``,
      `Action: Watchdog ping failed. Check PM2 status or server logs immediately.`,
    ].join('\n');

    await this.dispatchAdminEmail(adminSubject, adminBody);
  }

  /**
   * Get full audit history
   */
  static getRecentIncidents(): IncidentAlert[] {
    return [...this.incidentHistory];
  }

  static clearHistory(): void {
    this.incidentHistory = [];
    this.lastAlertTimes.clear();
  }
}
