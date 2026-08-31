import { config } from '../../config/env.js';

export type UserIntentType =
  | 'CHECK_MAIL'
  | 'SEND_REPLY'
  | 'CANCEL_DRAFT'
  | 'IGNORE_CURRENT'
  | 'IGNORE_ALL'
  | 'SELECT_EMAIL'
  | 'READ_FULL_EMAIL'
  | 'THANKS'
  | 'SUPPORT'
  | 'DRAFT_REPLY'
  | 'SET_LANGUAGE'
  | 'HELP'
  | 'UNKNOWN';

export interface UserIntentResult {
  intent: UserIntentType;
  confidence: number;
  extractedMeaning: string;
  extractedLanguage?: 'ENGLISH' | 'TAMIL' | 'HINDI';
  extractedIndex?: number;
}

export class IntentClassifierService {
  /**
   * Uses Groq LPU LLM to understand natural language / voice transcripts
   * in English, Tamil (Tanglish), Hindi (Hinglish), and extract user intent in ~150ms.
   */
  static async classifyIntent(
    userInput: string,
    sessionState: string
  ): Promise<UserIntentResult> {
    const norm = userInput.toLowerCase().trim();

    // Fast-path 1: Instant 0ms greeting detection
    if (/^(hi|hello|hey|vanakkam|vannakam|namaste|namasthe|வணக்கம்|नमस्ते)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'HELP',
        confidence: 1.0,
        extractedMeaning: 'User is greeting the assistant',
      };
    }

