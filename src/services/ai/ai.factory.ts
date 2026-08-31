import { IAIProvider } from './ai.interface.js';
import { GeminiAIAdapter } from './gemini.adapter.js';
import { GroqAIAdapter } from './groq.adapter.js';
import { MockAIAdapter } from './mock.adapter.js';
import { config } from '../../config/env.js';

export class AIFactory {
  private static instance: IAIProvider;

  static getProvider(): IAIProvider {
    if (!this.instance) {
      if (config.AI_PROVIDER === 'groq' && config.GROQ_API_KEY) {
        this.instance = new GroqAIAdapter();
      } else if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
        this.instance = new GeminiAIAdapter();
      } else {
        this.instance = new MockAIAdapter();
      }
    }
    return this.instance;
  }

  static setProvider(provider: IAIProvider): void {
    this.instance = provider;
  }
}
