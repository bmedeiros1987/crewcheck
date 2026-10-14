import { getStoredUser, getToken } from './authClient';

export type ChatSessionKind = 'main' | 'visitor';
export function chatSessionFingerprint(kind: ChatSessionKind): string {
  if (kind === 'visitor') {
    const marker = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('crewcheck_visitor_session=')) || '';
    return `${marker}|${localStorage.getItem('crewcheck:visitor-session-epoch') || ''}`;
  }
  const user = getStoredUser();
  return JSON.stringify([getToken(), user?.id || '', user?.email || '']);
}

// Invalidate other visitor tabs before login/logout changes the shared HttpOnly cookie.
export function invalidateVisitorChatSession() {
  localStorage.setItem('crewcheck:visitor-session-epoch', crypto.randomUUID());
  window.dispatchEvent(new Event('crewcheck:visitor-session-change'));
}
