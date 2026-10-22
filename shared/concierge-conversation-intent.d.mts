export type ConversationIntent = 'nextDuty.read' | 'schedule.read';
export type ConversationRequest = { kind: 'read'; intent: ConversationIntent } | { kind: 'clarify'; reply: string } | { kind: 'continuation' } | { kind: 'unsupported' };
export function classifyConversation(text: unknown): ConversationRequest;
export function conversationIntent(text: unknown): ConversationIntent | null;
export function containsConversationInstruction(value: unknown): boolean;
