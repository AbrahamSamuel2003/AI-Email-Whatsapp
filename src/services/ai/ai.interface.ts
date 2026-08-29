import { AIImportanceResult, AIReplyContext, AIReplyResult, EmailMetadata } from '../../core/types.js';

export interface IAIProvider {
  classifyImportance(email: EmailMetadata): Promise<AIImportanceResult>;
  generateReply(context: AIReplyContext): Promise<AIReplyResult>;
}
