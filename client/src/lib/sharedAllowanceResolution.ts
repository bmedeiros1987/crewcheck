import { financialIntervalEvidenceIssue, financialPublishedFlightIntervalIssue } from './financialIntervalEvidence';
import { financialJourneyGroupKey } from './financialJourneyGrouping';
import { rosterOperationalIso } from './compensationPolicy';
import { roundCurrencyAmount } from './financialAmounts';
import { financialActAt, type FinancialActSnapshot } from './financialActApplicability';
import { resolveLatamAllowanceReference, validAllowanceDay, type AllowanceCategory, type AllowanceCurrency, type AllowanceSlot, type LatamAllowanceReference } from './latamAllowanceCatalog';

export type OwnedAllowanceValue = { value: number; source: 'learned' | 'personal_reference' | 'manual'; description: string; version: string };
/** Why a slot waits on the owner's ACT declaration (absent on any other pending cause). */
export type FinancialActPendingCause = 'act_missing' | 'act_revoked' | 'act_expired' | 'act_invalid' | 'act_unavailable';
export type ResolvedAllowanceSlot = {
  kind: 'forecast' | 'reference' | 'pending'; value: number | null; currency: AllowanceCurrency | null;
  source: string; version: string; reason: string; reference: LatamAllowanceReference | null;
  actCause?: FinancialActPendingCause;
};
/** Caller supplies already validated, category-specific account values. No rate
 * adoption or currency-only foreign-rate promotion takes place here. */
export function resolveSharedAllowanceSlot(args: {
  category: AllowanceCategory; slot: AllowanceSlot; date: string; context: FinancialActSnapshot;
  owned: OwnedAllowanceValue | null; archiveIssue?: string | null;
}): ResolvedAllowanceSlot {
  const pending = (reason: string, reference: LatamAllowanceReference | null = null): ResolvedAllowanceSlot => ({
    kind: 'pending', value: null, currency: reference?.currency || null, source: 'pending', version: '', reason, reference,
  });
  const inspection = resolveLatamAllowanceReference({ role: null, category: args.category, slot: args.slot, date: args.date });
  if (!inspection.category || !inspection.slot || !validAllowanceDay(args.date)) return pending('Data ou categoria da diária inválida.');
  // An unreadable existing domestic archive is not evidence for a new default.
  if (args.category === 'domestic' && args.archiveIssue) return pending(args.archiveIssue);
  if (args.owned) {
    if (!Number.isFinite(args.owned.value) || args.owned.value < 0) return pending('Valor informado nesta conta inválido; revisão necessária.');
    return { kind: 'forecast', value: roundCurrencyAmount(args.owned.value), currency: inspection.currency,
      source: args.owned.source, version: args.owned.version, reason: args.owned.description, reference: null };
  }
  const context = args.context;
  const selection = context.history && ['ready', 'missing'].includes(context.state) && context.ownerId === context.history.ownerId && context.isCurrent()
    ? financialActAt(context.history, args.date) : null;
  if (!selection || selection.state !== 'applicable') {
    const actCause: FinancialActPendingCause = context.state === 'invalid' ? 'act_invalid'
      : context.state === 'unavailable' ? 'act_unavailable'
      : selection?.state === 'revoked' ? 'act_revoked'
      : selection?.state === 'expired' ? 'act_expired'
      : 'act_missing';
    const reason = actCause === 'act_invalid' ? 'Declaração financeira de ACT inválida; dados preservados para revisão.'
      : actCause === 'act_unavailable' ? 'Declaração financeira de ACT indisponível neste dispositivo; dados preservados.'
      : actCause === 'act_revoked' ? 'Aplicação financeira do ACT revogada para esta data.'
      : actCause === 'act_expired' ? 'Declaração financeira de ACT fora do período confirmado.'
      : 'Empresa e ACT não confirmados para esta data. Confirme a aplicação financeira uma vez para o período.';
    return { ...pending(reason), actCause };
  }
  const reference = resolveLatamAllowanceReference({ role: selection.event.role, category: args.category, slot: args.slot, date: args.date });
  if (reference.amountMinor === null || !reference.calculableReference) return pending(reference.reason, reference);
  return { kind: reference.state === 'resolved_enterprise_reference' ? 'forecast' : 'reference',
    value: reference.amountMinor / 100, currency: reference.currency, source: reference.sourceKind || 'pending',
    version: reference.version + ':' + selection.event.role, reason: reference.reason, reference };
}

