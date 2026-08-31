import { IAIProvider } from './ai.interface.js';
import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NotificationType } from '../../core/types.js';
import { buildImportanceClassificationPrompt, buildReplyGenerationPrompt } from './prompts.js';
import { GeminiAIAdapter } from './gemini.adapter.js';
import { MockAIAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';

export class GroqAIAdapter implements IAIProvider {
  private apiKey: string;
  private modelName: string;
  private geminiFallback: GeminiAIAdapter | null = null;
  private mockFallback: MockAIAdapter;

  constructor(apiKey?: string, modelName?: string) {
    this.apiKey = apiKey || config.GROQ_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is required to initialize GroqAIAdapter');
    }
    this.modelName = modelName || config.GROQ_MODEL_NAME || 'openai/gpt-oss-20b';
    this.mockFallback = new MockAIAdapter();

    if (config.GEMINI_API_KEY) {
      try {
        this.geminiFallback = new GeminiAIAdapter();
      } catch {}
    }
  }

  private extractJson(rawText: string): any {
    let cleaned = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {}

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }

    throw new Error('Failed to parse JSON response from Groq');
  }

  async classifyImportance(email: EmailMetadata, preferredLanguage: string = 'ENGLISH'): Promise<AIImportanceResult> {
    try {
      const prompt = buildImportanceClassificationPrompt(email, preferredLanguage);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an AI Email Importance and Security Classifier. You must output ONLY a valid JSON object matching the requested schema. Do not output any markdown code blocks.',
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
        const errorText = await response.text();
        throw new Error(`Groq API status ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const rawText = data?.choices?.[0]?.message?.content || '{}';
      const parsed = this.extractJson(rawText);

      const isImportant = Boolean(parsed.isImportant);
      let notifType: NotificationType = parsed.notificationType || (isImportant ? 'ACTIONABLE' : 'NONE');
      if (!isImportant) {
        notifType = 'NONE';
      }

      return {
        isImportant,
        notificationType: notifType,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
        urgency: parsed.urgency || (isImportant ? 'MEDIUM' : 'LOW'),
        reasoning: parsed.reason || parsed.reasoning || 'Evaluated via Groq LPU AI Engine',
        summary: parsed.summary || email.subject,
        actionRequired: parsed.actionRequired || null,
        extractedCode: parsed.extractedCode || null,
      };
    } catch (err: any) {
      if (this.geminiFallback) {
        try {
          console.log(`[Groq Failover] ${err.message}. Seamlessly switching to Gemini AI...`);
          return await this.geminiFallback.classifyImportance(email, preferredLanguage);
        } catch (geminiErr: any) {
          console.warn(`[Gemini Failover Error] ${geminiErr.message}. Falling back to resilient local parser.`);
        }
      }
      console.warn(`[AI Engine] ${err.message}. Using resilient local fallback parser.`);
      return this.mockFallback.classifyImportance(email, preferredLanguage);
    }
  }

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    try {
      const prompt = buildReplyGenerationPrompt(context);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: 'system',
              content: 'You are an executive assistant drafting professional email replies. You must output ONLY a valid JSON object matching the requested schema. Do not output any markdown code blocks.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API status ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const rawText = data?.choices?.[0]?.message?.content || '{}';
      const parsed = this.extractJson(rawText);

      return {
        subject: parsed.subject || `Re: ${context.subject}`,
        replyBody: parsed.replyBody || `Hi,\n\n${context.clientInstruction}\n\nRegards,\n${context.clientName}`,
        closing: parsed.closing || `Regards,\n${context.clientName}`,
      };
    } catch (err: any) {
      if (this.geminiFallback) {
        try {
          console.log(`[Groq Failover] ${err.message}. Seamlessly switching to Gemini AI...`);
          return await this.geminiFallback.generateReply(context);
        } catch (geminiErr: any) {
          console.warn(`[Gemini Failover Error] ${geminiErr.message}. Falling back to resilient local generator.`);
        }
      }
      console.warn(`[AI Engine] ${err.message}. Using resilient local reply generator.`);
      return this.mockFallback.generateReply(context);
    }
  }
}
