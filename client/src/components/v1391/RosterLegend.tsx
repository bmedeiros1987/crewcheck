import { useEffect, useRef, useState } from 'react';
import { BedDouble, BriefcaseBusiness, CalendarDays, GraduationCap, Layers3, Luggage, Moon, Phone, Plane, Sun } from 'lucide-react';
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
  return <section className="cc-roster-filter" aria-label="Legenda e filtro da escala">
    <div className="cc-roster-filter-heading"><strong>Legenda e filtro</strong><span>{periodLabel}</span></div>
    <div className="cc-roster-filter-options" role="group" aria-label="Filtrar cartões por categoria">
      <button type="button" data-roster-filter="all" aria-pressed={selected === 'all'} onClick={() => onSelect('all')}><Layers3 aria-hidden="true"/><span>Tudo</span><b>({total})</b></button>
      {rosterModes.map(mode => <button key={mode} type="button" className="cc-roster-token" data-roster-mode={mode} data-roster-filter={mode} title={rosterModeMeta[mode].label} aria-pressed={selected === mode} onClick={() => onSelect(mode)}><RosterActivityIcon mode={mode}/><span>{rosterModeMeta[mode].shortLabel}</span><b>({counts[mode]})</b></button>)}
    </div>
    <p>Ocorrências no período, antes do filtro. Programação reúne os demais tipos. O filtro altera somente os cartões, não os totais financeiros nem a fonte original.</p>
    <p className="cc-roster-filter-result" role="status">{selected === 'all' ? `Todas as ${total} ocorrências do período.` : `${rosterModeMeta[selected].shortLabel}: ${counts[selected]} de ${total} ocorrências no período.`}</p>
  </section>;
}