    // Fast-path 2: Instant 0ms support / contact info
    if (/^(support|contact\s*support|helpdesk|customer\s*care|contact|website|help\s*desk)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'SUPPORT',
        confidence: 1.0,
        extractedMeaning: 'User wants support information',
      };
    }

    // Fast-path 3: Instant 0ms gratitude detection
    if (/^(thanks|thank you|thank u|thx|tq|nandri|nanri|dhanyawad|dhanyavad|shukriya)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'THANKS',
        confidence: 1.0,
        extractedMeaning: 'User is expressing gratitude',
      };
    }

    // Fast-path 3: Instant 0ms read full email (e.g. "1 full", "read 1", "full 1", "mail 2 full")
    const readFullMatch =
      norm.match(/^(?:read|show|view|open)?\s*(?:mail|email)?\s*([1-5])\s*(?:full|complete|fully|muzhuvadhum)$/i) ||
      norm.match(/^(?:full|complete|read|show)\s*(?:mail|email)?\s*([1-5])$/i);
    if (readFullMatch) {
      return {
        intent: 'READ_FULL_EMAIL',
        confidence: 1.0,
        extractedMeaning: `User wants to read full email #${readFullMatch[1]}`,
        extractedIndex: parseInt(readFullMatch[1]),
      };
    }

    // Fast-path 4: Instant 0ms send confirmation
    if (/^(send|send\s*it|yes|ok|okay|anupu|send\s*pannu|bhejo|theek\s*hai|sari|haan)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'SEND_REPLY',
        confidence: 1.0,
        extractedMeaning: 'User confirmed sending draft',
      };
    }

    // Fast-path 5: Instant 0ms cancel / reset
    if (/^(cancel|reset|clear|vendam)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'CANCEL_DRAFT',
        confidence: 1.0,
        extractedMeaning: 'User cancelled draft',
      };
    }

    // Fast-path 6: Instant 0ms ignore / ignore all
    if (/^(ignore\s*all|skip\s*all|stop\s*all|stop|ellam\s*vendam|cancel\s*all|bas\s*karo)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'IGNORE_ALL',
        confidence: 1.0,
        extractedMeaning: 'User wants to ignore all emails',
      };
    }

    if (/^(ignore|skip|next|adutha\s*mail|thavir|aage\s*badho)[\s!.]*$/i.test(norm)) {
      return {
        intent: 'IGNORE_CURRENT',
        confidence: 1.0,
        extractedMeaning: 'User wants to skip current email',
      };
    }

    const apiKey = config.GROQ_API_KEY;
    if (!apiKey) {
      return this.fallbackRegex(userInput, sessionState);
    }

    const modelName = config.GROQ_MODEL_NAME || 'openai/gpt-oss-20b';

    const prompt = `You are an AI intent classifier for an executive email assistant.
The user sends a WhatsApp message or voice transcription in English, Tamil (தமிழ் / Tanglish like "mail check pannu", "anupu", "naalaiku 3pm sollu"), or Hindi (हिन्दी / Hinglish like "mail dekho", "bhej do", "kal ka bol do").

Current Session State: "${sessionState}"
User Message: "${userInput}"

Analyze the user's message and determine the INTENT:
- "HELP": User is greeting (e.g. "hi", "hello", "hey", "vanakkam", "vannakam", "namaste", "namasthe", "வணக்கம்", "नमस्ते") or asking what the assistant does or asking for help.
- "SUPPORT": User is asking for support, customer care, website link, or contact information (e.g. "support", "contact support", "helpdesk", "website", "who made you").
- "THANKS": User is casually thanking the assistant / expressing standalone gratitude (e.g. "thanks", "thank you", "nandri", "dhanyawad", "thank you so much").
- "CHECK_MAIL": User explicitly wants to check their inbox, scan for new emails, check status, or asks if new mail arrived (e.g. "check mail", "check my email", "mail vandhurka", "mail paaru", "mail check pannu", "status", "sync").
- "READ_FULL_EMAIL": User wants to read the full body / complete details of a specific numbered email (e.g. "1 full", "read 1", "full 1", "mail 2 full", "read mail 3", "show 1 full").
- "SELECT_EMAIL": User specifies a number to pick an email to reply to (e.g. "reply 2", "select 1", "choose 3", "mail 2", "2", "3", "first mail").
- "SEND_REPLY": User is approving/confirming to dispatch an active email draft (e.g. "send", "send it", "yes", "ok", "okay", "anupu", "send pannu", "bhejo", "theek hai", "haan").
- "CANCEL_DRAFT": User wants to discard/cancel/reset the current draft (e.g. "cancel", "reset", "clear", "vendam", "mat bhejo").
- "IGNORE_CURRENT": User wants to skip the currently shown email and move to the next one (e.g. "ignore", "skip", "next", "adutha mail", "thavirkavum", "aage badho", "chodo isko").
- "IGNORE_ALL": User wants to stop reviewing emails / ignore all remaining (e.g. "ignore all", "skip all", "stop", "ellam vendam", "cancel all", "bas karo").
- "SET_LANGUAGE": User wants to change language preference (e.g. "set language to Tamil", "language hindi", "set english").
- "DRAFT_REPLY": User is providing ANY content, thoughts, thanks, responses, notes, or instructions to reply to an email (e.g. "Thanks for your call...", "I will be there", "Naalaiku 11am ok", "Tell him yes"). NOTE: If Session State is "NOTIFIED" or "PREVIEW_GENERATED", ANY natural message expressing a response or thought MUST be classified as "DRAFT_REPLY".
- "UNKNOWN": ONLY for completely unintelligible audio or meaningless noise.

Output MUST be a single raw JSON object:
{
  "intent": "CHECK_MAIL" | "READ_FULL_EMAIL" | "SELECT_EMAIL" | "SEND_REPLY" | "CANCEL_DRAFT" | "IGNORE_CURRENT" | "IGNORE_ALL" | "SUPPORT" | "THANKS" | "SET_LANGUAGE" | "DRAFT_REPLY" | "HELP" | "UNKNOWN",
  "confidence": number,
  "extractedMeaning": "1 sentence explanation of user intent in English",
  "extractedLanguage": "ENGLISH" | "TAMIL" | "HINDI" (only if intent is SET_LANGUAGE, otherwise null),
  "extractedIndex": number (1 to 5, only if intent is SELECT_EMAIL or READ_FULL_EMAIL, otherwise null)
}`;

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an ultra-fast intent classifier. Output strictly raw JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        return this.fallbackRegex(userInput, sessionState);
      }

      const data = (await response.json()) as any;
      const rawText = data?.choices?.[0]?.message?.content || '{}';
      const clean = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          intent: parsed.intent || 'UNKNOWN',
          confidence: parsed.confidence || 0.95,
          extractedMeaning: parsed.extractedMeaning || userInput,
          extractedLanguage: parsed.extractedLanguage,
          extractedIndex: parsed.extractedIndex ? parseInt(parsed.extractedIndex) : undefined,
        };
      }

      return this.fallbackRegex(userInput, sessionState);
    } catch (err) {
      return this.fallbackRegex(userInput, sessionState);
    }
  }

  private static fallbackRegex(userInput: string, sessionState: string): UserIntentResult {
    const text = userInput.toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (/ignore\s*all|skip\s*all|stop\s*all|ellam\s*vendam|cancel\s*all|bas\s*karo/i.test(text)) {
      return { intent: 'IGNORE_ALL', confidence: 0.95, extractedMeaning: 'User wants to ignore all emails' };
    }
    if (/^(ignore|skip|next|adutha\s*mail|thavir|aage\s*badho)$/i.test(text)) {
      return { intent: 'IGNORE_CURRENT', confidence: 0.95, extractedMeaning: 'User wants to skip current email' };
    }
    const readFullMatch =
      text.match(/^(?:read|show|view|open)?\s*(?:mail|email)?\s*([1-5])\s*(?:full|complete|fully|muzhuvadhum)$/i) ||
      text.match(/^(?:full|complete|read|show)\s*(?:mail|email)?\s*([1-5])$/i);
    if (readFullMatch) {
      return {
        intent: 'READ_FULL_EMAIL',
        confidence: 0.95,
        extractedMeaning: `User wants to read full email #${readFullMatch[1]}`,
        extractedIndex: parseInt(readFullMatch[1]),
      };
    }

    const selectMatch = text.match(/^(?:reply|select|choose|mail|email)?\s*([1-5])$/i);
    if (selectMatch) {
      return {
        intent: 'SELECT_EMAIL',
        confidence: 0.95,
        extractedMeaning: `User selected email #${selectMatch[1]}`,
        extractedIndex: parseInt(selectMatch[1]),
      };
    }
    if (/check.*(mail|email|inbox)|(mail|email|inbox).*(check|paaru|paru|pannu|dekho|karo)|status|sync|refresh/i.test(text)) {
      return { intent: 'CHECK_MAIL', confidence: 0.9, extractedMeaning: 'User wants to check emails' };
    }
    if (/^(send|yes|send\s*it|ok|okay|anupu|send\s*pannu|bhejo|theek\s*hai|sari)$/i.test(text) && sessionState === 'PREVIEW_GENERATED') {
      return { intent: 'SEND_REPLY', confidence: 0.9, extractedMeaning: 'User confirmed sending draft' };
    }
    if (/^(reset|cancel|clear|vendam)$/i.test(text)) {
      return { intent: 'CANCEL_DRAFT', confidence: 0.9, extractedMeaning: 'User cancelled draft' };
    }
    if (/(language|lang).*tamil|tamil.*(language|lang|mathu)/i.test(text)) {
      return { intent: 'SET_LANGUAGE', confidence: 0.95, extractedMeaning: 'Set language to Tamil', extractedLanguage: 'TAMIL' };
    }
    if (/(language|lang).*hindi|hindi.*(language|lang|karo)/i.test(text)) {
      return { intent: 'SET_LANGUAGE', confidence: 0.95, extractedMeaning: 'Set language to Hindi', extractedLanguage: 'HINDI' };
    }
    if (/(language|lang).*english|english.*(language|lang)/i.test(text)) {
      return { intent: 'SET_LANGUAGE', confidence: 0.95, extractedMeaning: 'Set language to English', extractedLanguage: 'ENGLISH' };
    }
    if (/^(support|contact\s*support|helpdesk|customer\s*care|website)[\s!.]*$/i.test(text)) {
      return { intent: 'SUPPORT', confidence: 1.0, extractedMeaning: 'User is asking for support' };
    }

    if (/^(thanks|thank\s*you|thank\s*u|thx|tq|nandri|nanri|dhanyawad|dhanyavad|shukriya)[\s!.]*$/i.test(text)) {
      return { intent: 'THANKS', confidence: 1.0, extractedMeaning: 'User is expressing gratitude' };
    }

    if (/^(hi|hello|hey|vanakkam|vannakam|namaste|namasthe|வணக்கம்|नमस्ते)$/i.test(text)) {
      return { intent: 'HELP', confidence: 1.0, extractedMeaning: 'User greeting' };
    }

    return { intent: 'DRAFT_REPLY', confidence: 0.8, extractedMeaning: userInput };
  }
}
