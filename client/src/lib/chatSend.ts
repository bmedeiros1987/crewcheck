import { chatSessionFingerprint, type ChatSessionKind } from './chatSession';

type Pending = { hash: string; requestId: string };
const scopes = new Map<ChatSessionKind, { fingerprint: string; pending: Map<string, Pending> }>();

/** Keep only a digest and operation ID after failure; never persist message text. */
export async function sendChatOperation<T>(kind: ChatSessionKind, conversation: string, message: string, send: (requestId: string) => Promise<T>): Promise<T> {
  const fingerprint = chatSessionFingerprint(kind);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  if (chatSessionFingerprint(kind) !== fingerprint) throw new Error('Sessão alterada. Reabra a conversa.');
  const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  let scope = scopes.get(kind);
  if (!scope || scope.fingerprint !== fingerprint) {
    scope = { fingerprint, pending: new Map() }; scopes.set(kind, scope);
  }
  let pending = scope.pending.get(conversation);
  if (!pending || pending.hash !== hash) {
    pending = { hash, requestId: crypto.randomUUID() };
    scope.pending.set(conversation, pending);
    if (scope.pending.size > 50) scope.pending.delete(scope.pending.keys().next().value!);
  }
  const result = await send(pending.requestId);
  if (scope.pending.get(conversation) === pending) scope.pending.delete(conversation);
  return result;
}
