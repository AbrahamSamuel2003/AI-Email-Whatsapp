import { IAIProvider } from './ai.interface.js';
import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NotificationType } from '../../core/types.js';
import { removeEmojis } from '../../core/text-sanitizer.js';

export class MockAIAdapter implements IAIProvider {
  async classifyImportance(email: EmailMetadata, _preferredLanguage?: string): Promise<AIImportanceResult> {
    const text = `${email.subject} ${email.cleanBody} ${email.senderEmail} ${email.senderName || ''}`.toLowerCase();

    // 1. Detect Real OTP, Verification Codes, 2FA & Security Alerts (ALERT_ONLY)
    const isExplicitOtp =
      text.includes('verification code') ||
      text.includes('login code') ||
      text.includes('your code is') ||
      text.includes('one-time password') ||
      text.includes('2-step verification') ||
      text.includes('password reset code') ||
      text.includes('security code');

    const isSecurityNotice =
      text.includes('security alert') ||
      text.includes('password was changed') ||
      text.includes('account access granted') ||
      text.includes('unauthorized access');

    if (isExplicitOtp || isSecurityNotice) {
      let extractedCode: string | undefined = undefined;

      if (isExplicitOtp) {
        // Strict pattern: Look for numeric code preceded by trigger word or isolated 6-digit number
        const explicitMatch =
          email.cleanBody.match(/(?:code|otp|pin|passcode|is)\s*(?:is)?[:\s]+([0-9]{4,8}|[0-9]{3}-[0-9]{3})/i) ||
          email.subject.match(/(?:code|otp|pin|passcode|is)\s*(?:is)?[:\s]+([0-9]{4,8}|[0-9]{3}-[0-9]{3})/i) ||
          email.cleanBody.match(/\b([0-9]{6})\b/);

        if (explicitMatch && explicitMatch[1]) {
          const candidate = explicitMatch[1].trim();
          // Guard against years (2020-2030)
          if (!/^(202[0-9]|2030)$/.test(candidate)) {
            extractedCode = candidate;
          }
        }
      }

      return {
        isImportant: true,
        notificationType: 'ALERT_ONLY',
        extractedCode,
        confidence: 0.98,
        urgency: 'HIGH',
        summary: `Security / Authentication alert: ${email.subject}`,
        actionRequired: extractedCode
          ? `Use verification code: ${extractedCode}`
          : 'Security event detected. Review if unauthorized.',
        reasoning: 'Critical authentication code or security alert requiring immediate user awareness (no email reply expected).',
      };
    }

    // 2. Check for Social Media, Automated Platforms, Bulk Circulars & Marketing (STRICT NONE)
    const isSocialMedia =
      text.includes('instagram') ||
      text.includes('facebookmail') ||
      text.includes('linkedin') ||
      text.includes('twitter') ||
      text.includes('x.com') ||
      text.includes('tiktok') ||
      text.includes('reddit') ||
      text.includes('pinterest') ||
      text.includes('quora') ||
      text.includes('medium.com') ||
      text.includes('youtube') ||
      text.includes('twitch') ||
      text.includes('spotify') ||
      text.includes('discord');

    const isPromoOrMarketing =
      text.includes('off pg analytics') ||
      text.includes('flat ₹') ||
      text.includes('special offer') ||
      text.includes('discount') ||
      text.includes('sale') ||
      text.includes('promo') ||
      text.includes('deal of the day') ||
      text.includes('coupon') ||
      text.includes('cashback') ||
      text.includes('privacy policy') ||
      text.includes('terms of service update') ||
      text.includes('shared some google account data with') ||
      text.includes('official invitation: executive') ||
      text.includes('upskilling track') ||
      text.includes('free webinar') ||
      text.includes('broadcast');

    const isJobPortal =
      text.includes('jobs matching your profile') ||
      text.includes('naukri') ||
      text.includes('indeed') ||
      text.includes('glassdoor');

    const isNewsletterOrDigest =
      text.includes('newsletter') ||
      text.includes('digest') ||
      text.includes('weekly update') ||
      text.includes('monthly recap') ||
      text.includes('roadmap.sh') ||
      text.includes('free month of chatgpt') ||
      text.includes('try devin') ||
      text.includes('unsubscribe') ||
      text.includes('opt out');

    if (isSocialMedia || isPromoOrMarketing || isJobPortal || isNewsletterOrDigest) {
      return {
        isImportant: false,
        notificationType: 'NONE',
        confidence: 0.95,
        urgency: 'LOW',
        summary: `Automated social/promotional email: ${email.subject}`,
        actionRequired: undefined,
        reasoning: 'Automated social media digest, newsletter, promotional broadcast, or commercial marketing update.',
      };
    }

    // 3. Automated No-Reply Transactional Alerts (ALERT_ONLY)
    const isNoReply =
      email.senderEmail.includes('no-reply') ||
      email.senderEmail.includes('noreply') ||
      email.senderEmail.includes('donotreply') ||
      email.senderEmail.includes('googleplay-noreply') ||
      email.senderEmail.includes('notifications@');

    if (isNoReply) {
      return {
        isImportant: true,
        notificationType: 'ALERT_ONLY',
        confidence: 0.9,
        urgency: 'MEDIUM',
        summary: `Automated notification: ${email.subject}`,
        actionRequired: undefined,
        reasoning: 'Automated transactional notification from a no-reply address (no reply possible).',
      };
    }

    // 4. Default for Direct 1-to-1 Human Communication (ACTIONABLE)
    return {
      isImportant: true,
      notificationType: 'ACTIONABLE',
      confidence: 0.95,
      urgency: text.includes('urgent') || text.includes('asap') ? 'HIGH' : 'MEDIUM',
      summary: `${email.senderName || 'Sender'} sent: ${email.subject}`,
      actionRequired: 'Review correspondence and reply if needed.',
      reasoning: 'Direct human communication or work inquiry requiring attention.',
    };
  }

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    const note = context.clientInstruction.trim();
    const recipient = context.senderName || 'there';
    const clientName = context.clientName || 'Executive Client';
    let bodyText = '';

