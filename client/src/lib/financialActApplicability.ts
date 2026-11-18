import { captureAuthSession } from './authClient';
import { financialRateOwner, financialRateSession } from './financialStatementLearning';
import { LATAM_ACT_FROM, LATAM_ACT_THROUGH, validAllowanceDay, type AllowanceRole } from './latamAllowanceCatalog';

export type FinancialActEvent = { revision: number; from: string; through: string; confirmed: true; source: 'owner_financial_confirmation' } & (
  { active: true; employer: 'TAM_LINHAS_AEREAS_SA'; role: AllowanceRole; coverage: 'clause_1_2_included' }
  | { active: false }
);
export interface FinancialActHistory { schema: 1; ownerId: string; revision: number; events: FinancialActEvent[] }
export type FinancialActState = 'ready' | 'missing' | 'invalid' | 'unavailable' | 'unauthenticated';
export type FinancialActSelection = { state: 'applicable'; event: FinancialActEvent & { active: true } }
  | { state: 'missing' | 'revoked' | 'expired' | 'invalid'; event: FinancialActEvent | null };
export type FinancialActChange = { from: string; through: string; active: boolean; employer?: string; role?: string; coverage?: string };
export interface FinancialActSnapshot {
  state: FinancialActState; ownerId: string | null; raw: string | null; history: FinancialActHistory | null;
  /** Ephemeral fences only. Never persist or render this session value. */
  session: string | null; isCurrent: () => boolean;
}
export const financialActStorageKey = (ownerId: string) => 'crewcheck_financial_act_applicability_v1:' + encodeURIComponent(ownerId);
const keys = (value: object) => Object.keys(value).sort().join(',');
const boundedDates = (from: unknown, through: unknown): boolean => validAllowanceDay(from) && validAllowanceDay(through)
  && from >= LATAM_ACT_FROM && through <= LATAM_ACT_THROUGH && from <= through;
