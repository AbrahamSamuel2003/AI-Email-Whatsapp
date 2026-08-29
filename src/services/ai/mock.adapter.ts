import { IAIProvider } from './ai.interface.js';
import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NotificationType } from '../../core/types.js';

export class MockAIAdapter implements IAIProvider {
  async classifyImportance(email: EmailMetadata): Promise<AIImportanceResult> {
    const text = `${email.subject} ${email.cleanBody} ${email.senderEmail} ${email.senderName || ''}`.toLowerCase();

    // 1. Detect OTP, Verification Codes, 2FA, Password Resets & Security Alerts (ALERT_ONLY)
    const isOtp =
      text.includes('verification code') ||
      text.includes('login code') ||
      text.includes('otp') ||
      text.includes('security code') ||
      text.includes('password reset') ||
      text.includes('2-step verification') ||
      text.includes('security alert') ||
      text.includes('your password was changed');

    if (isOtp) {
      // Extract code if present (4-8 digits or alphanumeric code)
      const codeMatch =
        email.cleanBody.match(/\b([0-9]{4,8}|[0-9]{3}-[0-9]{3})\b/) ||
        email.subject.match(/\b([0-9]{4,8}|[0-9]{3}-[0-9]{3})\b/);

      const extractedCode = codeMatch ? codeMatch[1] : undefined;

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

    // 2. Check for NOT IMPORTANT (Marketing, newsletters, promo digests, bulk announcements)
    const isPromoOrMarketing =
      text.includes('off pg analytics') ||
      text.includes('flat ₹') ||
      text.includes('special offer') ||
      text.includes('discount') ||
      text.includes('sale') ||
      text.includes('promo') ||
      text.includes('one api key for every major model') ||
      text.includes('shared some google account data with') ||
      text.includes('privacy policy');

    const isJobPortal =
      text.includes('jobs matching your profile') ||
      text.includes('naukri') ||
      text.includes('indeed') ||
      text.includes('linkedin job') ||
      text.includes('recruiter');

    const isNewsletterOrDigest =
      text.includes('newsletter') ||
      text.includes('digest') ||
      text.includes('welcome to roadmap.sh') ||
      text.includes('roadmap.sh') ||
      text.includes('free month of chatgpt') ||
      text.includes('match a style from a photo') ||
      text.includes('try devin') ||
      text.includes('edit your favorite photos') ||
      text.includes('translate anything') ||
      text.includes('plan a quick vocabulary') ||
      text.includes('more access to advanced tools') ||
      text.includes('free webinar') ||
      text.includes('unsubscribe') ||
      text.includes('opt out');

    if (isPromoOrMarketing || isJobPortal || isNewsletterOrDigest) {
      return {
        isImportant: false,
        notificationType: 'NONE',
        confidence: 0.95,
        urgency: 'LOW',
        summary: `Automated/promotional email: ${email.subject}`,
        actionRequired: undefined,
        reasoning: 'Automated newsletter, promotional broadcast, or commercial marketing digest.',
      };
    }

    // 3. Default for Direct Human Communication (ACTIONABLE)
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
    let bodyText = '';

    if (/tomorrow\s*(at)?\s*11/i.test(note) || /11\s*(am)?\s*(is\s*fine|works)/i.test(note)) {
      bodyText = `Hi ${context.senderName || 'there'},\n\nTomorrow at 11:00 AM works perfectly for me. We can connect and discuss then.\n\nRegards,\n${context.clientName}`;
    } else if (/yes|agree|sounds good|approved|fine/i.test(note)) {
      bodyText = `Hi ${context.senderName || 'there'},\n\nThank you for reaching out. That sounds good to me, let's proceed.\n\nRegards,\n${context.clientName}`;
    } else if (/no|can't|busy|reschedule/i.test(note)) {
      bodyText = `Hi ${context.senderName || 'there'},\n\nThank you for checking in. Unfortunately, I won't be available at that time. Could we reschedule for later this week?\n\nRegards,\n${context.clientName}`;
    } else {
      bodyText = `Hi ${context.senderName || 'there'},\n\n${note.charAt(0).toUpperCase() + note.slice(1)}.\n\nRegards,\n${context.clientName}`;
    }

    return {
      subject: `Re: ${context.subject.replace(/^Re:\s*/i, '')}`,
      replyBody: bodyText,
      closing: `Regards,\n${context.clientName}`,
    };
  }
}
