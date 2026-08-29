import { prisma } from '../../db/prisma.js';
import { WhatsAppInboundMessage, OutboundReplyPayload } from '../../core/types.js';
import { AIFactory } from '../ai/ai.factory.js';
import { WhatsAppFactory } from '../whatsapp/whatsapp.factory.js';
import { EmailFactory } from '../email/email.factory.js';
import { SessionManager } from './session-manager.js';
import { GmailAuthService } from '../email/gmail-auth.service.js';
import { GmailAdapter } from '../email/gmail.adapter.js';

export interface WhatsAppProcessingResult {
  action: 'DRAFT_GENERATED' | 'EMAIL_SENT' | 'SESSION_RESET' | 'IGNORED' | 'ERROR';
  replyPreview?: string;
  sentEmailId?: string;
  message: string;
}

export class WhatsAppReplyOrchestrator {
  static async handleInboundWhatsAppMessage(
    inbound: WhatsAppInboundMessage
  ): Promise<WhatsAppProcessingResult> {
    const whatsappNumber = inbound.from;
    const clientText = inbound.text.trim();

    const session = await SessionManager.getOrCreateSession(whatsappNumber);
    const whatsappProvider = WhatsAppFactory.getProvider();

    // Check for cancel / reset command
    if (/^reset|cancel|clear$/i.test(clientText)) {
      await SessionManager.resetSession(whatsappNumber);
      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        '🔄 *Session Reset.* Waiting for next incoming important email.'
      );
      return { action: 'SESSION_RESET', message: 'Session reset by user command' };
    }

    // STATE: PREVIEW_GENERATED -> Client sends confirmation (SEND / YES / OK)
    if (session.state === 'PREVIEW_GENERATED' && /^send|yes|send\s*it|ok$/i.test(clientText)) {
      if (!session.activeThreadId || !session.activeMessageId || !session.generatedDraft) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          '⚠️ No active draft found to send. Please reply to an email notification first.'
        );
        return { action: 'ERROR', message: 'No active draft found' };
      }

      // Fetch active message, thread, and email account
      const message = await prisma.emailMessage.findUnique({
        where: { id: session.activeMessageId },
        include: {
          thread: {
            include: {
              emailAccount: true,
            },
          },
        },
      });

      if (!message) {
        return { action: 'ERROR', message: 'Active email message not found in database' };
      }

      const emailAccount = message.thread.emailAccount;
      let emailProvider;

      if (emailAccount.provider === 'GMAIL' && (emailAccount.encryptedAccessToken || emailAccount.encryptedRefreshToken)) {
        const authClient = await GmailAuthService.getAuthenticatedClientForAccount(emailAccount.id);
        emailProvider = new GmailAdapter(authClient);
      } else {
        const accessToken = emailAccount.encryptedAccessToken
          ? decryptToken(emailAccount.encryptedAccessToken)
          : undefined;
        const refreshToken = emailAccount.encryptedRefreshToken
          ? decryptToken(emailAccount.encryptedRefreshToken)
          : undefined;
        emailProvider = EmailFactory.getProvider(accessToken, refreshToken);
      }

      // Build RFC 2822 threading references
      const referencesList = [message.references, message.rfcMessageId]
        .filter(Boolean)
        .join(' ')
        .trim();

      const outboundPayload: OutboundReplyPayload = {
        toEmail: message.senderEmail,
        subject: message.subject.startsWith('Re:') ? message.subject : `Re: ${message.subject}`,
        body: session.generatedDraft,
        threadId: message.thread.externalThreadId,
        inReplyToMessageId: message.rfcMessageId || message.externalMessageId,
        references: referencesList || undefined,
      };

      const sendResult = await emailProvider.sendReply(outboundPayload);

      // Record outbound email in DB
      const outbound = await prisma.outboundEmail.create({
        data: {
          emailAccountId: emailAccount.id,
          threadId: message.threadId,
          inReplyToMessageId: message.id,
          toEmail: outboundPayload.toEmail,
          subject: outboundPayload.subject,
          body: outboundPayload.body,
          status: sendResult.status,
          externalSentId: sendResult.externalMessageId,
          sentAt: sendResult.sentAt,
        },
      });

      // Update session state
      await SessionManager.setConfirmedSentState(whatsappNumber);

      // Send WhatsApp confirmation
      const confirmationText = [
        `✅ *Email Sent Successfully!*`,
        ``,
        `*To:* ${message.senderName || message.senderEmail} (${message.senderEmail})`,
        `*Subject:* ${outboundPayload.subject}`,
        `*Thread ID:* ${message.thread.externalThreadId}`,
        ``,
        `Your reply was delivered inside the original email conversation.`,
      ].join('\n');

      await whatsappProvider.sendTextMessage(whatsappNumber, confirmationText);

      return {
        action: 'EMAIL_SENT',
        sentEmailId: outbound.id,
        message: 'Email reply sent and thread preserved',
      };
    }

    // STATE: NOTIFIED or revising PREVIEW_GENERATED -> Generate AI Reply Draft
    if (session.state === 'NOTIFIED' || session.state === 'PREVIEW_GENERATED') {
      if (!session.activeMessageId) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          'ℹ️ No active email thread selected. You will be notified when an important email arrives.'
        );
        return { action: 'IGNORED', message: 'No active email message in session' };
      }

      const activeMessage = await prisma.emailMessage.findUnique({
        where: { id: session.activeMessageId },
        include: { thread: true },
      });

      if (!activeMessage) {
        return { action: 'ERROR', message: 'Active message not found' };
      }

      // Generate professional email reply using AI
      const aiProvider = AIFactory.getProvider();
      const aiReply = await aiProvider.generateReply({
        senderName: activeMessage.senderName || undefined,
        senderEmail: activeMessage.senderEmail,
        subject: activeMessage.subject,
        originalEmailBody: activeMessage.cleanBody,
        clientInstruction: clientText,
        clientName: session.user.name || 'Executive Client',
      });

      // Update session state with draft
      await SessionManager.setPreviewGeneratedState(
        whatsappNumber,
        aiReply.replyBody,
        clientText
      );

      // Format WhatsApp Preview with safety action prompts
      const previewText = [
        `✉️ *Reply Preview Draft*`,
        `*To:* ${activeMessage.senderName || activeMessage.senderEmail}`,
        `*Subject:* ${aiReply.subject}`,
        `━━━━━━━━━━━━━━━━━━━`,
        `${aiReply.replyBody}`,
        `━━━━━━━━━━━━━━━━━━━`,
        `👉 Reply *SEND* to dispatch this email.`,
        `✏️ _Or type a revision to adjust the reply._`,
      ].join('\n');

      await whatsappProvider.sendInteractiveMessage(whatsappNumber, previewText, [
        { id: 'btn_send', title: 'SEND' },
        { id: 'btn_edit', title: 'EDIT' },
      ]);

      return {
        action: 'DRAFT_GENERATED',
        replyPreview: aiReply.replyBody,
        message: 'Reply preview generated and sent to WhatsApp for confirmation',
      };
    }

    // Default: IDLE state
    await whatsappProvider.sendTextMessage(
      whatsappNumber,
      `👋 *Hello!* The AI Email Assistant is active.\nWhen important emails arrive, you will receive an instant summary here and can reply directly in natural language.`
    );

    return {
      action: 'IGNORED',
      message: 'Client sent message while session is IDLE',
    };
  }
}