function validEvent(event: FinancialActEvent, index: number): boolean {
  if (!event || typeof event !== 'object' || Array.isArray(event) || event.revision !== index + 1 || event.confirmed !== true
    || event.source !== 'owner_financial_confirmation' || !boundedDates(event.from, event.through)) return false;
  if (event.active === false) return keys(event) === 'active,confirmed,from,revision,source,through';
  return event.active === true && keys(event) === 'active,confirmed,coverage,employer,from,revision,role,source,through'
    && event.employer === 'TAM_LINHAS_AEREAS_SA' && ['cabin', 'pilot'].includes(event.role) && event.coverage === 'clause_1_2_included';
}
export function parseFinancialActHistory(raw: string, ownerId: string): FinancialActHistory | null {
  try {
    if (!ownerId || typeof raw !== 'string' || raw.length > 131072) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || keys(value) !== 'events,ownerId,revision,schema'
      || value.schema !== 1 || value.ownerId !== ownerId || !Number.isSafeInteger(value.revision) || value.revision < 0
      || !Array.isArray(value.events) || value.events.length > 256 || value.revision !== value.events.length
      || value.events.some((event: FinancialActEvent, index: number) => !validEvent(event, index))) return null;
    return value;
  } catch { return null; }
}
export function financialActAt(history: FinancialActHistory, date: string): FinancialActSelection {
  if (!validAllowanceDay(date) || !parseFinancialActHistory(JSON.stringify(history), history?.ownerId)) return { state: 'invalid', event: null };
  const event = history.events.filter(item => item.from <= date).sort((a, b) => b.from.localeCompare(a.from) || b.revision - a.revision)[0] || null;
  if (!event) return { state: 'missing', event: null };
  // Choose the winner before checking its end. Expiry/revocation never revives an older scope.
  if (!event.active) return { state: 'revoked', event };
  if (date > event.through) return { state: 'expired', event };
  return { state: 'applicable', event };
}
export function planFinancialActChange(history: FinancialActHistory, expectedRevision: number, change: FinancialActChange): FinancialActHistory | null {
  if (!parseFinancialActHistory(JSON.stringify(history), history?.ownerId) || history.revision !== expectedRevision || history.events.length >= 256
    || !change || typeof change.active !== 'boolean' || !boundedDates(change.from, change.through)
    || keys(change) !== (change.active ? 'active,coverage,employer,from,role,through' : 'active,from,through')) return null;
  const common = { revision: history.revision + 1, from: change.from, through: change.through, confirmed: true as const, source: 'owner_financial_confirmation' as const };
  let event: FinancialActEvent;
  if (change.active) {
    if (change.employer !== 'TAM_LINHAS_AEREAS_SA' || !['cabin', 'pilot'].includes(change.role || '') || change.coverage !== 'clause_1_2_included') return null;
    event = { ...common, active: true, employer: 'TAM_LINHAS_AEREAS_SA', role: change.role as AllowanceRole, coverage: 'clause_1_2_included' };
  } else event = { ...common, active: false };
  const previous = history.events.filter(item => item.from === change.from).at(-1);
  if (previous && JSON.stringify({ ...previous, revision: 0 }) === JSON.stringify({ ...event, revision: 0 })) return history;
  return { ...history, revision: event.revision, events: [...history.events, event] };
}
const shiftDay = (date: string, count: number) => { const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + count); return value.toISOString().slice(0, 10); };
export function financialActTimeline(history: FinancialActHistory) {
  if (!parseFinancialActHistory(JSON.stringify(history), history?.ownerId)) return [];
  const boundaries = [...new Set([LATAM_ACT_FROM, shiftDay(LATAM_ACT_THROUGH, 1), ...history.events.flatMap(event => [event.from, shiftDay(event.through, 1)])])].sort();
  return boundaries.slice(0, -1).map((from, index) => ({ from, through: shiftDay(boundaries[index + 1], -1), selection: financialActAt(history, from) }));
}
export function readFinancialActApplicability(): FinancialActSnapshot {
  const empty = (state: FinancialActState): FinancialActSnapshot => ({ state, ownerId: null, raw: null, history: null, session: null, isCurrent: () => false });
  try {
    const guard = captureAuthSession(), ownerId = financialRateOwner(), session = financialRateSession();
    if (!guard.token) return empty('unauthenticated');
    if (!ownerId || !session) return empty('unavailable');
    const isCurrent = () => guard.isCurrent() && ownerId === financialRateOwner() && session === financialRateSession();
    let raw: string | null;
    try { raw = localStorage.getItem(financialActStorageKey(ownerId)); }
    catch { return { state: 'unavailable', ownerId, session, raw: null, history: null, isCurrent }; }
    if (!isCurrent()) return empty('unavailable');
    if (raw === null) return { state: 'missing', ownerId, session, raw, history: { schema: 1, ownerId, revision: 0, events: [] }, isCurrent };
    const history = parseFinancialActHistory(raw, ownerId);
    return { state: history ? 'ready' : 'invalid', ownerId, session, raw, history, isCurrent };
  } catch { return empty('unavailable'); }
}
/** One explicit owner-local write, fenced by session, Web Lock and exact reviewed snapshot. */
export async function saveFinancialActApplicability(args: { snapshot: FinancialActSnapshot; change: FinancialActChange; reviewed: true }): Promise<boolean> {
  try {
    const { snapshot } = args;
    const change = { ...args.change };
    if (args.reviewed !== true || !snapshot.ownerId || !snapshot.history || !['ready', 'missing'].includes(snapshot.state)
      || !snapshot.session || !snapshot.isCurrent() || typeof navigator === 'undefined' || !navigator.locks?.request) return false;
    const key = financialActStorageKey(snapshot.ownerId);
    return await navigator.locks.request(key, () => {
      if (!snapshot.isCurrent()) return false;
      const current = readFinancialActApplicability();
      if (!current.history || !['ready', 'missing'].includes(current.state) || current.ownerId !== snapshot.ownerId
        || current.session !== snapshot.session || current.raw !== snapshot.raw || current.history.revision !== snapshot.history!.revision) return false;
      const next = planFinancialActChange(current.history, snapshot.history!.revision, change);
      if (!next || !snapshot.isCurrent() || !current.isCurrent()) return false;
      if (next === current.history) return true;
      const serialized = JSON.stringify(next);
      localStorage.setItem(key, serialized);
      if (!snapshot.isCurrent() || localStorage.getItem(key) !== serialized) return false;
      window.dispatchEvent(new Event('crewcheck:financial-config-changed'));
      return true;
    });
  } catch { return false; }
}