/** Reference-only subtotal. Never substitute this for an enterprise forecast total. */
export function summarizeMinimumAllowanceRows(rows: readonly { value: number; currency: string }[]) {
  const cents: Record<string, number> = {}, invalid = new Set<string>();
  for (const row of rows) {
    const value = Math.round(row.value * 100);
    if (!['BRL', 'USD', 'EUR', 'GBP'].includes(row.currency) || !Number.isSafeInteger(value) || value < 0) { invalid.add(row.currency); continue; }
    const next = (cents[row.currency] || 0) + value;
    if (!Number.isSafeInteger(next)) invalid.add(row.currency); else cents[row.currency] = next;
  }
  return Object.fromEntries(Object.entries(cents).filter(([currency]) => !invalid.has(currency)).map(([currency, value]) => [currency, value / 100]));
}

/** Endpoint admission is occurrence-specific. A recognized domestic endpoint
 * cannot erase an unknown opposite endpoint. Existing base-presence evidence
 * establishes breakfast's location independently of a later/earlier route. */
export function resolveAllowanceOccurrenceGeography<T extends { rateKey: string | null; airport: string; reason: string }>(args: {
  origin: string; destination: string; base: string; breakfastAtProvenBase: boolean;
  overrides: Record<string, string>;
  classify: (origin: string, destination: string, overrides: any) => T;
}): T {
  const points = args.breakfastAtProvenBase ? [args.base, args.base] : [args.origin, args.destination];
  for (const point of points) {
    const local = args.classify(point, point, args.overrides);
    if (!local.rateKey) return { ...local, reason: 'Classificação geográfica desta ocorrência pendente; um aeroporto conhecido não comprova o outro.' };
    const normalized = String(point || '').trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(args.overrides, normalized)) {
      const published = args.classify(point, point, {});
      // A free-form category override is not geographical evidence that an
      // unknown country is "other", or that GB/UK is specifically England.
      if (!published.rateKey || published.rateKey !== local.rateKey) return { ...local, rateKey: null,
        reason: 'Classificação manual diverge da geografia conhecida ou não tem escopo comprovado; revise a ocorrência antes de aplicar esta referência.' };
    }
  }
  return args.classify(points[0], points[1], args.overrides);
}

/** Forecast-only rule reported for LATAM cabin. Geography is unchanged; an
 * owner-confirmed cabin scope and published trip evidence are separate gates.
 * No hotel text, civil midnight or inferred journey-rest proves an overnight. */
