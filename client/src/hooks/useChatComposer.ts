import { useEffect, useRef, useState } from 'react';
import { chatSessionFingerprint, type ChatSessionKind } from '@/lib/chatSession';

type Operation = { key: string; session: string; scope: number; revision: number };
/** Own the draft and single-flight UI independently of unrelated panel operations. */
export function useChatComposer(key: string, sendLive: (action: () => Promise<any>) => Promise<void>, transport: (key: string, text: string) => Promise<any>, kind: ChatSessionKind = 'main') {
  const [message, updateMessage] = useState('');
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const draft = useRef('');
  const operation = useRef<Operation | null>(null);
  const mounted = useRef(true);
  const session = chatSessionFingerprint(kind);
  const current = useRef({ key, session, scope: 0 });
  if (current.current.key !== key || current.current.session !== session) {
    current.current = { key, session, scope: current.current.scope + 1 };
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current.scope += 1; }; }, []);
  function setMessage(value: string) {
    revision.current += 1;
    draft.current = value;
    updateMessage(value);
  }
  function ownsScope(owner: Operation) {
    return mounted.current && current.current.scope === owner.scope && current.current.key === owner.key
      && current.current.session === owner.session && chatSessionFingerprint(kind) === owner.session;
  }
  async function send() {
    // A rejected duplicate never enters a finally block belonging to another send.
    if (operation.current || !key || !draft.current.trim()) return;
    const owner = { ...current.current, revision: revision.current };
    const text = draft.current;
    operation.current = owner;
    setPending(true);
    try {
      await sendLive(() => transport(owner.key, text));
      if (ownsScope(owner) && revision.current === owner.revision) setMessage('');
    } catch (error) {
      if (ownsScope(owner)) throw error;
    } finally {
      if (operation.current === owner) {
        operation.current = null;
        if (mounted.current) setPending(false);
      }
    }
  }
  return { message, setMessage, pending, send };
}
