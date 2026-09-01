import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata, NewEmailComposeContext, NewEmailComposeResult } from '../../core/types.js';

export interface IAIProvider {
  classifyImportance(email: EmailMetadata, preferredLanguage?: string): Promise<AIImportanceResult>;
  generateReply(context: AIReplyContext): Promise<AIReplyResult>;
  generateNewEmailDraft(context: NewEmailComposeContext): Promise<NewEmailComposeResult>;
}
