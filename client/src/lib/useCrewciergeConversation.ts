import { useEffect, useRef, useState } from 'react';
import { captureAuthSession } from './authClient';
import { startupOwner, startupKey, startupIntentRevision } from './rosterStartup';
import { CREWCIERGE_CACHE_SCHEMA } from './crewCiergeCapture';
import { createLocalCrewcierge, type LocalCrewciergeContext } from './crewCiergeLocal';
import type { CrewRoster } from './pdfParser';

export function useCrewciergeConversation(roster: CrewRoster, onAnswer: (reply: string) => void, onBusy: (value: string) => void, onInvalidate?: () => void) {
  const live = useRef({ roster, onAnswer, onBusy, onInvalidate }); live.current = { roster, onAnswer, onBusy, onInvalidate };
  const generation = useRef(0), epoch = useRef(crypto.randomUUID()), mounted = useRef(true);
  const previous = useRef<LocalCrewciergeContext>();
  const [online, setOnline] = useState(navigator.onLine !== false);
  const invalidate = () => { generation.current++; epoch.current = crypto.randomUUID(); previous.current = undefined; live.current.onAnswer(''); live.current.onBusy(''); live.current.onInvalidate?.(); };
  const rosterJSON = JSON.stringify(roster);
  useEffect(() => { invalidate(); }, [rosterJSON]);
  useEffect(() => {
    mounted.current = true;
    const reset = () => { invalidate(); setOnline(navigator.onLine !== false); };
    const events = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:roster-updated', 'crewcheck:roster-cleared', 'crewcheck:roster-choice-start', 'crewcheck:roster-choice-finished', 'crewcheck:local-roster-captured', 'storage', 'online', 'offline'];
    events.forEach(name => window.addEventListener(name, reset));
    return () => { mounted.current = false; generation.current++; previous.current = undefined; events.forEach(name => window.removeEventListener(name, reset)); };
  }, []);
  return { online, lifecycleFence() {
    try {
      const session = captureAuthSession(), expectedEpoch = epoch.current, content = JSON.stringify(live.current.roster);
      return () => { try { return mounted.current && session.isCurrent() && epoch.current === expectedEpoch && JSON.stringify(live.current.roster) === content; } catch { return false; } };
    } catch { return () => false; }
  }, async ask(text: string, remote: (current: () => boolean) => Promise<string>) {
    if (!mounted.current) return;
    const sequence = ++generation.current, initialEpoch = epoch.current;
    let session: ReturnType<typeof captureAuthSession>, owner: string, key: string, selectedJSON: string, intentRevision: string;
    try { session = captureAuthSession(); owner = startupOwner(); key = startupKey(); selectedJSON = JSON.stringify(live.current.roster); intentRevision = startupIntentRevision(); }
    catch { previous.current = undefined; live.current.onAnswer('Dados locais indisponíveis. Faça uma nova consulta.'); live.current.onBusy(''); return; }
    const raw = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    const current = () => { try { return mounted.current && generation.current === sequence && epoch.current === initialEpoch && session.isCurrent()
      && owner === startupOwner() && startupIntentRevision() === intentRevision && JSON.stringify(live.current.roster) === selectedJSON; } catch { return false; } };
    const cacheCurrent = () => { try { return current() && localStorage.getItem(key) === raw; } catch { return false; } };
    live.current.onBusy('ask');
    try {
      let reply: string;
      if (navigator.onLine === false) {
        let saved: any; try { saved = JSON.parse(raw || 'null'); } catch { saved = null; }
        const capture = saved?.crewCiergeCapture;
        const reader = createLocalCrewcierge({
          identity: () => current() && session.token && owner && owner === session.owner ? { owner, sessionEpoch: initialEpoch } : null,
          readSnapshot: requested => requested === owner && saved?.owner === owner && saved.cacheSchema === CREWCIERGE_CACHE_SCHEMA && saved.selection === 'explicit'
            && !saved.cleared && String(saved.choiceIntent || '') === intentRevision && JSON.stringify(saved.roster) === selectedJSON && capture
            ? JSON.stringify({ version: 1, kind: 'locally-selected-roster', owner, revision: capture.revision, capturedAt: capture.capturedAt, roster: saved.roster }) : null,
          isCurrent: binding => cacheCurrent() && binding.contentHash === capture?.contentHash && binding.revision === capture?.revision,
        });
        const result = await reader(text, previous.current);
        if (!cacheCurrent()) { previous.current = undefined; if (current()) live.current.onAnswer('Seleção local mudou ou está indisponível. Faça uma nova consulta.'); return; }
        previous.current = 'context' in result ? result.context : undefined;
        reply = result.reply;
      } else {
        previous.current = undefined;
        reply = await remote(current);
      }
      if (current() && (navigator.onLine !== false || cacheCurrent())) live.current.onAnswer(reply);
    } catch (error) {
      if (current()) live.current.onAnswer(navigator.onLine === false ? 'Dados locais indisponíveis. Faça uma nova consulta.' : error instanceof Error ? error.message : 'O Concierge não respondeu agora.');
    } finally { if (current()) live.current.onBusy(''); }
  } };
}
