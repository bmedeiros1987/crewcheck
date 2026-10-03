import { chatSessionFingerprint } from '@/lib/chatSession';
import { useEffect, useRef, useState } from 'react';
import { authFetch, getToken } from '@/lib/authClient';
import { reconcileChatInbox, type ChatInboxState, type ChatInboxItem } from '@/lib/chatInboxState';
import { publishCrewCheckNotice } from '@/components/pulse/pulseRuntime';
import { setPendingNavigationContext } from '@/lib/navigationContext';

type Props = { visitor?: boolean; onOpen?: () => void };
/** Local polling + existing notification runtime. No remote push or permission requests. */
export default function ChatInbox({ visitor = false, onOpen }: Props) {
  const [unread, setUnread] = useState<ChatInboxItem[]>([]);
  const open = useRef(onOpen); open.current = onOpen;
  useEffect(() => {
    let disposed = false, running = false, blocked = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    let recipient = '';
    let memory: ChatInboxState | null = null;
    const credential = visitor ? '' : getToken();
    const sessionFingerprint = chatSessionFingerprint(visitor ? 'visitor' : 'main');
    const validSession = () => !disposed && sessionFingerprint === chatSessionFingerprint(visitor ? 'visitor' : 'main') && (visitor || Boolean(credential && getToken() === credential));
    const storageKey = () => `crewcheck:chat-inbox:v1:${recipient}`;
    const read = (): ChatInboxState | null => {
      try { const value = JSON.parse(localStorage.getItem(storageKey()) || 'null'); return value?.initialized && Array.isArray(value.seen) && Array.isArray(value.unread) ? value : memory; } catch { return memory; }
    };
    const save = (state: ChatInboxState) => {
      memory = state;
      let persisted = false;
      try { localStorage.setItem(storageKey(), JSON.stringify(state)); persisted = true; } catch {}
      if (validSession()) setUnread(state.unread);
      return persisted;
    };
    const locked = async (action: () => void) => {
      // Without a cross-tab lock, still update the inbox but suppress OS notices.
      if (navigator.locks) await navigator.locks.request(storageKey(), () => { if (validSession() && !blocked) action(); });
      else if (validSession() && !blocked) action();
    };
    const poll = async () => {
      clearTimeout(timer);
      if (!validSession()) { setUnread([]); return; }
      if (running || blocked) return;
      if (!navigator.onLine) { timer = setTimeout(poll, 30_000); return; }
      running = true;
      request = new AbortController();
      const timeout = setTimeout(() => request?.abort(), 15_000);
      try {
        const endpoint = visitor ? '/api/platform/visitor/chat/inbox' : '/api/platform/chat/inbox';
        const payload = visitor
          ? await fetch(endpoint, { credentials: 'include', cache: 'no-store', signal: request.signal }).then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data?.ok) throw Object.assign(new Error('Inbox indisponível'), { status: response.status });
            return data;
          })
          : await authFetch<any>(endpoint, { cache: 'no-store', signal: request.signal });
        if (!validSession() || !/^[a-f0-9]{64}$/.test(payload.recipient) || !Array.isArray(payload.items)) return;
        if (recipient !== payload.recipient) memory = null;
        recipient = payload.recipient;
        await locked(() => {
          const { fresh, state } = reconcileChatInbox(read(), payload.items, payload.snapshotVersion);
          const persisted = save(state);
          if (fresh.length) {
            const key = `chat:${recipient}:${fresh[0].id}`;
            publishCrewCheckNotice({ id: key, dedupeKey: key, tone: 'informativo', category: 'general',
              title: 'Nova mensagem no CrewCheck', detail: 'Abra Mensagens para consultar sua conversa privada.',
              dismissible: true, notificationTag: key, systemNotification: navigator.locks && persisted ? 'background' : 'never' });
          }
        });
      } catch (error: any) {
        if (validSession() && [401, 402, 403, 404].includes(error?.status)) { blocked = true; setUnread([]); }
      } finally {
        clearTimeout(timeout); running = false;
        if (validSession() && !blocked) timer = setTimeout(poll, document.hidden ? 30_000 : 15_000);
      }
    };
    const readMessages = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!recipient || !detail?.threadId || !Array.isArray(detail.ids)) return;
      void locked(() => {
        const state = read(); if (!state) return;
        const ids = new Set(detail.ids);
        save({ ...state, seen: [...new Set([...detail.ids, ...state.seen])].slice(0, 500), unread: state.unread.filter((item) => item.threadId !== detail.threadId || !ids.has(item.id)) });
      });
    };
    const resume = () => { if (!document.hidden) void poll(); };
    const sync = () => { if (blocked || !validSession()) { setUnread([]); request?.abort(); return; } if (recipient) setUnread(read()?.unread || []); };
    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('storage', sync);
    window.addEventListener('crewcheck:auth-expired', sync);
    window.addEventListener('crewcheck:visitor-session-change', sync);
    window.addEventListener('crewcheck:chat-read', readMessages);
    document.addEventListener('visibilitychange', resume);
    void poll();
    return () => {
      disposed = true; clearTimeout(timer); request?.abort();
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('storage', sync);
      window.removeEventListener('crewcheck:auth-expired', sync);
      window.removeEventListener('crewcheck:visitor-session-change', sync);
      window.removeEventListener('crewcheck:chat-read', readMessages);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [visitor]);
  if (!unread.length) return null;
  const show = () => {
    if (visitor) { open.current?.(); return; }
    const item = unread[0];
    setPendingNavigationContext({ targetView: 'community', programId: item.kind === 'visitor' ? 'share-visitor' : 'share-colleague', policy: 'once' });
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'community' }));
    window.dispatchEvent(new Event('crewcheck:menu-setting-focus'));
  };
  return <aside aria-label="Mensagens do CrewCheck" style={{ padding: '8px 12px', background: 'var(--background, #122033)', color: 'var(--foreground, #fff)' }}>
    <button type="button" onClick={show} style={{ minHeight: 44 }}>Mensagens · {unread.length}</button>
    <small> Recentes neste dispositivo · últimos 7 dias</small>
  </aside>;
}
