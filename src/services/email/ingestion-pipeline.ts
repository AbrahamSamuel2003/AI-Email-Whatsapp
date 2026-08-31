import { prisma } from '../../db/prisma.js';
import { EmailMetadata } from '../../core/types.js';
import { AIFactory } from '../ai/ai.factory.js';
import { WhatsAppFactory } from '../whatsapp/whatsapp.factory.js';
import { SessionManager } from '../state/session-manager.js';
import { PhoneAlertService } from '../notification/phone-alert.service.js';
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

    // 3. Deduplication Guard: Check if this email was already processed
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
        isImportant: existingMessage.isImportant,
        notificationType: existingMessage.isImportant ? 'ACTIONABLE' : 'NONE',
        extractedCode: undefined,
        whatsappNotified: false, // Already processed previously - zero AI tokens used!
        importanceReason: existingMessage.importanceReason || 'Already processed',
      };
    }

    // 4. Fast Promotional & Commercial Offer Filter (with Security/OTP Exception)
    const userLang: string = (user as any)?.preferredLanguage || 'ENGLISH';
    const isSecurityCode = /otp|verification|security code|login code|2fa|one-time password|verify your account/i.test(
      `${email.subject} ${email.cleanBody.slice(0, 300)}`
    );

    const combinedHeaders = `${email.senderEmail} ${email.senderName || ''} ${email.subject}`.toLowerCase();
    const isCommercialOffer = !isSecurityCode && /flipkart|myntra|meesho|swiggy|zomato|newsletter|promo|offers?@|discount|cashback|marketing|digest|deal of the day|coupon|big billion|sale is live|weekly digest/i.test(
      combinedHeaders
    );

    let classification;
    if (isCommercialOffer) {
      classification = {
        isImportant: false,
        notificationType: 'NONE' as const,
        confidence: 0.99,
        urgency: 'LOW' as const,
        reasoning: 'Automated promotional offer / marketing email filtered',
        actionRequired: null,
        extractedCode: null,
        summary: 'Promotional offer filtered',
      };
    } else {
      const aiProvider = AIFactory.getProvider();
      classification = await aiProvider.classifyImportance(email, userLang);
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
          `*[SECURITY VERIFICATION CODE]*`,
          `───────────────────────────`,
          `*From:* ${senderDisplay}`,
          `*Subject:* ${email.subject}`,
          ``,
        ];

        if (classification.extractedCode) {
          lines.push(`*CODE:*`);
          lines.push(`> *${classification.extractedCode}*`);
          lines.push(``);
        }

        lines.push(
          `*Details:*`,
          `${classification.summary || email.cleanBody.trim().slice(0, 300)}`,
          `───────────────────────────`,
          `_Informational alert only. No email reply needed._`
        );

        await whatsappProvider.sendTextMessage(user.whatsappNumber, lines.join('\n'));
        whatsappNotified = true;

        // Dispatch instant push notification to phone
        await PhoneAlertService.sendAlert({
          title: classification.extractedCode
            ? `[SECURITY CODE] ${classification.extractedCode}`
            : `[SECURITY ALERT] ${email.subject}`,
          message: classification.extractedCode
            ? `Code: ${classification.extractedCode}\nFrom: ${senderDisplay}\nSubject: ${email.subject}`
            : `From: ${senderDisplay}\nSubject: ${email.subject}\n\n${(classification.summary || email.cleanBody).trim().slice(0, 150)}`,
          priority: 'urgent',
        });
        // NOTE: Session state stays IDLE — no draft/reply session created!
      } else {
        // ACTIONABLE EMAIL (Requires Reply)
        const isTamil = userLang === 'TAMIL';
        const isHindi = userLang === 'HINDI';

        const headerTitle = isTamil
          ? `*[புதிய மின்னஞ்சல் வந்தது]*`
          : isHindi
          ? `*[नया ईमेल प्राप्त हुआ]*`
          : `*[NEW EMAIL RECEIVED]*`;

        const summaryHeader = isTamil ? `*மின்னஞ்சல் சுருக்கம்:*` : isHindi ? `*ईमेल सारांश:*` : `*Summary:*`;

        const replyGuide = isTamil
          ? `*பதிலளிப்பது எப்படி:*\nகுரல் பதிவாகவோ (Voice Note) அல்லது தட்டச்சு செய்தோ உங்கள் பதிலை அனுப்பவும்:\n> _"நாளைக்கு 3 மணிக்கு ஓகே சொல்லு"_`
          : isHindi
          ? `*उत्तर कैसे दें:*\nअपना जवाब वॉइस नोट या टेक्स्ट में भेजें:\n> _"कल 3 बजे ठीक है बोल दो"_`
          : `*HOW TO REPLY:*\nSpeak a voice note or type your reply:\n> _"Tomorrow at 11 works for me"_`;

        const notificationLines = [
          headerTitle,
          `───────────────────────────`,
          `*From:* ${senderDisplay}`,
          `*Subject:* ${email.subject}`,
          ``,
          summaryHeader,
          `${classification.summary || email.cleanBody.trim().slice(0, 300)}`,
        ];

        if (classification.actionRequired) {
          const actionHeader = isTamil ? `*தேவைப்படும் செயல்:*` : isHindi ? `*आवश्यक कार्रवाई:*` : `*Action Required:*`;
          notificationLines.push(`${actionHeader} ${classification.actionRequired}`);
        }

        notificationLines.push(
          ``,
          `*Original Message:*`,
          `${email.cleanBody.trim().slice(0, 400)}`,
          ``,
          `───────────────────────────`,
          replyGuide
        );

        const notificationText = notificationLines.join('\n');

        await whatsappProvider.sendTextMessage(user.whatsappNumber, notificationText);

        // Update session state to NOTIFIED to wait for client's informal reply
        await SessionManager.setNotifiedState(user.whatsappNumber, thread.id, message.id);
        whatsappNotified = true;

        // Dispatch instant push notification to phone
        await PhoneAlertService.sendAlert({
          title: `[EMAIL] ${email.subject}`,
          message: `From: ${senderDisplay}\n\n${(classification.summary || email.cleanBody).trim().slice(0, 140)}...\n\nOpen WhatsApp to reply.`,
          priority: 'high',
        });
      }
    }

    return {
      messageId: message.id,
      threadId: thread.id,
      isImportant: classification.isImportant,
      notificationType: classification.notificationType,
      whatsappNotified,
      importanceReason: classification.reasoning,
      extractedCode: classification.extractedCode || undefined,
    };
  }
}