export function resolveLatamCabinAllowanceJourney<T extends { rateKey: string | null; airport: string; reason: string }>(args: {
  geography: T; event: any; events: readonly any[]; base: string; airline: string; date: string;
  context: FinancialActSnapshot; classify: (origin: string, destination: string, overrides: any) => T;
}): T {
  const { geography, context } = args;
  if (!['flight','stay'].includes(args.event.kind) || !geography.rateKey || geography.rateKey === 'domestic' || !['LA','TAM','LATAM'].includes(String(args.airline || '').trim().toUpperCase())) return geography;
  const pending = (reason: string): T => ({ ...geography, rateKey: null, reason: 'Elegibilidade internacional pendente: ' + reason });
  const selection = ['ready','missing'].includes(context.state) && context.history && context.ownerId === context.history.ownerId && context.isCurrent()
    ? financialActAt(context.history, args.date) : null;
  if (selection?.state !== 'applicable') return pending('contexto financeiro LATAM não confirmado para esta conta/data.');
  if (selection.event.role !== 'cabin') return geography; // No extrapolation to pilots/other regimes.
  const base = String(args.base || '').trim().toUpperCase();
  if (args.classify(base, base, {}).rateKey !== 'domestic') return pending('base nacional não comprovada.');
  const start = (event: any) => Date.parse(event.canonical?.startDateTime || '');
  const end = (event: any) => Date.parse(event.canonical?.endDateTime || '');
  const unique = new Map<string, any>();
  for (const event of args.events.filter(event => event.kind === 'flight')) {
    if (!event.id || !Number.isFinite(start(event)) || !Number.isFinite(end(event)) || end(event) <= start(event)) return pending('identidade ou intervalo publicado incompleto.');
    const previous = unique.get(event.id);
    if (previous && JSON.stringify(previous.canonical) !== JSON.stringify(event.canonical)) return pending('versões conflitantes da ocorrência.');
    unique.set(event.id, event);
  }
  const flights = [...unique.values()].sort((a,b) => start(a)-start(b));
  const targetStart = start(args.event), targetEnd = end(args.event);
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd)) return pending('intervalo da ocorrência ausente.');
  const firstIndex = flights.findLastIndex(event => event.origin === base && start(event) <= targetStart);
  const lastIndex = flights.findIndex((event,index) => index >= firstIndex && event.destination === base && end(event) >= targetEnd);
  if (firstIndex < 0 || lastIndex < firstIndex) return pending('saída e retorno à base não comprovados na mesma fonte.');
  const trip = flights.slice(firstIndex,lastIndex+1);
  if (flights.some(event => !trip.includes(event) && start(event) >= start(trip[0]) && start(event) <= end(trip.at(-1)))) return pending('trechos concorrentes no intervalo da viagem.');
  if (args.event.kind === 'flight' && !trip.some(event => event.id === args.event.id)) return pending('ocorrência fora da viagem identificada.');
  if (financialPublishedFlightIntervalIssue(trip)) return pending('horários publicados dos trechos incompletos.');
  for (const key of new Set(trip.map(financialJourneyGroupKey))) {
    if (key === 'event:missing-id' || financialIntervalEvidenceIssue(trip.filter(event => financialJourneyGroupKey(event) === key))) return pending('jornada sem apresentação publicada completa.');
  }
  for (let index=0;index<trip.length;index++) {
    const event=trip[index], published=(event.day || event.canonical?.publishedDay || {}).publishedClockEvidence || event.day || event.canonical?.publishedDay || {};
    if (new Set((published.records || [published]).map((record:any) => JSON.stringify(record.legs))).size > 1) return pending('publicações conflitantes dos trechos.');
    if (!args.classify(event.origin,event.origin,{}).rateKey || !args.classify(event.destination,event.destination,{}).rateKey) return pending('aeroporto intermediário não classificado.');
    if (index && (trip[index-1].destination !== event.origin || end(trip[index-1]) > start(event))) return pending('continuidade da rota ou dos horários não comprovada.');
  }
  const lastDay=trip.at(-1).day || trip.at(-1).canonical?.publishedDay || {};
  const lastPublished=lastDay.publishedClockEvidence || lastDay;
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(lastPublished.dutyDebrief || '')) || lastPublished.dutyDebriefSource !== 'published') return pending('encerramento publicado da viagem ausente.');
  const tripDates=new Set(trip.map(event => event.canonical?.date || event.day?.date));
  const stays=args.events.filter(event => event.kind === 'stay' && (
    Number.isFinite(start(event)) && Number.isFinite(end(event))
      ? start(event) <= end(trip.at(-1)) && end(event) >= start(trip[0])
      : tripDates.has(event.canonical?.date || event.day?.date)
  ));
  const provedStays=stays.filter(stay => {
    const day=stay.day || stay.canonical?.publishedDay || {}, published=day.publishedClockEvidence || day;
    if (day.continuityInferred || !/^(PERNOITE|LAYOVER|ESTADIA)$/.test(String(day.type || '').toUpperCase())
      || published.dutyReportSource !== 'published' || published.dutyDebriefSource !== 'published'
      || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(published.dutyReport || '')) || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(published.dutyDebrief || ''))
      || (published.records || [published]).length !== 1 || !Number.isFinite(start(stay)) || end(stay) <= start(stay)) return false;
    return trip.some((incoming,index) => {
      const outgoing=trip[index+1];
      return outgoing && incoming.destination === stay.origin && stay.origin === stay.destination && stay.destination === outgoing.origin
        && args.classify(stay.origin,stay.origin,{}).rateKey === geography.rateKey
        && end(incoming) <= start(stay) && end(stay) <= start(outgoing);
    });
  });
  if (stays.length !== provedStays.length) return pending('pernoite sem fonte, extremos ou vínculo geográfico suficientes.');
  const overnight=provedStays.length > 0;
  const source='Regra de previsão informada para LATAM/comissários; não homologada como norma geral. ';
  if (overnight) return { ...geography, reason: source + 'Pernoite internacional publicado, delimitado por trechos de saída e retorno à base. ' + geography.reason };
  const oneJourney=new Set(trip.map(financialJourneyGroupKey)).size === 1;
  const sameDay=rosterOperationalIso(new Date(start(trip[0]))) === rosterOperationalIso(new Date(end(trip.at(-1))));
  if (args.event.kind === 'flight' && oneJourney && sameDay && !stays.length) {
    const domestic=args.classify(base,base,{});
    return { ...domestic, reason: source + 'Bate-volta na mesma jornada/data BRT, com retorno à base e sem pernoite comprovado; categoria nacional para esta previsão.' };
  }
  return pending('pernoite internacional não comprovado; mudança de dia, hotel ou intervalo inferido não bastam.');
}
