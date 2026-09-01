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
    targetUserId?: string,
    isQuiet: boolean = false
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

    const emailAccount = (email.recipientEmail
      ? await prisma.emailAccount.findFirst({
          where: { userId: user.id, emailAddress: email.recipientEmail },
          orderBy: { updatedAt: 'desc' },
        })
      : null) || await prisma.emailAccount.findFirst({
      where: { userId: user.id, provider: 'GMAIL' },
      orderBy: { updatedAt: 'desc' },
    }) || await prisma.emailAccount.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
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

    // 4. Fast Social Media, Promotional & Commercial Offer Filter (with Security/OTP Exception)
    const userLang: string = (user as any)?.preferredLanguage || 'ENGLISH';
    const isSecurityCode = /otp|verification|security code|login code|2fa|one-time password|verify your account|password reset/i.test(
      `${email.subject} ${email.cleanBody.slice(0, 300)}`
    );

    const combinedHeaders = `${email.senderEmail} ${email.senderName || ''} ${email.subject}`.toLowerCase();
    const isSocialOrPromo =
      !isSecurityCode &&
      /flipkart|myntra|meesho|swiggy|zomato|newsletter|promo|offers?@|discount|cashback|marketing|digest|deal of the day|coupon|big billion|sale is live|weekly digest|instagram|facebookmail|linkedin|twitter|x\.com|tiktok|reddit|pinterest|quora|medium\.com|youtube|spotify|twitch|discord|jobs matching|recruiter|upskilling track|broadcast circular|official invitation/i.test(
        combinedHeaders
      );

    let classification;
    if (isSocialOrPromo) {
      classification = {
        isImportant: false,
        notificationType: 'NONE' as const,
        confidence: 0.99,
        urgency: 'LOW' as const,
        reasoning: 'Automated social media / promotional offer / marketing email filtered',
        actionRequired: null,
        extractedCode: null,
        summary: 'Promotional / social media filtered',
      };
    } else {
      const aiProvider = AIFactory.getProvider();
      classification = await aiProvider.classifyImportance(email, userLang);

      // Guard: If sender is no-reply or bounce daemon, it can NEVER be actionable (user cannot reply to automated systems)
      const isNoReply = /no-reply|noreply|donotreply|googleplay-noreply|mailer-daemon|mail delivery subsystem|postmaster|delivery status notification|notifications@/i.test(
        `${email.senderEmail} ${email.senderName || ''} ${email.subject}`
      );
      if (isNoReply && classification.notificationType === 'ACTIONABLE') {
        classification.notificationType = 'ALERT_ONLY';
      }

      // Guard: Year (2020-2030) should never be extracted as an OTP code
      if (classification.extractedCode && /^(202[0-9]|2030)$/.test(classification.extractedCode.trim())) {
        classification.extractedCode = undefined;
      }
    }

    // Ensure only ACTIONABLE emails have actionRequired populated (ALERT_ONLY emails must have null actionRequired so they never enter the reply queue)
    const isActionable = classification.isImportant && classification.notificationType === 'ACTIONABLE';
    const actionRequiredValue = isActionable ? (classification.actionRequired || 'Reply requested') : null;

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
        actionRequired: actionRequiredValue,
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
        actionRequired: actionRequiredValue,
      },
    });

    // Ingestion Guard: Never notify WhatsApp for historical emails received prior to account connection
    const emailReceivedTime = email.receivedAt ? new Date(email.receivedAt).getTime() : Date.now();
    const isHistorical = emailAccount?.createdAt && !emailAccount.syncCursor
      ? emailReceivedTime < emailAccount.createdAt.getTime() - 60000
      : false;

    // 5. WhatsApp Notification Pipeline (Skipped if isQuiet or historical)
    let whatsappNotified = false;
    if (!isQuiet && !isHistorical && classification.isImportant && classification.notificationType !== 'NONE') {
      const whatsappProvider = WhatsAppFactory.getProvider();
      const senderDisplay = email.senderName
        ? `${email.senderName} (${email.senderEmail})`
        : email.senderEmail;

      // Clean raw recipient email (strip quotes and angle brackets)
      const rawRecipient = email.recipientEmail || emailAccount.emailAddress || '';
      const emailMatch = rawRecipient.match(/<([^>]+)>/);
      const cleanInbox = emailMatch && emailMatch[1]
        ? emailMatch[1].replace(/["']/g, '').trim()
        : rawRecipient.replace(/["']/g, '').trim();

      if (classification.notificationType === 'ALERT_ONLY') {
        const titleHeader = classification.extractedCode
          ? `*[SECURITY VERIFICATION CODE]*`
          : `*[SECURITY / ACCOUNT ALERT]*`;

        const mailboxDisplay = `*Inbox:* ${cleanInbox}`;

        const lines = [
          titleHeader,
          `───────────────────────────`,
          mailboxDisplay,
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

        // Dispatch instant push notification to user's personal ntfy topic
        const userTopic = PhoneAlertService.getTopicForUser(user);
        await PhoneAlertService.sendAlert({
          title: classification.extractedCode
            ? `[SECURITY CODE] ${classification.extractedCode}`
            : `[SECURITY ALERT] ${email.subject}`,
          message: classification.extractedCode
            ? `Code: ${classification.extractedCode}\nFrom: ${senderDisplay}\nSubject: ${email.subject}`
            : `From: ${senderDisplay}\nSubject: ${email.subject}\n\n${(classification.summary || email.cleanBody).trim().slice(0, 150)}`,
          priority: 'urgent',
        }, userTopic);
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
        const mailboxDisplay = `*Inbox:* ${cleanInbox}`;

        const replyGuide = isTamil
          ? `*பதிலளிப்பது எப்படி:*\nகுரல் பதிவாகவோ (Voice Note) அல்லது தட்டச்சு செய்தோ உங்கள் பதிலை அனுப்பவும்:\n> _"நாளைக்கு 3 மணிக்கு ஓகே சொல்லு"_`
          : isHindi
          ? `*उत्तर कैसे दें:*\nअपना जवाब वॉइस नोट या टेक्स्ट में भेजें:\n> _"कल 3 बजे ठीक है बोल दो"_`
          : `*HOW TO REPLY:*\nSpeak a voice note or type your reply:\n> _"Tomorrow at 11 works for me"_`;

        const notificationLines = [
          headerTitle,
          `───────────────────────────`,
          mailboxDisplay,
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
        await prisma.whatsappSession.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            whatsappNumber: user.whatsappNumber,
            state: 'NOTIFIED',
            activeEmailAccountId: emailAccount.id,
            activeThreadId: thread.id,
            activeMessageId: message.id,
            lastClientText: null,
          },
          update: {
            state: 'NOTIFIED',
            activeEmailAccountId: emailAccount.id,
            activeThreadId: thread.id,
            activeMessageId: message.id,
            generatedDraft: null,
            lastClientText: null,
            isSelectingMailbox: false,
          },
        });
        whatsappNotified = true;

        // Dispatch instant push notification to user's personal ntfy topic
        const userTopic = PhoneAlertService.getTopicForUser(user);
        await PhoneAlertService.sendAlert({
          title: `[EMAIL] ${email.subject}`,
          message: `From: ${senderDisplay}\n\n${(classification.summary || email.cleanBody).trim().slice(0, 140)}...\n\nOpen WhatsApp to reply.`,
          priority: 'high',
        }, userTopic);
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
