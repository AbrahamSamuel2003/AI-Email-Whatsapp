import { prisma } from '../../db/prisma.js';
import { EmailMetadata } from '../../core/types.js';
import { AIFactory } from '../ai/ai.factory.js';
import { WhatsAppFactory } from '../whatsapp/whatsapp.factory.js';
import { SessionManager } from '../state/session-manager.js';
import { config } from '../../config/env.js';

export interface IngestionResult {
  messageId: string;
  threadId: string;
  isImportant: boolean;
  notificationType: string;
  whatsappNotified: boolean;
  importanceReason: string;
  extractedCode?: string;
}

export class EmailIngestionPipeline {
  static async processIncomingEmail(
    email: EmailMetadata,
    targetUserId?: string
  ): Promise<IngestionResult> {
    // 1. Resolve User and EmailAccount
    let user = targetUserId
      ? await prisma.user.findUnique({ where: { id: targetUserId } })
      : await prisma.user.findFirst({
          where: { whatsappNumber: config.CLIENT_WHATSAPP_NUMBER },
          include: { emailAccounts: true },
        });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: 'Executive Client',
          email: email.recipientEmail || 'client@company.com',
          whatsappNumber: config.CLIENT_WHATSAPP_NUMBER,
          emailAccounts: {
            create: {
              provider: 'MOCK',
              emailAddress: email.recipientEmail || 'client@company.com',
            },
          },
        },
        include: { emailAccounts: true },
      });
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: { userId: user.id, provider: 'GMAIL' },
    }) || await prisma.emailAccount.findFirst({
      where: { userId: user.id },
    }) || await prisma.emailAccount.create({
      data: {
        userId: user.id,
        provider: 'GMAIL',
        emailAddress: email.recipientEmail || 'client@company.com',
      },
    });

    // 2. Resolve or Create EmailThread
    const thread = await prisma.emailThread.upsert({
      where: {
        emailAccountId_externalThreadId: {
          emailAccountId: emailAccount.id,
          externalThreadId: email.externalThreadId,
        },
      },
      update: {
        subject: email.subject,
        lastMessageAt: email.receivedAt,
      },
      create: {
        emailAccountId: emailAccount.id,
        externalThreadId: email.externalThreadId,
        subject: email.subject,
        lastMessageAt: email.receivedAt,
      },
    });

    // 3. AI Importance & Security Analysis
    const aiProvider = AIFactory.getProvider();
    const classification = await aiProvider.classifyImportance(email);

    // Check if this specific email message was already processed/notified
    const existingMessage = await prisma.emailMessage.findUnique({
      where: {
        threadId_externalMessageId: {
          threadId: thread.id,
          externalMessageId: email.externalMessageId,
        },
      },
    });

    if (existingMessage) {
      return {
        messageId: existingMessage.id,
        threadId: thread.id,
        isImportant: classification.isImportant,
        notificationType: classification.notificationType,
        extractedCode: classification.extractedCode,
        whatsappNotified: false, // Already processed previously
        importanceReason: classification.reasoning,
      };
    }

    // 4. Save EmailMessage to Database
    const message = await prisma.emailMessage.upsert({
      where: {
        threadId_externalMessageId: {
          threadId: thread.id,
          externalMessageId: email.externalMessageId,
        },
      },
      update: {
        isImportant: classification.isImportant,
        importanceScore: classification.confidence,
        importanceReason: classification.reasoning,
        urgency: classification.urgency,
        actionRequired: classification.actionRequired,
      },
      create: {
        threadId: thread.id,
        externalMessageId: email.externalMessageId,
        rfcMessageId: email.rfcMessageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
        senderName: email.senderName,
        senderEmail: email.senderEmail,
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        cleanBody: email.cleanBody,
        rawSnippet: email.rawSnippet,
        receivedAt: email.receivedAt,
        isImportant: classification.isImportant,
        importanceScore: classification.confidence,
        importanceReason: classification.reasoning,
        urgency: classification.urgency,
        actionRequired: classification.actionRequired,
      },
    });

    // 5. WhatsApp Notification Pipeline
    let whatsappNotified = false;
    if (classification.isImportant && classification.notificationType !== 'NONE') {
      const whatsappProvider = WhatsAppFactory.getProvider();
      const senderDisplay = email.senderName
        ? `${email.senderName} (${email.senderEmail})`
        : email.senderEmail;

      if (classification.notificationType === 'ALERT_ONLY') {
        // INFO-ONLY ALERT (OTP / Verification Code / Security Notice)
        const lines = [
          `🔐 *Security / Verification Alert*`,
          ``,
          `*From:* ${senderDisplay}`,
          `*Subject:* ${email.subject}`,
        ];

        if (classification.extractedCode) {
          lines.push(`*Code:* *${classification.extractedCode}*`);
        }

        lines.push(
          ``,
          `*Details:*`,
          `${classification.summary || email.cleanBody.trim().slice(0, 300)}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━`,
          `ℹ️ _This is an informational alert. No email reply needed._`
        );

        await whatsappProvider.sendTextMessage(user.whatsappNumber, lines.join('\n'));
        whatsappNotified = true;
        // NOTE: Session state stays IDLE — no draft/reply session created!
      } else {
        // ACTIONABLE EMAIL (Requires Reply)
        const urgencyEmoji = classification.urgency === 'HIGH' ? '🚨' : '📧';
        const notificationText = [
          `${urgencyEmoji} *Important Email Received*`,
          ``,
          `*From:* ${senderDisplay}`,
          `*Subject:* ${email.subject}`,
          ``,
          `*Message:*`,
          `${email.cleanBody.trim()}`,
          ``,
          `━━━━━━━━━━━━━━━━━━━`,
          `💬 _Reply to this message with your response (e.g., "Tomorrow 11 is fine")_`,
        ].join('\n');

        await whatsappProvider.sendTextMessage(user.whatsappNumber, notificationText);

        // Update session state to NOTIFIED to wait for client's informal reply
        await SessionManager.setNotifiedState(user.whatsappNumber, thread.id, message.id);
        whatsappNotified = true;
      }
    }

    return {
      messageId: message.id,
      threadId: thread.id,
      isImportant: classification.isImportant,
      notificationType: classification.notificationType,
      whatsappNotified,
      importanceReason: classification.reasoning,
      extractedCode: classification.extractedCode,
    };
  }
}
