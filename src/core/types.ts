export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EmailMetadata {
  externalMessageId: string;
  externalThreadId: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string;
  senderName?: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  cleanBody: string;
  rawSnippet?: string;
  receivedAt: Date;
}

export type NotificationType = 'ACTIONABLE' | 'ALERT_ONLY' | 'NONE';

export interface AIImportanceResult {
  isImportant: boolean;
  notificationType: NotificationType;
  extractedCode?: string;
  confidence: number;
  urgency: UrgencyLevel;
  summary: string;
  actionRequired?: string;
  reasoning: string;
}

export interface AIReplyContext {
  senderName?: string;
  senderEmail: string;
  subject: string;
  originalEmailBody: string;
  previousThreadSummary?: string;
  clientInstruction: string;
  clientName: string;
}

export interface AIReplyResult {
  subject: string;
  replyBody: string;
  closing: string;
}

export interface NewEmailComposeContext {
  recipientEmail: string;
  clientInstruction: string;
  clientName: string;
  senderEmail: string;
}

export interface NewEmailComposeResult {
  subject: string;
  body: string;
}

export type WhatsAppSessionState =
  | 'IDLE'
  | 'NOTIFIED'
  | 'PREVIEW_GENERATED'
  | 'CONFIRMED_SENT'
  | 'AWAITING_RECIPIENT'
  | 'AWAITING_COMPOSE_MESSAGE'
  | 'COMPOSE_MANUAL_EDIT';

export interface WhatsAppInboundMessage {
  from: string; // E.164 phone number
  messageId: string;
  text: string;
  timestamp: number;
  isVoiceNote?: boolean;
}

export interface OutboundReplyPayload {
  toEmail: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
  references?: string;
}

export interface OutboundNewEmailPayload {
  toEmail: string;
  subject: string;
  body: string;
  fromEmail?: string;
}

export type UserMode = 'STANDARD' | 'ADVANCED';

