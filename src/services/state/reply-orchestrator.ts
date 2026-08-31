import { prisma } from '../../db/prisma.js';
import { WhatsAppInboundMessage, OutboundReplyPayload } from '../../core/types.js';
import { AIFactory } from '../ai/ai.factory.js';
import { WhatsAppFactory } from '../whatsapp/whatsapp.factory.js';
import { EmailFactory } from '../email/email.factory.js';
import { SessionManager } from './session-manager.js';
import { GmailAuthService } from '../email/gmail-auth.service.js';
import { GmailAdapter } from '../email/gmail.adapter.js';
import { decryptToken } from '../crypto/encryption.js';

import { IntentClassifierService } from '../ai/intent-classifier.service.js';

export interface WhatsAppProcessingResult {
  action: 'DRAFT_GENERATED' | 'EMAIL_SENT' | 'SESSION_RESET' | 'IGNORED' | 'ERROR';
  replyPreview?: string;
  sentEmailId?: string;
  message: string;
}

export class WhatsAppReplyOrchestrator {
  static async handleInboundWhatsAppMessage(
    inbound: WhatsAppInboundMessage,
    customProvider?: IWhatsAppProvider
  ): Promise<WhatsAppProcessingResult> {
    const whatsappNumber = inbound.from;
    const clientText = (inbound.text || inbound.body || (inbound as any).message || '').trim();

    const session = await SessionManager.getOrCreateSession(whatsappNumber);
    const whatsappProvider = customProvider || WhatsAppFactory.getProvider();

    // 3-Minute Inactivity Window
    const SESSION_TIMEOUT_MS = 3 * 60 * 1000;
    const sessionAgeMs = Date.now() - new Date(session.updatedAt).getTime();
    const isSessionExpired =
      (session.state === 'NOTIFIED' || session.state === 'PREVIEW_GENERATED') &&
      sessionAgeMs > SESSION_TIMEOUT_MS;

    // 1. Understand Intent using Groq LLM in ~150ms (Multilingual: English, Tamil, Hindi, Tanglish, Hinglish)
    const userIntent = await IntentClassifierService.classifyIntent(clientText, session.state);
    console.log(`🧠 [AI Intent Decoded] "${clientText}" ➔ INTENT: ${userIntent.intent} (${userIntent.extractedMeaning})`);

    // Check for cancel / reset command
    if (userIntent.intent === 'CANCEL_DRAFT') {
      const user = await prisma.user.findFirst({ where: { whatsappNumber } });
      if (user) {
        await prisma.whatsappSession.updateMany({
          where: { userId: user.id },
          data: {
            state: 'IDLE',
            activeThreadId: null,
            activeMessageId: null,
            generatedDraft: null,
            lastClientText: null,
            isSelectingMailbox: false,
          },
        });
      }

      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        [
          `*[SESSION CANCELLED]*`,
          `───────────────────────────`,
          `Active draft discarded and reply session closed.`,
          `Mailbox monitoring remains active in the background.`,
          ``,
          `• Reply *CHECK MAIL* to scan inbox.`,
          `• Reply *SWITCH* to change active mailbox.`,
          `• Reply *HELP* for full commands.`,
          `───────────────────────────`,
        ].join('\n')
      );
      return { action: 'SESSION_RESET', message: 'Active draft session cancelled and closed' };
    }

