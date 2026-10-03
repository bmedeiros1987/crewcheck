/** Local publication review only. Never represents company acceptance. */
export type PublishedEvent = {
  kind: string; date: string; flightNumber?: string; origin?: string; destination?: string;
  presentation?: string; departure?: string; arrival?: string; startDateTime?: string;
  endDateTime?: string; isNextDay?: boolean; leg?: { workType?: string };
  publishedDay?: { type?: string; pairingCode?: string; hotel?: string | null; continuityInferred?: boolean };
};
type Item = Record<string, string>;
export type Publication = { items: Item[]; completeDates: string[]; revision: string };
export type Change = { id: number; version: number; kind: 'changed' | 'added' | 'removed'; before?: Item; after?: Item; seen: boolean };
export type UnconfirmedDifference = { kind: 'newly-observed' | 'not-observed' | 'ambiguous'; item: Item };
export type ReviewState = { schema: 1; owner: string; version: number; publication: Publication; baseline: Publication; history: Change[]; unknown: boolean; unconfirmed?: UnconfirmedDifference[] };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const clean = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const encode = (value: unknown) => JSON.stringify(value);
// Comparison-only representation; never writes back to the roster or recalculates times.
function civil(value: unknown) {
  const raw = clean(value), br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : raw;
}
function clock(value: unknown) {
  const raw = clean(value), match = /^(\d{1,2}):(\d{2})(\(\+\d+\))?$/.exec(raw);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2,'0')}:${match[2]}${match[3] || ''}` : raw;
}
function instant(value: unknown) {
  const raw = clean(value);
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return raw;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : raw;
}
export function reviewKey(owner: string) { return `crewcheck:publication-review:v1:${encodeURIComponent(owner)}`; }

/** IDs and array order are intentionally excluded; only existing canonical fields are read. */
export function publication(events: PublishedEvent[], completeDates: string[] = []): Publication {
  const items = events.filter(e => e.kind !== 'journey-rest' && !e.publishedDay?.continuityInferred).map(e => ({
    kind: clean(e.kind), date: civil(e.date), code: clean(e.flightNumber),
    origin: clean(e.origin), destination: clean(e.destination), presentation: clock(e.presentation),
    departure: clock(e.departure), arrival: clock(e.arrival), start: instant(e.startDateTime), end: instant(e.endDateTime),
    nextDay: String(e.isNextDay ?? ''), workType: clean(e.leg?.workType),
    dayType: clean(e.publishedDay?.type), pairing: clean(e.publishedDay?.pairingCode), hotel: clean(e.publishedDay?.hotel),
  })).sort((a, b) => encode(a).localeCompare(encode(b)));
  // Completeness must come from trusted source metadata, never inferred from events/month.
  const coverage = [...new Set(completeDates.map(civil))].sort();
  return { items, completeDates: coverage, revision: encode(items) };
}
function anchor(item: Item) {
  return encode([item.kind, item.code || item.pairing]);
}
export function observePublication(owner: string, previous: ReviewState | null, next: Publication): ReviewState {
  if (!owner.trim()) throw new Error('Publication review requires an account');
  if (!previous || previous.owner !== owner) return { schema: 1, owner, version: 1, publication: next, baseline: next, history: [], unknown: true };
  if (previous.publication.revision === next.revision && encode(previous.publication.completeDates) === encode(next.completeDates)) return previous;
  const baseline = previous.baseline;
  const before = baseline.items.slice(), after = next.items.slice();
  // Match unchanged occurrences first, retaining multiplicity without depending on IDs/order.
  for (let i = before.length - 1; i >= 0; i--) {
    const j = after.findIndex(item => encode(item) === encode(before[i]));
    if (j >= 0) { before.splice(i, 1); after.splice(j, 1); }
  }
  const history = previous.history.slice(), version = previous.version + 1;
  let unknown = next.completeDates.length === 0;
  // Observations only: absence in a partial source is never a confirmed removal.
  const unconfirmed: UnconfirmedDifference[] = [];
  function add(kind: Change['kind'], a?: Item, b?: Item) {
    history.push({ id: (history.at(-1)?.id ?? 0) + 1, version, kind, before: a, after: b, seen: false });
  }
  for (let i = before.length - 1; i >= 0; i--) {
    const key = anchor(before[i]);
    // A unique existing flight/pairing supports correlation, including date-only changes.
    if (!(before[i].code || before[i].pairing) || before.filter(item => anchor(item) === key).length !== 1) continue;
    const candidates = after.map((item, index) => ({ item, index })).filter(({ item }) => anchor(item) === key);
    if (candidates.length !== 1) continue;
    add('changed', before[i], candidates[0].item);
    before.splice(i, 1); after.splice(candidates[0].index, 1);
  }
  const ambiguous = new Set([...before, ...after].filter(item => (item.code || item.pairing) && before.some(a => anchor(a) === anchor(item)) && after.some(a => anchor(a) === anchor(item))).map(anchor));
  for (const item of before) {
    if (ambiguous.has(anchor(item))) { unknown = true; unconfirmed.push({ kind: 'ambiguous', item }); continue; }
    if (baseline.completeDates.includes(item.date) && next.completeDates.includes(item.date)) add('removed', item);
    else { unknown = true; unconfirmed.push({ kind: 'not-observed', item }); }
  }
  for (const item of after) {
    if (ambiguous.has(anchor(item))) { unknown = true; unconfirmed.push({ kind: 'ambiguous', item }); continue; }
    if (baseline.completeDates.includes(item.date) && next.completeDates.includes(item.date)) add('added', undefined, item);
    else { unknown = true; unconfirmed.push({ kind: 'newly-observed', item }); }
  }
  // A partial observation cannot erase last known occurrences needed by a later complete publication.
  const retained = before.filter(item => !next.completeDates.includes(item.date) || ambiguous.has(anchor(item)));
  const baselineItems = [...next.items.filter(item => !ambiguous.has(anchor(item))), ...retained].sort((a, b) => encode(a).localeCompare(encode(b)));
  const updatedBaseline = { items: baselineItems, completeDates: [...new Set([...baseline.completeDates, ...next.completeDates])].sort(), revision: encode(baselineItems) };
  return { schema: 1, owner, version, publication: next, baseline: updatedBaseline, history, unknown, unconfirmed };
}
/** Call only after that exact before/after detail is actually consulted. */
export function consultedChange(state: ReviewState, owner: string, id: number, version: number): ReviewState {
  if (state.owner !== owner) return state;
  return { ...state, history: state.history.map(change => change.id === id && change.version === version ? { ...change, seen: true } : change) };
}
export function writeReview(storage: Storage, state: ReviewState): boolean {
  try { storage.setItem(reviewKey(state.owner), encode(state)); return true; } catch { return false; }
}
export function readReview(storage: Storage, owner: string): ReviewState | null {
  try {
    const state = JSON.parse(storage.getItem(reviewKey(owner)) || 'null');
    const validItem = (item: unknown) => Boolean(item && typeof item === 'object' && !Array.isArray(item) && ['kind','date','code','origin','destination','presentation','departure','arrival','start','end','nextDay','workType','dayType','pairing','hotel'].every(key => typeof (item as Item)[key] === 'string'));
    const validPublication = (value: Publication) => Boolean(value && Array.isArray(value.items) && value.items.every(validItem) && Array.isArray(value.completeDates) && value.completeDates.every(date => typeof date === 'string') && value.revision === encode(value.items));
    if (!state || state.schema !== 1 || state.owner !== owner || !owner.trim() || !Number.isSafeInteger(state.version) || state.version < 1 || typeof state.unknown !== 'boolean' || !Array.isArray(state.history) || !validPublication(state.publication) || !validPublication(state.baseline)) return null;
    if (state.unconfirmed !== undefined && (!Array.isArray(state.unconfirmed) || !state.unconfirmed.every((entry: UnconfirmedDifference) => entry && ['newly-observed','not-observed','ambiguous'].includes(entry.kind) && validItem(entry.item)))) return null;
    let lastId = 0;
    if (!state.history.every((change: Change) => {
      if (!Number.isSafeInteger(change.id) || change.id <= lastId || !Number.isSafeInteger(change.version) || change.version < 2 || change.version > state.version || typeof change.seen !== 'boolean') return false;
      lastId = change.id;
      return change.kind === 'changed' ? validItem(change.before) && validItem(change.after) : change.kind === 'added' ? change.before === undefined && validItem(change.after) : change.kind === 'removed' && validItem(change.before) && change.after === undefined;
    })) return null;
    return state;
  } catch { return null; }
}