    // 1. Check for specific time / date expressions (e.g. "Tomorrow evening 5 is fine for me", "5pm works", "Monday at 11")
    const timeMatch = note.match(/(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(?:morning|afternoon|evening|night)?\s*(?:at\s*)?(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i);
    const dayMatch = note.match(/\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const periodMatch = note.match(/\b(morning|afternoon|evening|night)\b/i);

    if (timeMatch && timeMatch[1]) {
      const rawHour = parseInt(timeMatch[1], 10);
      const isEvening = periodMatch && (periodMatch[1].toLowerCase() === 'evening' || periodMatch[1].toLowerCase() === 'night');
      const meridiem = timeMatch[2]?.toUpperCase() || (isEvening || (rawHour >= 1 && rawHour <= 7) ? 'PM' : 'AM');
      const formattedTime = `${timeMatch[1].includes(':') ? timeMatch[1] : `${timeMatch[1]}:00`} ${meridiem}`;
      
      const dayPart = dayMatch ? dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1).toLowerCase() : 'Tomorrow';
      const periodPart = periodMatch ? ` ${periodMatch[1].toLowerCase()}` : '';

      bodyText = `Hi ${recipient},\n\n${dayPart}${periodPart} at ${formattedTime} works perfectly for me. We can connect and discuss then.\n\nRegards,\n${clientName}`;
    } else if (/^(yes|sure|okay|ok|yep|agree|sounds good|approved|fine|confirmed)$/i.test(note.replace(/[.!]/g, ''))) {
      bodyText = `Hi ${recipient},\n\nThank you for reaching out. That sounds good to me, let's proceed.\n\nRegards,\n${clientName}`;
    } else if (/^(no|can't|busy|cannot|not possible|reschedule)$/i.test(note.replace(/[.!]/g, ''))) {
      bodyText = `Hi ${recipient},\n\nThank you for checking in. Unfortunately, I won't be available at that time. Could we reschedule for another time?\n\nRegards,\n${clientName}`;
    } else {
      let formattedNote = note.charAt(0).toUpperCase() + note.slice(1);
      if (!/[.?!]$/.test(formattedNote)) formattedNote += '.';
      bodyText = `Hi ${recipient},\n\n${formattedNote}\n\nRegards,\n${clientName}`;
    }

    return {
      subject: removeEmojis(`Re: ${context.subject.replace(/^Re:\s*/i, '')}`),
      replyBody: removeEmojis(bodyText),
      closing: removeEmojis(`Regards,\n${clientName}`),
    };
  }

  async generateNewEmailDraft(context: import('../../core/types.js').NewEmailComposeContext): Promise<import('../../core/types.js').NewEmailComposeResult> {
    const note = context.clientInstruction.trim();
    const recipientUser = context.recipientEmail.split('@')[0] || 'Sir/Madam';
    const cleanRecipient = recipientUser.charAt(0).toUpperCase() + recipientUser.slice(1);
    const clientName = context.clientName || 'Samuel';

    // 1. Dynamic, context-aware Subject line generation
    let subject = '';
    if (/intern|selected|selection|offer|hiring|joining/i.test(note)) {
      subject = 'Internship Selection & Joining Details - SS40 Network';
    } else if (/meeting|schedule|connect|zoom|call/i.test(note)) {
      subject = 'Meeting Request & Discussion';
    } else if (/quote|pricing|cost|invoice|estimate/i.test(note)) {
      subject = 'Quotation & Pricing Information';
    } else if (/urgent|asap|important/i.test(note)) {
      subject = 'Important Update / Follow-up';
    } else if (/project|proposal|status|report/i.test(note)) {
      subject = 'Project Proposal & Status Update';
    } else {
      const words = note.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 6).join(' ');
      subject = words.charAt(0).toUpperCase() + words.slice(1);
    }

    // 2. Natural, professional message formatting without rigid boilerplate templates
    let cleanMessage = note.charAt(0).toUpperCase() + note.slice(1);
    if (!/[.?!]$/.test(cleanMessage)) cleanMessage += '.';

    const body = `Dear ${cleanRecipient},\n\n${cleanMessage}\n\nBest regards,\n${clientName}`;

    return {
      subject: removeEmojis(subject),
      body: removeEmojis(body),
    };
  }
}
