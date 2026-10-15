import { useEffect, useRef, useState } from 'react';
import { alertAccount } from '../../lib/alertReviewStore';
import { alertRosterOwned } from '../../lib/alertRosterOwnership';
import { clearPendingNavigationContext, consumePendingNavigationContext, peekPendingNavigationContext, setPendingNavigationContext, type CrewCheckNavigationContext } from '../../lib/navigationContext';
import type { CrewRoster } from '../../lib/pdfParser';
import { alertRosterVersion } from './AlertDateEvidence';

/** Context is memory-only, single-use and tied to account plus selected roster. */
export function AlertRosterNavigation({ roster, onFocus }: { roster: CrewRoster; onFocus(date: string): void }) {
  const [context, setContext] = useState<CrewCheckNavigationContext | null>(null);
  const current = useRef({ roster, onFocus }); current.current = { roster, onFocus };
  const valid = (value: CrewCheckNavigationContext | null) => Boolean(value?.alertOwner && value.alertOwner === alertAccount()
    && alertRosterOwned(current.current.roster) && value.alertRosterVersion === alertRosterVersion(current.current.roster));
  useEffect(() => {
    const focus = () => {
      if (peekPendingNavigationContext('roster')?.sourceView !== 'alerts') return;
      const next = consumePendingNavigationContext('roster');
      if (next?.sourceView !== 'alerts') return;
      if (!valid(next) || !Number.isFinite(next.dateEpochMs)) { setContext(null); return; }
      const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(next.dateEpochMs);
      if (!current.current.roster.days.some(day => day.date === date)) { setContext(null); return; }
      setContext(next); current.current.onFocus(date);
    };
    const clear = () => { clearPendingNavigationContext(); setContext(null); };
    focus(); window.addEventListener('crewcheck:set-view', focus);
    for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.addEventListener(event, clear);
    return () => { window.removeEventListener('crewcheck:set-view', focus); for (const event of ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired']) window.removeEventListener(event, clear); };
  }, []);
  if (!context || !valid(context)) return null;
  function back() {
    if (!valid(context)) return;
    setPendingNavigationContext({ targetView: 'alerts', policy: 'once', alertOccurrence: context!.alertOccurrence, alertVersion: context!.alertVersion, alertOwner: context!.alertOwner, alertRosterVersion: context!.alertRosterVersion });
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'alerts' }));
  }
  return <section className="cc-readable-surface" aria-label="Data aberta pelo alerta"><button type="button" onClick={back}>Voltar ao alerta</button><button type="button" onClick={() => { clearPendingNavigationContext(); setContext(null); }}>Fechar contexto do alerta</button><p>Data aberta para conferir a contagem; a escala publicada permanece inalterada.</p></section>;
}