    // Explicit CONTINUE / RESUME command to reactivate email reply session
    if (userIntent.intent === 'CONTINUE') {
      const activeMessage = await (prisma.emailMessage as any).findFirst({
        where: {
          id: session.activeMessageId || undefined,
          isImportant: true,
          isIgnored: false,
          thread: {
            emailAccount: { user: { whatsappNumber } },
            outboundReplies: { none: { status: 'SENT' } },
          },
        },
        include: { thread: true },
        orderBy: { receivedAt: 'desc' },
      }) || await (prisma.emailMessage as any).findFirst({
        where: {
          isImportant: true,
          isIgnored: false,
          thread: {
            emailAccount: { user: { whatsappNumber } },
            outboundReplies: { none: { status: 'SENT' } },
          },
        },
        include: { thread: true },
        orderBy: { receivedAt: 'desc' },
      });

      if (!activeMessage) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          [
            `*[NO ACTIVE EMAIL]*`,
            `───────────────────────────`,
            `No pending emails waiting for a reply.`,
            `Send *CHECK MAIL* to view your inbox.`,
          ].join('\n')
        );
        return { action: 'IGNORED', message: 'No active email to continue' };
      }

      await SessionManager.setNotifiedState(whatsappNumber, activeMessage.threadId, activeMessage.id);

      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      const resumeLines = [
        isTamil
          ? `*[மின்னஞ்சல் பதில் அமர்வு தொடரப்பட்டது]*`
          : isHindi
            ? `*[ईमेल उत्तर सत्र पुनः सक्रिय]*`
            : `*[EMAIL REPLY SESSION ACTIVE]*`,
        `───────────────────────────`,
        `*From:* ${activeMessage.senderName || activeMessage.senderEmail}`,
        `*Subject:* ${activeMessage.subject}`,
        ``,
        `*Message:*`,
        `${activeMessage.cleanBody.trim().slice(0, 250)}`,
        ``,
        `───────────────────────────`,
        isTamil
          ? `பதிலளிக்க உங்கள் குரல் பதிவு அல்லது செய்தியை 3 நிமிடத்திற்குள் அனுப்பவும்.`
          : isHindi
            ? `उत्तर देने के लिए 3 मिनट के भीतर अपना संदेश या वॉइस नोट भेजें।`
            : `Reply with your voice note or text instruction within 3 minutes to draft your response!`,
      ];

      await whatsappProvider.sendTextMessage(whatsappNumber, resumeLines.join('\n'));
      return { action: 'IGNORED', message: `Resumed active reply session for email ${activeMessage.id}` };
    }

    // Check for UNKNOWN / Unclear voice message
    if (userIntent.intent === 'UNKNOWN') {
      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        [
          `*[COULD NOT UNDERSTAND]*`,
          `───────────────────────────`,
          `Could not clearly recognize your voice note or message.`,
          ``,
          `*Tips for accurate recognition:*`,
          `• Please speak clearly and pronounce words closer to the microphone.`,
          `• Speak in English, Tamil, or Hindi (e.g., _"Check mail"_, _"Mail vandhurka paaru"_, _"Send it"_).`,
          `• Or type your command directly.`,
          `───────────────────────────`,
        ].join('\n')
      );
      return { action: 'IGNORED', message: 'Voice note or message could not be recognized' };
    }

    // Check for SET_LANGUAGE command
    if (userIntent.intent === 'SET_LANGUAGE') {
      const selectedLang = userIntent.extractedLanguage || (
        /tamil/i.test(clientText) ? 'TAMIL' :
          /hindi/i.test(clientText) ? 'HINDI' : 'ENGLISH'
      );

      await (prisma.user as any).updateMany({
        where: { whatsappNumber },
        data: { preferredLanguage: selectedLang },
      });

      const langMessages: Record<string, string[]> = {
        TAMIL: [
          `*[மொழி அமைக்கப்பட்டது - தமிழ்]*`,
          `───────────────────────────`,
          `மின்னஞ்சல் அறிவிப்புகள் இனி தமிழில் உங்களுக்கு சுருக்கமாக அனுப்பப்படும்.`,
          `நீங்கள் குரல் பதிவு/வார்த்தைகளில் தமிழில் பதிலளித்தாலும், மின்னஞ்சல் கார்ப்பரேட் ஆங்கிலத்தில் (English) மட்டுமே அனுப்பப்படும்.`,
          `───────────────────────────`,
        ],
        HINDI: [
          `*[भाषा सेट की गई - हिन्दी]*`,
          `───────────────────────────`,
          `ईमेल सूचनाएं अब आपको हिन्दी में संक्षिप्त रूप में भेजी जाएंगी।`,
          `आपके जवाब पेशेवर अंग्रेजी (English) में ईमेल किए जाएंगे।`,
          `───────────────────────────`,
        ],
        ENGLISH: [
          `*[LANGUAGE SET - ENGLISH]*`,
          `───────────────────────────`,
          `Email notifications will be summarized and delivered in English.`,
          `Email replies will be drafted and sent in professional Corporate English.`,
          `───────────────────────────`,
        ],
      };

      const msgLines = langMessages[selectedLang] || langMessages.ENGLISH;
      await whatsappProvider.sendTextMessage(whatsappNumber, msgLines.join('\n'));

      return {
        action: 'IGNORED',
        message: `Preferred language updated to ${selectedLang}`,
      };
    }

    // SWITCH / LIST CONNECTED MAILBOXES
    if (userIntent.intent === 'SWITCH_MAILBOX') {
      const user = await prisma.user.findFirst({
        where: { whatsappNumber },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      });

      const accounts = user?.emailAccounts || [];
      if (accounts.length === 0) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[NO MAILBOXES LINKED]*\n───────────────────────────\nPlease link your email accounts at: http://localhost:3005/?step=2`
        );
        return { action: 'IGNORED', message: 'No linked mailboxes found' };
      }

      if (accounts.length === 1) {
        if (user) {
          await prisma.whatsappSession.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              whatsappNumber,
              activeEmailAccountId: accounts[0].id,
              isSelectingMailbox: false,
            },
            update: {
              activeEmailAccountId: accounts[0].id,
              isSelectingMailbox: false,
            },
          });
        }
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[SINGLE MAILBOX LINKED]*\n───────────────────────────\n📧 \`${accounts[0].emailAddress}\`\nThis is your only connected mailbox. To add more, visit: http://localhost:3005/?step=2`
        );
        return { action: 'IGNORED', message: 'Single mailbox active' };
      }

      const numbersEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const accountLines = accounts.map((acc, idx) => `${numbersEmoji[idx] || `${idx + 1}.`} ${acc.emailAddress}`);

      if (user) {
        await prisma.whatsappSession.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            whatsappNumber,
            isSelectingMailbox: true,
          },
          update: {
            isSelectingMailbox: true,
          },
        });
      }

      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        [
          `📬 *Select Active Mailbox:*`,
          `───────────────────────────`,
          ...accountLines,
          ``,
          `👉 *Reply with 1, 2, or 3* to select which mailbox to open and monitor.`,
          `───────────────────────────`,
        ].join('\n')
      );

      return { action: 'IGNORED', message: 'Mailbox selection prompt sent' };
    }

    // USER REPLIES NUMBER WHILE IN isSelectingMailbox MODE
    if (session.isSelectingMailbox && (/^\s*\d+\s*$/.test(clientText.trim()) || userIntent.extractedIndex)) {
      const selectedIndex = parseInt(clientText.trim(), 10) || userIntent.extractedIndex;
      const user = await prisma.user.findFirst({
        where: { whatsappNumber },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      });

      const accounts = user?.emailAccounts || [];
      if (selectedIndex && selectedIndex >= 1 && selectedIndex <= accounts.length) {
        const chosenAccount = accounts[selectedIndex - 1];

        await prisma.whatsappSession.update({
          where: { userId: user!.id },
          data: {
            activeEmailAccountId: chosenAccount.id,
            isSelectingMailbox: false,
          },
        });

        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          [
            `✅ *Active Mailbox Selected!*`,
            `───────────────────────────`,
            `📧 *Mailbox:* \`${chosenAccount.emailAddress}\``,
            `⚡ Monitoring & replies are now active for this account.`,
            `───────────────────────────`,
            `_Type *CHECK MAIL* to see unread emails or *SWITCH* to change mailbox._`,
          ].join('\n')
        );

        return { action: 'IGNORED', message: `Active mailbox set to ${chosenAccount.emailAddress}` };
      }
    }

    // SELECT SPECIFIC EMAIL BY NUMBER (e.g. "reply 2", "select 1", "3")
    if (userIntent.intent === 'SELECT_EMAIL' && userIntent.extractedIndex) {
      const targetIndex = userIntent.extractedIndex;
      const unrepliedEmails = await (prisma.emailMessage as any).findMany({
        where: {
          isImportant: true,
          isIgnored: false,
          actionRequired: { not: null },
          thread: {
            emailAccount: { user: { whatsappNumber } },
            outboundReplies: { none: { status: 'SENT' } },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 5,
      });

      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      if (targetIndex < 1 || targetIndex > unrepliedEmails.length) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[INVALID SELECTION]*\n───────────────────────────\nPlease select a number between 1 and ${unrepliedEmails.length}.`
        );
        return { action: 'IGNORED', message: 'Invalid email index selected' };
      }

      const selectedMsg = unrepliedEmails[targetIndex - 1];
      await SessionManager.setNotifiedState(whatsappNumber, selectedMsg.threadId, selectedMsg.id);

      const selectPrompt = [
        isTamil
          ? `*[மின்னஞ்சல் #${targetIndex} தேர்ந்தெடுக்கப்பட்டது]*`
          : isHindi
            ? `*[ईमेल #${targetIndex} चयनित]*`
            : `*[EMAIL #${targetIndex} SELECTED]*`,
        `───────────────────────────`,
        `*From:* ${selectedMsg.senderName || selectedMsg.senderEmail}`,
        `*Subject:* ${selectedMsg.subject}`,
        ``,
        `*Message:*`,
        `${selectedMsg.cleanBody.trim().slice(0, 300)}`,
        ``,
        `───────────────────────────`,
        isTamil
          ? `இந்த மின்னஞ்சலுக்கான உங்கள் பதிலை வாய்ஸ் நோட்டாகவோ அல்லது ஆங்கிலத்தில் தட்டச்சு செய்தோ அனுப்பவும்.`
          : isHindi
            ? `इस ईमेल का जवाब वॉइस नोट या टेक्स्ट में भेजें।`
            : `Reply with your voice note or text to draft your email reply.`,
      ].join('\n');

      await whatsappProvider.sendTextMessage(whatsappNumber, selectPrompt);

      return {
        action: 'IGNORED',
        message: `Selected email #${targetIndex} (${selectedMsg.id})`,
      };
    }

    // READ FULL EMAIL (e.g. "1 full", "read 1", "full 1", "mail 2 full")
    if (userIntent.intent === 'READ_FULL_EMAIL' && userIntent.extractedIndex) {
      const targetIndex = userIntent.extractedIndex;
      const unrepliedEmails = await (prisma.emailMessage as any).findMany({
        where: {
          isImportant: true,
          isIgnored: false,
          actionRequired: { not: null },
          thread: {
            emailAccount: { user: { whatsappNumber } },
            outboundReplies: { none: { status: 'SENT' } },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 5,
      });

      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      if (targetIndex < 1 || targetIndex > unrepliedEmails.length) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[INVALID SELECTION]*\n───────────────────────────\nPlease select a number between 1 and ${unrepliedEmails.length}.`
        );
        return { action: 'IGNORED', message: 'Invalid email index for full read' };
      }

      const selectedMsg = unrepliedEmails[targetIndex - 1];
      await SessionManager.setNotifiedState(whatsappNumber, selectedMsg.threadId, selectedMsg.id);

      const senderDisplay = selectedMsg.senderName
        ? `${selectedMsg.senderName} (${selectedMsg.senderEmail})`
        : selectedMsg.senderEmail;

      const dateStr = selectedMsg.receivedAt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const fullEmailPrompt = [
        isTamil
          ? `*[முழு மின்னஞ்சல் #${targetIndex}]*`
          : isHindi
            ? `*[पूरा ईमेल #${targetIndex}]*`
            : `*[FULL EMAIL #${targetIndex}]*`,
        `───────────────────────────`,
        `*From:* ${senderDisplay}`,
        `*Subject:* ${selectedMsg.subject}`,
        `*Received:* ${dateStr}`,
        ``,
        `*Full Email Content:*`,
        `${selectedMsg.cleanBody.trim().slice(0, 3500)}`,
        ``,
        `───────────────────────────`,
        isTamil
          ? `*பதிலளிக்க:* உங்கள் குரல் பதிவு அல்லது செய்தியை அனுப்பவும்.\n*அனுப்ப:* *SEND* அனுப்பவும்.\n*தவிர்க்க:* *IGNORE* அனுப்பவும்.`
          : isHindi
            ? `*उत्तर देने के लिए:* अपना संदेश या वॉइस नोट भेजें।\n*भेजने के लिए:* *SEND* भेजें।\n*छोड़ने के लिए:* *IGNORE* भेजें।`
            : `*To Reply:* Send your voice note or text.\n*To Send Draft:* Reply *SEND*.\n*To Skip:* Send *IGNORE*.`,
      ].join('\n');

      await whatsappProvider.sendTextMessage(whatsappNumber, fullEmailPrompt);

      return {
        action: 'IGNORED',
        message: `Displayed full email content for #${targetIndex} (${selectedMsg.id})`,
      };
    }

    // Check for "check mail" / "status" / "sync" in English, Tamil, Hindi
    if (userIntent.intent === 'CHECK_MAIL') {
      // Find connected email accounts for this WhatsApp user
      const user = await prisma.user.findFirst({
        where: { whatsappNumber },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      });

      const accounts = user?.emailAccounts || [];
      if (accounts.length === 0) {
        const fallbackAcc = await prisma.emailAccount.findFirst({
          where: {
            NOT: { emailAddress: { startsWith: 'oauth-test-' } },
          },
        });
        if (fallbackAcc) {
          accounts.push(fallbackAcc);
        }
      }

      if (accounts.length === 0) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          [
            `*[INBOX STATUS]*`,
            `───────────────────────────`,
            `No email account connected yet.`,
            `Connect your email at: http://localhost:3005/?step=2`,
            `───────────────────────────`,
          ].join('\n')
        );
        return { action: 'IGNORED', message: 'No connected email accounts found' };
      }

      // Resolve active mailbox
      let emailAccount = session.activeEmailAccountId
        ? accounts.find((acc) => acc.id === session.activeEmailAccountId)
        : null;

      if (!emailAccount) {
        emailAccount = accounts[0];
      }

      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        `*[CHECKING INBOX]*\n───────────────────────────\nScanning ${emailAccount.emailAddress} for new important emails...`
      );

      try {
        if (emailAccount.provider === 'IMAP_SMTP') {
          const { ImapSmtpService } = await import('../email/imap-smtp.service.js');
          await ImapSmtpService.syncRecentEmails(emailAccount.id, 10, true);
        } else {
          const { GmailSyncService } = await import('../email/gmail-sync.service.js');
          await GmailSyncService.syncRecentEmails(emailAccount.id, 10, true);
        }

        // 2. Query strictly IMPORTANT, actionable unreplied emails (up to 5)
        const unrepliedEmails = await (prisma.emailMessage as any).findMany({
          where: {
            isImportant: true,
            isIgnored: false,
            actionRequired: { not: null },
            thread: {
              emailAccountId: emailAccount.id,
              outboundReplies: { none: { status: 'SENT' } },
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 5,
        });

        const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
        const isTamil = userObj?.preferredLanguage === 'TAMIL';
        const isHindi = userObj?.preferredLanguage === 'HINDI';

        if (unrepliedEmails.length === 0) {
          await whatsappProvider.sendTextMessage(
            whatsappNumber,
            [
              `*[INBOX STATUS]*`,
              `───────────────────────────`,
              `*Account:* ${emailAccount.emailAddress}`,
              `*Status:* Up to date`,
              `*Pending Actionable Emails:* 0`,
              `_No pending emails waiting for a reply._`,
              `───────────────────────────`,
            ].join('\n')
          );
        } else {
          // Automatically bind the first unreplied email so the user can immediately reply
          const primary = unrepliedEmails[0];
          await SessionManager.setNotifiedState(whatsappNumber, primary.threadId, primary.id);

          const emailListLines: string[] = [];
          unrepliedEmails.forEach((em, idx) => {
            const sender = em.senderName || em.senderEmail;
            const snippet = (em.cleanBody || '').trim().slice(0, 120).replace(/\s+/g, ' ');
            emailListLines.push(
              `*${idx + 1}. From:* ${sender}\n    *Subject:* ${em.subject}\n    *Summary:* ${snippet}...`
            );
          });

          const statusLines = [
            isTamil
              ? `*[மின்னஞ்சல் நிலை - ${unrepliedEmails.length} பதிலளிக்கப்படாதவை]*`
              : isHindi
                ? `*[ईमेल स्थिति - ${unrepliedEmails.length} लंबित ईमेल]*`
                : `*[INBOX STATUS - ${unrepliedEmails.length} UNREPLIED EMAIL(S)]*`,
            `───────────────────────────`,
            `*Account:* ${emailAccount.emailAddress}`,
            ``,
            `*Recent Actionable Emails:*`,
            emailListLines.join('\n\n'),
            ``,
            `───────────────────────────`,
            isTamil
              ? `*தேர்ந்தெடுக்கப்பட்ட மின்னஞ்சல்:* #1 (${primary.senderName || primary.senderEmail})\n_பதிலளிக்க உங்கள் குரல் பதிவு அல்லது செய்தியை அனுப்பவும்._`
              : isHindi
                ? `*सक्रिय ईमेल चयनित:* #1 (${primary.senderName || primary.senderEmail})\n_उत्तर देने के लिए अपना संदेश या वॉइस नोट भेजें।_`
                : `*Active Email Selected:* #1 (${primary.senderName || primary.senderEmail})\n_Reply with your voice note or text to draft a response!_`,
          ];

          await whatsappProvider.sendTextMessage(whatsappNumber, statusLines.join('\n'));
        }
      } catch (err: any) {
        const { AuditLogger } = await import('../logging/audit-logger.service.js');
        AuditLogger.error('GMAIL_SYNC', `Check mail error for ${emailAccount.emailAddress}`, err);

        if (err.message?.includes('Insufficient Permission') || err.message?.includes('insufficient_scope')) {
          await whatsappProvider.sendTextMessage(
            whatsappNumber,
            [
              `*[GMAIL PERMISSIONS REQUIRED]*`,
              `───────────────────────────`,
              `*Account:* ${emailAccount.emailAddress}`,
              `Google reported: _Insufficient Permission_.`,
              ``,
              `👉 When signing in with Google, please check all permission checkboxes (to read & send emails).`,
              `👉 Re-link here: http://localhost:3005/?step=2`,
              `───────────────────────────`,
            ].join('\n')
          );
        } else if (err.message?.includes('invalid_grant') || err.message?.includes('token')) {
          await whatsappProvider.sendTextMessage(
            whatsappNumber,
            [
              `*[GMAIL RE-AUTHENTICATION REQUIRED]*`,
              `───────────────────────────`,
              `*Account:* ${emailAccount.emailAddress}`,
              `Your Gmail access token has expired.`,
              ``,
              `👉 Click to re-link: http://localhost:3005/?step=2`,
              `───────────────────────────`,
            ].join('\n')
          );
        } else {
          await whatsappProvider.sendTextMessage(
            whatsappNumber,
            `*[NOTICE]*\n───────────────────────────\nUnable to check inbox: ${err.message}`
          );
        }
      }

      return {
        action: 'IGNORED',
        message: `Live inbox check completed for ${emailAccount.emailAddress}`,
      };
    }

    // STATE: PREVIEW_GENERATED -> Client sends confirmation (SEND_REPLY via LLM or button)
    if (session.state === 'PREVIEW_GENERATED' && userIntent.intent === 'SEND_REPLY') {
      if (!session.activeThreadId || !session.activeMessageId || !session.generatedDraft) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[NOTICE]*\n───────────────────────────\nThere is no active draft waiting to be sent. Please reply to an email notification first.`
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

      let emailAccount = message.thread.emailAccount;

      // If the message's account has no tokens, fallback to the user's active authenticated Gmail account
      if (emailAccount.provider === 'GMAIL' && !emailAccount.encryptedAccessToken && !emailAccount.encryptedRefreshToken) {
        const activeAccount = await prisma.emailAccount.findFirst({
          where: {
            provider: 'GMAIL',
            OR: [
              { encryptedAccessToken: { not: null } },
              { encryptedRefreshToken: { not: null } },
            ],
          },
          orderBy: { updatedAt: 'desc' },
        });
        if (activeAccount) {
          emailAccount = activeAccount;
        }
      }

      let emailProvider;

      if (emailAccount.provider === 'GMAIL' && (emailAccount.encryptedAccessToken || emailAccount.encryptedRefreshToken)) {
        try {
          const authClient = await GmailAuthService.getAuthenticatedClientForAccount(emailAccount.id);
          emailProvider = new GmailAdapter(authClient);
        } catch (authErr: any) {
          await whatsappProvider.sendTextMessage(
            whatsappNumber,
            `*[GMAIL AUTHENTICATION ERROR]*\n───────────────────────────\nFailed to authenticate Gmail: ${authErr.message}\nPlease re-link at: http://localhost:3005/?step=2`
          );
          return { action: 'ERROR', message: authErr.message };
        }
      } else if (emailAccount.provider === 'IMAP_SMTP' && emailAccount.encryptedPassword && emailAccount.smtpHost) {
        const { ImapSmtpAdapter } = await import('../email/imap-smtp.adapter.js');
        emailProvider = new ImapSmtpAdapter({
          emailAddress: emailAccount.emailAddress,
          imapHost: emailAccount.imapHost || '',
          imapPort: emailAccount.imapPort || 993,
          imapUser: emailAccount.imapUser || emailAccount.emailAddress,
          smtpHost: emailAccount.smtpHost,
          smtpPort: emailAccount.smtpPort || 465,
          smtpUser: emailAccount.smtpUser || emailAccount.emailAddress,
          encryptedPassword: emailAccount.encryptedPassword,
        });
      } else if (emailAccount.provider === 'MOCK') {
        emailProvider = EmailFactory.getProvider();
      } else {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[EMAIL ACCOUNT NOT LINKED]*\n───────────────────────────\nNo active email credentials found.\nPlease connect your Gmail or Custom Business Email at: http://localhost:3005/?step=2`
        );
        return { action: 'ERROR', message: 'No active email credentials found' };
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
        `*[EMAIL SENT SUCCESSFULLY]*`,
        `───────────────────────────`,
        `*To:* ${message.senderName || message.senderEmail} (${message.senderEmail})`,
        `*Subject:* ${outboundPayload.subject}`,
        `*Thread ID:* ${message.thread.externalThreadId}`,
        ``,
        `_Your reply was delivered inside the original email conversation thread._`,
      ].join('\n');

      await whatsappProvider.sendTextMessage(whatsappNumber, confirmationText);

      // Check if there are other pending unreplied important emails in the queue
      const nextPendingMsg = await (prisma.emailMessage as any).findFirst({
        where: {
          isImportant: true,
          isIgnored: false,
          thread: {
            emailAccount: { user: { whatsappNumber } },
            outboundReplies: { none: { status: 'SENT' } },
          },
          id: { not: message.id },
        },
        orderBy: { receivedAt: 'desc' },
      });

      if (nextPendingMsg) {
        await SessionManager.setNotifiedState(whatsappNumber, nextPendingMsg.threadId, nextPendingMsg.id);
        const user = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
        const isTamil = user?.preferredLanguage === 'TAMIL';
        const isHindi = user?.preferredLanguage === 'HINDI';

        const queuePrompt = [
          isTamil ? `*[அடுத்த மின்னஞ்சல் வரிசையில் உள்ளது]*` : isHindi ? `*[अगला ईमेल कतार में है]*` : `*[NEXT EMAIL IN QUEUE]*`,
          `───────────────────────────`,
          `*From:* ${nextPendingMsg.senderName || nextPendingMsg.senderEmail}`,
          `*Subject:* ${nextPendingMsg.subject}`,
          ``,
          `*Message:*`,
          `${nextPendingMsg.cleanBody.trim().slice(0, 300)}`,
          ``,
          `───────────────────────────`,
          isTamil
            ? `இந்த மின்னஞ்சலுக்கான உங்கள் பதிலை வாய்ஸ் நோட்டாகவோ அல்லது ஆங்கிலத்தில் தட்டச்சு செய்தோ அனுப்பவும்.`
            : isHindi
              ? `इस ईमेल का जवाब वॉइस नोट या टेक्स्ट में भेजें।`
              : `Reply with your voice note or text to draft this email reply.`,
        ].join('\n');

        await whatsappProvider.sendTextMessage(whatsappNumber, queuePrompt);
      }

      return {
        action: 'EMAIL_SENT',
        sentEmailId: outbound.id,
        message: 'Email reply sent and thread preserved',
      };
    }

    // Inactivity Timeout Check (>3 minutes since last email notification or preview)
    if (isSessionExpired && userIntent.intent !== 'SEND_REPLY') {
      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        [
          isTamil
            ? `⏱️ *[பதில் நேரம் முடிந்தது]*`
            : isHindi
              ? `⏱️ *[उत्तर सत्र समाप्त]*`
              : `⏱️ *[REPLY WINDOW TIMED OUT]*`,
          `───────────────────────────`,
          isTamil
            ? `3 நிமிடங்கள் ஆகியதால் முந்தைய மின்னஞ்சல் பதில் அமர்வு முடிவடைந்தது.`
            : isHindi
              ? `3 मिनट की निष्क्रियता के कारण ईमेल उत्तर सत्र बंद हो गया है।`
              : `The 3-minute active reply window for your previous email has expired.`,
          ``,
          isTamil
            ? `• இந்த மின்னஞ்சலுக்குப் பதிலளிக்க *CONTINUE* என அனுப்பவும்.\n• நிலுவையில் உள்ள மின்னஞ்சல்களைப் பார்க்க *CHECK MAIL* என அனுப்பவும்.`
            : isHindi
              ? `• इस ईमेल का उत्तर देने के लिए *CONTINUE* भेजें।\n• लंबित ईमेल देखने के लिए *CHECK MAIL* भेजें।`
              : `• Reply *CONTINUE* to resume drafting a reply to this email.\n• Reply *CHECK MAIL* to view all pending emails.\n• Reply *HELP* for assistant commands.`,
          `───────────────────────────`,
        ].join('\n')
      );
      return { action: 'IGNORED', message: 'Ignored text because active reply window timed out (>3m)' };
    }

    // STATE: IDLE -> Do not draft replies to old emails on random casual chat
    if (session.state === 'IDLE' && userIntent.intent === 'DRAFT_REPLY') {
      await whatsappProvider.sendTextMessage(
        whatsappNumber,
        [
          `💬 *SS40 AI Assistant*`,
          `───────────────────────────`,
          `No active email reply session is open.`,
          ``,
          `• Send *CHECK MAIL* to view your pending inbox.`,
          `• Send *CONTINUE* to reply to your last email.`,
          `• Send *HELP* for full commands & tips.`,
          `───────────────────────────`,
        ].join('\n')
      );
      return { action: 'IGNORED', message: 'Ignored casual chat in IDLE state' };
    }

    // STATE: NOTIFIED or revising PREVIEW_GENERATED -> Generate AI Reply Draft
    if (session.state === 'NOTIFIED' || session.state === 'PREVIEW_GENERATED') {
      let targetMessageId = session.activeMessageId;

      if (!targetMessageId) {
        // Find latest unreplied important email
        const unrepliedMsg = await (prisma.emailMessage as any).findFirst({
          where: {
            isImportant: true,
            isIgnored: false,
            thread: {
              emailAccount: { user: { whatsappNumber } },
              outboundReplies: { none: { status: 'SENT' } },
            },
          },
          orderBy: { receivedAt: 'desc' },
        });

        if (unrepliedMsg) {
          targetMessageId = unrepliedMsg.id;
          session.activeMessageId = unrepliedMsg.id;
          session.activeThreadId = unrepliedMsg.threadId;
        }
      }

      if (!targetMessageId) {
        await whatsappProvider.sendTextMessage(
          whatsappNumber,
          `*[NO ACTIVE EMAIL]*\n───────────────────────────\nNo pending email is waiting for a reply.\nSend *CHECK MAIL* to scan your inbox.`
        );
        return { action: 'IGNORED', message: 'No active email message in session' };
      }

      const activeMessage = await prisma.emailMessage.findUnique({
        where: { id: targetMessageId },
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

      // Format WhatsApp Preview
      const previewText = [
        `*[AI EMAIL DRAFT PREVIEW]*`,
        `───────────────────────────`,
        `*To:* ${activeMessage.senderName || activeMessage.senderEmail} (${activeMessage.senderEmail})`,
        `*Subject:* ${aiReply.subject}`,
        ``,
        `*Drafted Reply:*`,
        `${aiReply.replyBody}`,
        ``,
        `───────────────────────────`,
        `*ACTIONS:*`,
        `- Reply *SEND* to dispatch this email`,
        `- Reply with edits to adjust the draft`,
        `- Reply *CANCEL* to discard`,
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

    // GREETING (hi, hello, vanakkam, namaste, help) -> Intro Menu & Mailbox Selector
    if (userIntent.intent === 'HELP') {
      const userObj = (await prisma.user.findFirst({
        where: { whatsappNumber },
        include: { emailAccounts: { orderBy: { createdAt: 'asc' } } },
      })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';
      const accounts = userObj?.emailAccounts || [];

      const numbersEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const accountLines = accounts.map((acc: any, idx: number) => {
        const isCurrent = (session.activeEmailAccountId === acc.id || (!session.activeEmailAccountId && idx === 0)) ? ' ⚡ *(Active)*' : '';
        return `${numbersEmoji[idx] || `${idx + 1}.`} ${acc.emailAddress}${isCurrent}`;
      });

      // If multiple accounts exist, enable mailbox selection mode
      if (accounts.length > 1 && userObj) {
        await prisma.whatsappSession.upsert({
          where: { userId: userObj.id },
          create: {
            userId: userObj.id,
            whatsappNumber,
            isSelectingMailbox: true,
          },
          update: {
            isSelectingMailbox: true,
          },
        });
      }

      const mailboxSection = accounts.length > 0 ? [
        ``,
        `📧 *Connected Mailboxes (${accounts.length}):*`,
        ...accountLines,
        ...(accounts.length > 1 ? [``, `👉 *Reply with 1, 2, or 3* to select which mailbox to open and monitor.`] : []),
      ] : [];

      const greetingLines = [
        `*SS40 NETWORK AI EMAIL ASSISTANT*`,
        `───────────────────────────`,
        `*Status:* Active & Monitoring Inbox`,
        ...mailboxSection,
        ``,
        `*Commands & Instructions:*`,
        isTamil
          ? `• *CHECK MAIL* (குரல் பதிவு / உரை) அனுப்பினால் இன்பாக்ஸ் சரிபார்க்கப்படும்.\n• *SWITCH* அனுப்பினால் மின்னஞ்சலை மாற்றலாம்.\n• *SET LANGUAGE TAMIL*, *HINDI*, அல்லது *ENGLISH* மூலம் மொழியை மாற்றலாம்.\n• *SUPPORT* அனுப்பினால் தொடர்பு விவரங்களை பெறலாம்.\n• புதிய மின்னஞ்சல் வந்தால் உங்கள் குரல் பதிவு மூலம் பதிலளிக்கலாம்.\n• *SEND* அனுப்பினால் மின்னஞ்சல் அனுப்பப்படும்.\n• *IGNORE* / *IGNORE ALL* மூலம் மின்னஞ்சல்களை தவிர்க்கலாம்.`
          : isHindi
            ? `• *CHECK MAIL* (वॉइस नोट / टेक्स्ट) भेजकर इनबॉक्स चेक करें।\n• *SWITCH* भेजकर ईमेल बदलें।\n• *SET LANGUAGE HINDI*, *TAMIL*, या *ENGLISH* से भाषा बदलें।\n• *SUPPORT* भेजकर संपर्क विवरण देखें।\n• नया ईमेल आने पर वॉइस नोट द्वारा उत्तर दें।\n• *SEND* भेजकर ईमेल भेजें।\n• *IGNORE* / *IGNORE ALL* से ईमेल छोड़ें।`
            : `• Send *CHECK MAIL* (or voice note) to scan your inbox.\n• Send *SWITCH* to change your active mailbox.\n• Send *SET LANGUAGE TAMIL*, *HINDI*, or *ENGLISH* to customize translations.\n• Send *SUPPORT* to view contact channels & website.\n• When an email arrives, reply via voice note or text in any language.\n• Reply *SEND* to approve and dispatch in Corporate English.\n• Send *IGNORE* (next email) or *IGNORE ALL* (stop review).`,
        `───────────────────────────`,
      ];

      await whatsappProvider.sendTextMessage(whatsappNumber, greetingLines.join('\n'));
      return {
        action: 'IGNORED',
        message: 'Intro menu sent for greeting with mailbox selector',
      };
    }

    // SUPPORT / CONTACT
    if (userIntent.intent === 'SUPPORT') {
      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      const supportLines = [
        `*SS40 NETWORK SUPPORT*`,
        `───────────────────────────`,
        isTamil
          ? `உங்களுக்கு உதவி அல்லது ஆதரவு தேவைப்பட்டால், எங்கள் வலைத்தளத்தைப் பார்வையிடவும்:\n*வலைத்தளம்:* https://www.ss40network.com\n\nஇங்கே நீங்கள் எங்கள் தொடர்பு விவரங்களை (Contacts) சரிபார்க்கலாம்.\n\n*மின்னஞ்சல்:* support@ss40network.com`
          : isHindi
            ? `यदि आपको सहायता की आवश्यकता है, तो हमारी वेबसाइट देखें:\n*वेबसाइट:* https://www.ss40network.com\n\nयहाँ आप हमारे संपर्क विवरण (Contacts) देख सकते हैं।\n\n*ईमेल:* support@ss40network.com`
            : `If you need support or assistance, please check out our website:\n*Website:* https://www.ss40network.com\n\nCheck it out here to view our direct contact channels and team details.\n\n*Support Email:* support@ss40network.com`,
        `───────────────────────────`,
      ];

      await whatsappProvider.sendTextMessage(whatsappNumber, supportLines.join('\n'));
      return {
        action: 'IGNORED',
        message: 'Sent SS40 Network support and website contact info',
      };
    }

    // THANKS / GRATITUDE
    if (userIntent.intent === 'THANKS') {
      const userObj = (await prisma.user.findFirst({ where: { whatsappNumber } })) as any;
      const isTamil = userObj?.preferredLanguage === 'TAMIL';
      const isHindi = userObj?.preferredLanguage === 'HINDI';

      const thanksLines = [
        `*SS40 NETWORK AI EMAIL ASSISTANT*`,
        `───────────────────────────`,
        isTamil
          ? `நன்றி எனக்கு அல்ல, SS40 NETWORK-க்கு சொல்லுங்கள்! நான் SS40 NETWORK பொறியாளர்களால் உருவாக்கப்பட்ட உங்கள் AI மின்னஞ்சல் உதவியாளர்.\n\nஎப்படியிருந்தாலும், மிக்க மகிழ்ச்சி! உங்களுக்கு உதவ நான் எப்போதும் தயாராக உள்ளேன்.`
          : isHindi
            ? `धन्यवाद मुझे नहीं, SS40 NETWORK को कहें! मैं SS40 NETWORK इंजीनियर्स द्वारा विकसित आपका AI ईमेल सहायक हूँ।\n\nवैसे आपका स्वागत है! मुझे आपकी मदद करके खुशी हुई।`
            : `Thanks to SS40 NETWORK, not me! I'm your email assistant developed by SS40 NETWORK Engineers.\n\nAnyways, welcome! I'm happy to help you.`,
        `───────────────────────────`,
      ];

      await whatsappProvider.sendTextMessage(whatsappNumber, thanksLines.join('\n'));
      return {
        action: 'IGNORED',
        message: 'Sent SS40 Network appreciation message for gratitude',
      };
    }

    return {
      action: 'IGNORED',
      message: 'Unrecognized user action',
    };
  }
}
