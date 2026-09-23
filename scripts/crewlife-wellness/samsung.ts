import { getStoredUser, isAuthenticated } from '@/lib/authClient';
import type { MetricKey } from './wellness';
type Port = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
export type SamsungReply = { ok: boolean; available?: boolean; keys?: MetricKey[]; background?: boolean; metrics?: unknown; syncedAt?: number };
const pending = new Map<string, { resolve: (reply: SamsungReply) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
function port(): Port | undefined { return (window as unknown as { CrewCheckSamsung?: Port }).CrewCheckSamsung; }
async function owner(): Promise<string> {
  const id = getStoredUser()?.id;
  if (!isAuthenticated() || !id) throw new Error('Entre na sua conta para conectar.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function hasSamsungBridge() { return Boolean(port()); }
export async function samsungRequest(action: 'status' | 'permissions' | 'read' | 'background', extra: Record<string, unknown> = {}): Promise<SamsungReply> {
  const bridge = port();
  if (!bridge) return { ok: true, available: false, keys: [] };
  const account = await owner();
  bridge.onmessage = event => {
    try {
      const result = JSON.parse(event.data);
      const request = pending.get(result.requestId);
      if (!request) return;
      clearTimeout(request.timeout); pending.delete(result.requestId); request.resolve(result);
    } catch { /* Malformed native messages cannot populate health data. */ }
  };
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error('A consulta expirou.')); }, 45000);
    pending.set(requestId, { resolve, reject, timeout });
    try { bridge.postMessage(JSON.stringify({ ...extra, version: 1, requestId, owner: account, action })); }
    catch { clearTimeout(timeout); pending.delete(requestId); reject(new Error('Conexão indisponível.')); }
  });
}
export function disconnectSamsung() {
  for (const request of pending.values()) { clearTimeout(request.timeout); request.reject(new Error('Conexão encerrada.')); }
  pending.clear();
  try { port()?.postMessage(JSON.stringify({ version: 1, requestId: crypto.randomUUID(), action: 'disconnect' })); } catch {}
  window.dispatchEvent(new Event('crewcheck:samsung-disconnected'));
}
