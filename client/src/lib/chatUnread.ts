import { useSyncExternalStore } from 'react';
import { chatSessionFingerprint, type ChatSessionKind } from './chatSession';
import type { ChatInboxItem } from './chatInboxState';

// Derived view of ChatInbox's authorized recipient state; no second persisted store.
const empty: ChatInboxItem[] = [];
const snapshots = new Map<ChatSessionKind, { session: string; items: ChatInboxItem[] }>();
const listeners = new Set<() => void>();
export function publishChatUnread(kind: ChatSessionKind, session: string, items: ChatInboxItem[]) {
  if (session !== chatSessionFingerprint(kind)) return;
  snapshots.set(kind, { session, items });
  listeners.forEach((notify) => notify());
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  const events = ['storage', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:visitor-session-change'];
  events.forEach((event) => window.addEventListener(event, notify));
  return () => { listeners.delete(notify); events.forEach((event) => window.removeEventListener(event, notify)); };
}
export function useChatUnread(kind: ChatSessionKind = 'main') {
  return useSyncExternalStore(subscribe, () => {
    const snapshot = snapshots.get(kind);
    return snapshot?.session === chatSessionFingerprint(kind) ? snapshot.items : empty;
  }, () => empty);
}
