import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BedDouble, BriefcaseBusiness, CalendarDays, ChevronDown, GraduationCap, Layers3, Luggage, Moon, Phone, Plane, Sun } from 'lucide-react';
import { captureAuthSession } from '@/lib/authClient';
import { currentPublicationReview, subscribePublicationReview } from '@/lib/rosterPublicationRuntime';
import { rosterModeMeta, rosterModes, rosterOccurrenceCounts, rosterSourceSignature, type RosterFilter, type RosterMode, type RosterPresentationEvent } from '@/lib/rosterPresentation';
import './roster-legend.css';

const modeIcons = { operating: Plane, extra: Luggage, stay: BedDouble, rest: Sun, 'journey-rest': Moon, reserve: BriefcaseBusiness, standby: Phone, training: GraduationCap, duty: CalendarDays };
export function RosterActivityIcon({ mode }: { mode: RosterMode }) { const Icon = modeIcons[mode]; return <Icon aria-hidden="true"/>; }
function session() { try { return captureAuthSession(); } catch { return null; } }
function publicationRevision() { try { return currentPublicationReview()?.publication.revision || ''; } catch { return ''; } }
type Scope = { signature: string; revision: string; session: ReturnType<typeof session> };

/** Transient view selection, never an account preference or an operational input. */
export function useRosterCategoryFilter(events: readonly RosterPresentationEvent[]) {
  const signature = rosterSourceSignature(events), revision = publicationRevision();
  const scope = useRef<Scope | null>(null);
  const mounted = useRef(true);
  const [, refresh] = useState(0);
  const [selection, setSelection] = useState<{ scope: Scope; filter: RosterFilter } | null>(null);
  if (!scope.current || scope.current.signature !== signature || scope.current.revision !== revision || (scope.current.session && !scope.current.session.isCurrent())) {
    scope.current = { signature, revision, session: session() };
  }
  const current = scope.current;
  const filter = selection?.scope === current ? selection.filter : 'all';
  useEffect(() => {
    mounted.current = true;
    // Invalidate before requesting render: a queued old click cannot restore it.
    const invalidate = () => { scope.current = null; setSelection(null); refresh(value => value + 1); };
    const names = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:roster-cleared', 'crewcheck:roster-choice-start'];
    names.forEach(name => window.addEventListener(name, invalidate));
    const storage = (event: StorageEvent) => { if (event.key === null || event.key === 'crewcheck_auth_token' || event.key === 'crewcheck_auth_user' || event.key?.startsWith('crewcheck_roster_choice_v1_')) invalidate(); };
    window.addEventListener('storage', storage);
    const stop = subscribePublicationReview(() => {
      if (scope.current?.revision !== publicationRevision() || (scope.current?.session && !scope.current.session.isCurrent())) invalidate();
    });
    return () => { names.forEach(name => window.removeEventListener(name, invalidate)); window.removeEventListener('storage', storage); stop(); mounted.current = false; };
  }, []);
  function choose(filter: RosterFilter) {
    if (!mounted.current || scope.current !== current || (current.session && !current.session.isCurrent())) return;
    setSelection({ scope: current, filter });
  }
  return { filter, choose, reset: () => choose('all'), signature };
}

export function RosterLegend({ events, selected, onSelect, periodLabel }: {
  events: readonly RosterPresentationEvent[]; selected: RosterFilter; onSelect: (filter: RosterFilter) => void; periodLabel: string;
}) {
  const { counts, total } = rosterOccurrenceCounts(events);
  // The legend sits below the cards: filtering changes their height, so the tapped control is
  // brought back into view once the filtered cards are laid out (and again on the next frame,
  // after late layout), instead of leaving the user somewhere else on the page.
  const tapped = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const target = tapped.current;
    tapped.current = null;
    if (!target) return;
    // Vertical only for the page; the chip strip may scroll itself, the document never sideways.
    const run = () => { if (target.isConnected) target.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); };
    run();
    const frame = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(run) : 0;
    return () => { if (frame) window.cancelAnimationFrame?.(frame); };
  }, [selected]);
  const pick = (filter: RosterFilter, target: HTMLElement) => { if (filter !== selected) tapped.current = target; onSelect(filter); };
  const status = selected === 'all' ? `Todas as ${total} ocorrências do período.` : `${rosterModeMeta[selected].shortLabel}: ${counts[selected]} de ${total} ocorrências no período.`;
  // Collapsed by default at the top of the roster; the summary always shows the active filter.
  return <section className="cc-roster-filter" aria-label="Legenda das programações">
    <details>
      <summary><Layers3 aria-hidden="true"/><span>Legenda</span><small>{selected === 'all' ? `Tudo (${total})` : `${rosterModeMeta[selected].shortLabel} · ${counts[selected]} de ${total}`}</small><ChevronDown className="cc-roster-disclosure" aria-hidden="true"/></summary>
      <div className="cc-roster-filter-options" role="group" aria-label={`Filtrar cartões por categoria · ${periodLabel}`}>
        <button type="button" data-roster-filter="all" aria-pressed={selected === 'all'} onClick={event => pick('all', event.currentTarget)}><Layers3 aria-hidden="true"/><span>Tudo</span><b>({total})</b></button>
        {rosterModes.map(mode => <button key={mode} type="button" className="cc-roster-token" data-roster-mode={mode} data-roster-filter={mode} title={rosterModeMeta[mode].label} aria-pressed={selected === mode} onClick={event => pick(mode, event.currentTarget)}><RosterActivityIcon mode={mode}/><span>{rosterModeMeta[mode].shortLabel}</span><b>({counts[mode]})</b></button>)}
      </div>
    </details>
    <p className="cc-roster-filter-result cc-roster-sr" role="status">{status}</p>
  </section>;
}
