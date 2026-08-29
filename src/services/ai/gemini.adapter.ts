import { GoogleGenerativeAI } from '@google/generative-ai';
import { IAIProvider } from './ai.interface.js';
import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NotificationType } from '../../core/types.js';
import { buildImportanceClassificationPrompt, buildReplyGenerationPrompt } from './prompts.js';
import { MockAIAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';

export class GeminiAIAdapter implements IAIProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private fallbackAdapter: MockAIAdapter;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || config.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required to initialize GeminiAIAdapter');
    }
    this.genAI = new GoogleGenerativeAI(key);
    this.modelName = modelName || config.AI_MODEL_NAME || 'gemini-3.6-flash';
    this.fallbackAdapter = new MockAIAdapter();
  }

  private sanitizeJsonResponse(rawText: string): string {
    return rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  async classifyImportance(email: EmailMetadata): Promise<AIImportanceResult> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const prompt = buildImportanceClassificationPrompt(email);
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      const cleanJson = this.sanitizeJsonResponse(rawText);

      const parsed = JSON.parse(cleanJson) as any;
      const isImportant = Boolean(parsed.isImportant);
      let notifType: NotificationType = parsed.notificationType || (isImportant ? 'ACTIONABLE' : 'NONE');
      if (!isImportant) {
        notifType = 'NONE';
      }

      return {
        isImportant,
        notificationType: notifType,
        extractedCode: parsed.extractedCode || undefined,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
        urgency: parsed.urgency || (isImportant ? 'MEDIUM' : 'LOW'),
        summary: parsed.summary || email.subject,
        actionRequired: parsed.actionRequired || undefined,
        reasoning: parsed.reason || parsed.reasoning || 'Evaluated via Gemini AI model',
      };
    } catch (err: any) {
      console.log('[AI Engine] Using resilient local fallback parser.');
      return this.fallbackAdapter.classifyImportance(email);
    }
  }

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const prompt = buildReplyGenerationPrompt(context);
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      const cleanJson = this.sanitizeJsonResponse(rawText);

      const parsed = JSON.parse(cleanJson) as any;
      return {
        subject: parsed.subject || `Re: ${context.subject}`,
        replyBody: parsed.replyBody,
        closing: parsed.closing || `Regards,\n${context.clientName}`,
      };
    } catch (err: any) {
      console.log('[AI Engine] Using resilient local reply generator.');
      return this.fallbackAdapter.generateReply(context);
    }
  }
}
