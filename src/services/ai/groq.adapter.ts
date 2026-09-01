import { IAIProvider } from './ai.interface.js';
import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NotificationType } from '../../core/types.js';
import { buildImportanceClassificationPrompt, buildReplyGenerationPrompt } from './prompts.js';
import { GeminiAIAdapter } from './gemini.adapter.js';
import { MockAIAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';
import { removeEmojis } from '../../core/text-sanitizer.js';

export const GROQ_FREE_MODELS = [
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b',
  'qwen-2.5-32b',
];

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
    this.modelName = modelName || config.GROQ_MODEL_NAME || 'llama-3.3-70b-versatile';
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

  private async callGroqCascade<T>(
    buildPayload: () => { systemMessage: string; userMessage: string; temperature: number; max_tokens?: number },
    onSuccess: (rawText: string, modelUsed: string) => T
  ): Promise<T> {
    const modelsToTry = Array.from(new Set([this.modelName, ...GROQ_FREE_MODELS]));
    let lastError: Error | null = null;

    for (const model of modelsToTry) {
      try {
        const payload = buildPayload();
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: payload.systemMessage },
              { role: 'user', content: payload.userMessage },
            ],
            temperature: payload.temperature,
            max_tokens: payload.max_tokens,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status === 429 || response.status === 503 || response.status === 404) {
            console.warn(`[Groq Model Cascade] Model "${model}" hit status ${response.status}. Trying next Groq model...`);
            lastError = new Error(`Groq status ${response.status} on ${model}: ${errorText}`);
            continue;
          }
          throw new Error(`Groq API status ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as any;
        const rawText = data?.choices?.[0]?.message?.content || '{}';
        return onSuccess(rawText, model);
      } catch (err: any) {
        lastError = err;
        console.warn(`[Groq Model Failover] Error on model "${model}": ${err.message}. Trying next model...`);
      }
    }

    throw lastError || new Error('All Groq cascade models exhausted');
  }

  async classifyImportance(email: EmailMetadata, preferredLanguage: string = 'ENGLISH'): Promise<AIImportanceResult> {
    try {
      const prompt = buildImportanceClassificationPrompt(email, preferredLanguage);

      return await this.callGroqCascade(
        () => ({
          systemMessage: 'You are an AI Email Importance and Security Classifier. You must output ONLY a valid JSON object matching the requested schema. Do not output any markdown code blocks.',
          userMessage: prompt,
          temperature: 0.1,
        }),
        (rawText) => {
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
        }
      );
    } catch (err: any) {
      if (this.geminiFallback) {
        try {
          console.log(`[Groq Cascade Exhausted] ${err.message}. Seamlessly switching to Gemini AI...`);
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

      return await this.callGroqCascade(
        () => ({
          systemMessage: 'You are an executive assistant drafting professional email replies. You must output ONLY a valid JSON object matching the requested schema. Do not output any markdown code blocks.',
          userMessage: prompt,
          temperature: 0.2,
        }),
        (rawText) => {
          const parsed = this.extractJson(rawText);
          return {
            subject: removeEmojis(parsed.subject || `Re: ${context.subject}`),
            replyBody: removeEmojis(parsed.replyBody || `Hi,\n\n${context.clientInstruction}\n\nRegards,\n${context.clientName}`),
            closing: removeEmojis(parsed.closing || `Regards,\n${context.clientName}`),
          };
        }
      );
    } catch (err: any) {
      if (this.geminiFallback) {
        try {
          console.log(`[Groq Cascade Exhausted] ${err.message}. Seamlessly switching to Gemini AI...`);
          return await this.geminiFallback.generateReply(context);
        } catch (geminiErr: any) {
          console.warn(`[Gemini Failover Error] ${geminiErr.message}. Falling back to resilient local generator.`);
        }
      }
      console.warn(`[AI Engine] ${err.message}. Using resilient local reply generator.`);
      return this.mockFallback.generateReply(context);
    }
  }

  async generateNewEmailDraft(context: import('../../core/types.js').NewEmailComposeContext): Promise<import('../../core/types.js').NewEmailComposeResult> {
    try {
      const { buildNewEmailComposePrompt } = await import('./prompts.js');
      const prompt = buildNewEmailComposePrompt(context);

      return await this.callGroqCascade(
        () => ({
          systemMessage: 'You are an executive AI assistant that composes polished, natural, concise corporate emails. Always output raw JSON only with keys "subject" and "body". Never use emojis.',
          userMessage: prompt,
          temperature: 0.2,
          max_tokens: 1000,
        }),
        (rawText) => {
          const parsed = this.extractJson(rawText);
          return {
            subject: removeEmojis(parsed.subject || 'Business Discussion & Update'),
            body: removeEmojis(parsed.body || `Dear Sir/Madam,\n\n${context.clientInstruction}\n\nBest regards,\n${context.clientName}`),
          };
        }
      );
    } catch (err: any) {
      if (this.geminiFallback) {
        try {
          console.log(`[Groq Cascade Exhausted] ${err.message}. Seamlessly switching to Gemini AI for compose...`);
          return await this.geminiFallback.generateNewEmailDraft(context);
        } catch (geminiErr: any) {
          console.warn(`[Gemini Failover Error] ${geminiErr.message}. Falling back to resilient local generator.`);
        }
      }
      console.warn(`[AI Engine] ${err.message}. Using resilient local compose generator.`);
      return this.mockFallback.generateNewEmailDraft(context);
    }
  }
}
