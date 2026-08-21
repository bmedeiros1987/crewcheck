import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';
import { completeContinuityDays } from './rosterContinuity';

// #525: 'journey-rest' representa o intervalo ENTRE jornadas que não satisfaz o
// contrato de pernoite. Não é tempo em solo (que é intra-jornada) e não é stay
// (que alimenta hotel/Central de Pernoite) — é uma terceira categoria própria.
export type CanonicalRosterEventKind = 'flight' | 'duty' | 'stay' | 'rest' | 'journey-rest';

export type CanonicalRosterEvent = {
  id: string;
  kind: CanonicalRosterEventKind;
  date: string;
  publishedDay: RosterDay;
  startDateTime: string;
  endDateTime: string;
  flightNumber: string;
  origin: string;
  destination: string;
  presentation: string;
  departure: string;
  arrival: string;
  isNextDay: boolean;
  sourceConfidence: 'alta' | 'media' | 'baixa';
  legIndex: number;
  legCount: number;
  showPresentation: boolean;
  groundBeforeMinutes: number | null;
  leg?: FlightLeg;
  /**
   * Identidade da jornada a que este evento pertence. Derivada, nunca
   * persistida: a mesma jornada mantém o mesmo valor ao atravessar 00:00 e
   * duas jornadas no mesmo dia civil recebem valores diferentes (#512).
   */
  journeyId: string;
  /** Por que esta etapa abriu uma jornada. `null` quando é continuação. */
  journeyBoundary: JourneyBoundaryReason | null;
  /**
   * #525: minutos de repouso entre duas jornadas. Presente apenas em eventos
   * `journey-rest`. Distinto de `groundBeforeMinutes`, que descreve espera
   * DENTRO de uma jornada.
   */
  restMinutes?: number;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4,
  MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8,
  SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12,
};

function pad2(value: number) { return String(value).padStart(2, '0'); }

function normalizeTime(value?: string | null): string | null {
  const match = String(value || '').match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function minutes(value?: string | null): number | null {
  const t = normalizeTime(value);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function parseRosterDate(value: string, fallbackMonth: number, fallbackYear: number) {
  const raw = String(value || '').trim();
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };

  m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) return { day: Number(m[1]), month: MONTHS[m[2].toUpperCase()] || fallbackMonth, year: Number(m[3]) };

  m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: fallbackYear };

  return { day: 1, month: fallbackMonth, year: fallbackYear };
}

function formatDate(day: number, month: number, year: number) {
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

function dateAt(day: RosterDay, time: string | null, fallbackHour: number) {
  const parsed = parseRosterDate(day.date, day.month || 1, day.year || new Date().getFullYear());
  const date = new Date(parsed.year, parsed.month - 1, parsed.day, fallbackHour, 0, 0, 0);
  const normalized = normalizeTime(time);
  if (normalized) {
    const [h, m] = normalized.split(':').map(Number);
    date.setHours(h, m, 0, 0);
  }
  return date;
}

function presentationIsUnsafe(presentation: string | null, departure: string | null) {
  const p = minutes(presentation);
  const d = minutes(departure);
  return p != null && d != null && p > d + 180;
}

function cloneDay(day: RosterDay): RosterDay {
  return { ...day, legs: [...(day.legs || [])] };
}

function legKey(day: RosterDay, leg: FlightLeg) {
  return [
    day.date,
    leg.flightNumber,
    leg.origin,
    leg.destination,
    normalizeTime(leg.departureTime) || '',
    normalizeTime(leg.arrivalTime) || '',
  ].join('|');
}

/**
 * Deslocamento de dia publicado no próprio horário ("15:35(+1)").
 * O parser do servidor preserva esse marcador; o do cliente já o consome ao
 * normalizar o horário. Por isso ele é lido quando existe e reconstruído por
 * progressão monótona quando não existe.
 */
function publishedDayOffset(value?: string | null): number | null {
  const match = String(value || '').match(/\(\+(\d+)\)/);
  return match ? Number(match[1]) || 0 : null;
}

/**
 * Minuto absoluto de cada etapa dentro do RosterDay, contando a virada de dia.
 * Um dia pode carregar mais de uma jornada e, com elas, mais de uma data civil;
 * ordenar só pelo relógio embaralha as etapas e faz uma cadeia contínua parecer
 * teletransporte — que era o que levava o filtro físico a apagar jornadas (#440).
 */
function absoluteLegMinutes(legs: FlightLeg[]): Map<FlightLeg, number> {
  const absolute = new Map<FlightLeg, number>();
  // Quando a fonte marca a virada de dia, a ausência do marcador significa dia
  // base — nunca "o mesmo dia da etapa anterior". Herdar o deslocamento
  // embaralharia a ordem, porque as etapas podem chegar fora de sequência.
  const hasPublishedOffsets = legs.some((leg) => publishedDayOffset(leg.departureTime) != null);

  let reconstructedOffset = 0;
  let previousClock: number | null = null;
  for (const leg of legs) {
    const clock = minutes(leg.departureTime) ?? 0;
    if (hasPublishedOffsets) {
      absolute.set(leg, (publishedDayOffset(leg.departureTime) ?? 0) * 1440 + clock);
      continue;
    }
    // Sem marcadores (o parser do cliente os consome ao normalizar), a ordem
    // publicada é a única evidência: o relógio andar para trás indica virada.
    if (previousClock != null && clock < previousClock) reconstructedOffset += 1;
    absolute.set(leg, reconstructedOffset * 1440 + clock);
    previousClock = clock;
  }
  return absolute;
}

/**
 * Reconstrói a ordem física quando o relógio sozinho não basta.
 *
 * Alguns parsers entregam as etapas de um pairing de vários dias ordenadas
 * apenas pelo relógio e sem o marcador de virada de dia. Nesse estado a
 * sequência publicada parece teletransporte, e o filtro físico respondia
 * apagando jornadas inteiras (#440). Aqui a cadeia é refeita seguindo
 * destino -> origem e escolhendo sempre a próxima decolagem mais cedo a partir
 * da chegada anterior, o que resolve as estações repetidas (ex.: dois trechos
 * saindo de GRU em dias diferentes).
 *
 * Retorna null quando não existe cadeia que cubra todas as etapas: sem prova
 * de continuidade, a ordem publicada é preservada como está.
 */
function reconstructPhysicalOrder(legs: FlightLeg[]): FlightLeg[] | null {
  if (legs.length < 2) return null;

  const follow = (startIndex: number): FlightLeg[] => {
    const used = new Array(legs.length).fill(false);
    const chain: FlightLeg[] = [legs[startIndex]];
    used[startIndex] = true;
    let station = airportCode(legs[startIndex].destination);
    let clock = minutes(legs[startIndex].arrivalTime) ?? 0;

    for (let step = 1; step < legs.length; step += 1) {
      let bestIndex = -1;
      let bestWait = Number.POSITIVE_INFINITY;
      for (let index = 0; index < legs.length; index += 1) {
        if (used[index] || airportCode(legs[index].origin) !== station) continue;
        const departure = minutes(legs[index].departureTime) ?? 0;
        // Espera até a próxima decolagem, aceitando a virada de dia.
        const wait = departure >= clock ? departure - clock : departure + 1440 - clock;
        if (wait < bestWait) { bestWait = wait; bestIndex = index; }
      }
      if (bestIndex < 0) break;
      used[bestIndex] = true;
      chain.push(legs[bestIndex]);
      station = airportCode(legs[bestIndex].destination);
      clock = minutes(legs[bestIndex].arrivalTime) ?? 0;
    }
    return chain;
  };

  // Uma sequência de ida e volta fecha em circuito, então mais de uma etapa
  // pode iniciar uma cadeia completa. A etapa inicial verdadeira é a que vem
  // depois do maior intervalo: o dia começa após o repouso mais longo, não no
  // meio de uma conexão curta.
  let best: FlightLeg[] = [];
  let bestLead = -1;
  for (let index = 0; index < legs.length; index += 1) {
    const chain = follow(index);
    if (chain.length < legs.length) {
      if (chain.length > best.length && best.length < legs.length) { best = chain; bestLead = -1; }
      continue;
    }
    const closing = minutes(chain[chain.length - 1].arrivalTime) ?? 0;
    const opening = minutes(chain[0].departureTime) ?? 0;
    const lead = opening >= closing ? opening - closing : opening + 1440 - closing;
    if (best.length < legs.length || lead > bestLead) { best = chain; bestLead = lead; }
  }
  return best.length === legs.length ? best : null;
}

/**
 * Uma ida e volta fecha em circuito, e um circuito não tem começo próprio: as
 * mesmas etapas podem ser lidas a partir de qualquer ponto. Quando o dia
 * publica a própria apresentação, ela diz qual etapa abre o dia — sem isso, o
 * meio de um pairing pode ser lido como início e o repouso vira "conexão".
 */
function rotateToPublishedStart(sequence: FlightLeg[], anchorTime?: string | null): FlightLeg[] {
  const anchor = normalizeTime(anchorTime);
  if (!anchor || sequence.length < 2) return sequence;
  if (airportCode(sequence[sequence.length - 1].destination) !== airportCode(sequence[0].origin)) return sequence;
  const at = sequence.findIndex((leg) => normalizeTime(leg.departureTime) === anchor);
  if (at <= 0) return sequence;
  return [...sequence.slice(at), ...sequence.slice(0, at)];
}

function sortLegs(legs: FlightLeg[], anchorTime?: string | null) {
  const published = [...legs];
  const isConnected = (sequence: FlightLeg[]) => sequence.length > 1
    && sequence.every((leg, index) => index === 0 || airportCode(sequence[index - 1].destination) === airportCode(leg.origin));
  if (isConnected(published)) return rotateToPublishedStart(published, anchorTime);

  const absolute = absoluteLegMinutes(published);
  const byClock = published
    .map((leg, index) => ({ leg, index }))
    .sort((a, b) => (absolute.get(a.leg) ?? 99999) - (absolute.get(b.leg) ?? 99999) || a.index - b.index)
    .map((item) => item.leg);
  if (isConnected(byClock)) return rotateToPublishedStart(byClock, anchorTime);

  const reconstructed = reconstructPhysicalOrder(published);
  return reconstructed ? rotateToPublishedStart(reconstructed, anchorTime) : byClock;
}

export function legCrossesNextDay(leg: FlightLeg): boolean {
  const departure = minutes(leg.departureTime);
  const arrival = minutes(leg.arrivalTime);
  return Boolean(leg.isNextDay || (departure != null && arrival != null && arrival < departure));
}

function airportCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function legSignature(leg: FlightLeg): string {
  return [
    String(leg.flightNumber || '').trim().toUpperCase(),
    airportCode(leg.origin),
    airportCode(leg.destination),
    normalizeTime(leg.departureTime) || '',
    normalizeTime(leg.arrivalTime) || '',
  ].join('|');
}

function similarPublishedLeg(a: FlightLeg, b: FlightLeg): boolean {
  const sameRoute = String(a.flightNumber || '').trim().toUpperCase() === String(b.flightNumber || '').trim().toUpperCase()
    && airportCode(a.origin) === airportCode(b.origin)
    && airportCode(a.destination) === airportCode(b.destination);
  if (!sameRoute) return false;
  const ad = minutes(a.departureTime);
  const bd = minutes(b.departureTime);
  const aa = minutes(a.arrivalTime);
  const ba = minutes(b.arrivalTime);
  if (ad == null || bd == null || aa == null || ba == null) return false;
  return Math.abs(ad - bd) <= 45 && Math.abs(aa - ba) <= 90;
}

function legCompletenessScore(leg: FlightLeg): number {
  const anyLeg = leg as any;
  return [
    leg.flightNumber,
    leg.origin,
    leg.destination,
    leg.departureTime,
    leg.arrivalTime,
    leg.workType,
    anyLeg.aircraft || anyLeg.aircraftType || anyLeg.equipment,
    anyLeg.registration || anyLeg.tailNumber || anyLeg.matricula,
  ].filter(Boolean).length;
}

function chooseBetterLeg(a: FlightLeg, b: FlightLeg): FlightLeg {
  const left = legCompletenessScore(a);
  const right = legCompletenessScore(b);
  if (right > left) return b;
  return a;
}

function dedupeSimilarLegs(legs: FlightLeg[]): FlightLeg[] {
  const output: FlightLeg[] = [];
  for (const leg of sortLegs(legs || [])) {
    const index = output.findIndex((existing) => similarPublishedLeg(existing, leg));
    if (index >= 0) {
      output[index] = chooseBetterLeg(output[index], leg);
      continue;
    }
    if (!output.some((existing) => legSignature(existing) === legSignature(leg))) output.push(leg);
  }
  return sortLegs(output);
}

function connectionGapMinutes(previous: FlightLeg, next: FlightLeg): number | null {
  if (airportCode(previous.destination) !== airportCode(next.origin)) return null;
  const arrival = minutes(previous.arrivalTime);
  const departure = minutes(next.departureTime);
  if (arrival == null || departure == null) return null;
  const gap = departure >= arrival ? departure - arrival : departure + 1440 - arrival;
  // Mesmo dia: aceita conexão apertada, mas não aceita "espera" enorme como mesma sequência.
  if (gap < -15 || gap > 720) return null;
  return gap;
}

function physicallyConnects(previous: FlightLeg, next: FlightLeg): boolean {
  return connectionGapMinutes(previous, next) != null;
}

function chainScore(chain: FlightLeg[]): number {
  if (!chain.length) return 0;
  const uniqueAirports = new Set(chain.flatMap((leg) => [airportCode(leg.origin), airportCode(leg.destination)]).filter(Boolean)).size;
  const continuity = Math.max(0, chain.length - 1);
  const completeness = chain.reduce((sum, leg) => sum + legCompletenessScore(leg), 0);
  return chain.length * 1000 + continuity * 100 + uniqueAirports * 10 + completeness;
}

/**
 * Um dia pode conter mais de uma jornada (ex.: jornada da madrugada + jornada
 * da noite). Nesse caso as etapas continuam encadeadas fisicamente, apenas com
 * um repouso no meio. Se a cadeia publicada já fecha destino -> origem do
 * começo ao fim, ela é íntegra por definição e nenhuma etapa pode ser
 * descartada: o corte por tempo de conexão descartava jornadas inteiras da
 * escala (#440).
 */
function formsContinuousChain(legs: FlightLeg[]): boolean {
  return legs.length > 1
    && legs.every((leg, index) => index === 0 || airportCode(legs[index - 1].destination) === airportCode(leg.origin));
}

export function selectPhysicalLegSequence(legs: FlightLeg[]): FlightLeg[] {
  const clean = dedupeSimilarLegs(legs || []);
  if (clean.length <= 2) return clean;

  // Continuidade física completa: preserva a escala publicada inteira. A seleção
  // por cadeia abaixo existe para contaminação do parser (etapas de outra escala
  // sobrepostas no mesmo dia), não para separar jornadas legítimas.
  if (formsContinuousChain(clean)) return clean;

  const chains: FlightLeg[][] = [];
  for (let i = 0; i < clean.length; i += 1) {
    let bestEndingHere: FlightLeg[] = [clean[i]];
    for (let j = 0; j < i; j += 1) {
      const previousChain = chains[j] || [clean[j]];
      const previousLeg = previousChain[previousChain.length - 1];
      if (!physicallyConnects(previousLeg, clean[i])) continue;
      const candidate = [...previousChain, clean[i]];
      if (chainScore(candidate) > chainScore(bestEndingHere)) bestEndingHere = candidate;
    }
    chains[i] = bestEndingHere;
  }

  const best = chains.sort((a, b) => chainScore(b) - chainScore(a))[0] || clean;
  // Só filtra quando há uma sequência física real. Se o dia não formar sequência,
  // preserva os dados para não apagar programação rara/múltipla sem evidência.
  if (best.length >= 2 && best.length < clean.length) return sortLegs(best);
  return clean;
}

/**
 * Intervalo a partir do qual dois voos encadeados deixam de ser conexão e
 * passam a ser jornadas separadas por repouso. Alinhado ao corte já usado pelo
 * parser AIMS (`splitAimsDayIntoPhysicalDutyGroups`) para manter um contrato só.
 */
const MIN_REST_BETWEEN_JOURNEYS_MINUTES = 12 * 60;

export type JourneyBoundaryReason =
  | 'primeira-etapa'
  | 'apresentacao-publicada-da-etapa'
  | 'apresentacao-publicada-do-dia'
  | 'descontinuidade-fisica'
  | 'repouso-entre-jornadas';

/**
 * Os parsers preenchem `dutyReport` com a decolagem da primeira etapa quando a
 * fonte não publica apresentação. Nesse caso o horário não é evidência de
 * início de jornada — é apenas um valor padrão — e não pode transformar a
 * continuação de uma jornada que atravessou 00:00 em jornada nova (#512).
 */
function dayReportIsPublished(day: RosterDay): boolean {
  const report = normalizeTime(day.dutyReport);
  if (!report) return false;
  const firstDeparture = normalizeTime(day.legs?.[0]?.departureTime);
  return report !== firstDeparture;
}

/**
 * Decide se `leg` inicia uma nova jornada. A ordem importa: evidência publicada
 * vence sempre; continuidade física e intervalo são apenas fallback para as
 * fontes que não publicam apresentação por etapa.
 */
function legPresentationIsPublished(leg: FlightLeg): boolean {
  const presentation = normalizeTime(leg.presentationTime);
  // Igual à decolagem significa valor padrão do parser, não apresentação publicada.
  return Boolean(presentation) && presentation !== normalizeTime(leg.departureTime);
}

function journeyBoundaryReason(
  previous: FlightLeg | null,
  leg: FlightLeg,
  gapMinutes: number | null,
  isFirstLegOfDay: boolean,
  day: RosterDay,
): JourneyBoundaryReason | null {
  if (!previous) return 'primeira-etapa';
  if (legPresentationIsPublished(leg)) return 'apresentacao-publicada-da-etapa';
  if (isFirstLegOfDay && dayReportIsPublished(day)) return 'apresentacao-publicada-do-dia';
  if (airportCode(previous.destination) !== airportCode(leg.origin)) return 'descontinuidade-fisica';
  if (gapMinutes != null && gapMinutes >= MIN_REST_BETWEEN_JOURNEYS_MINUTES) return 'repouso-entre-jornadas';
  return null;
}

function parsePublishedRangeDate(day: string, monthToken: string, year: string): Date | null {
  const month = MONTHS[String(monthToken || '').toUpperCase()];
  const date = new Date(Number(year), (month || 1) - 1, Number(day), 12, 0, 0, 0);
  return month && Number.isFinite(date.getTime()) ? date : null;
}

function inferPublishedRangeFromRawText(rawText?: string | null): { start: Date; end: Date } | null {
  const text = String(rawText || '');
  const match = text.match(/\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\b/i);
  if (!match) return null;
  const start = parsePublishedRangeDate(match[1], match[2], match[3]);
  const end = parsePublishedRangeDate(match[4], match[5], match[6]);
  if (!start || !end) return null;
  return { start, end };
}

function dayDateTime(day: RosterDay, fallbackMonth: number, fallbackYear: number): number {
  const parsed = parseRosterDate(day.date, day.month || fallbackMonth, day.year || fallbackYear);
  return new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0).getTime();
}

function filterDaysByPublishedRange(days: RosterDay[], roster: CrewRoster, fallbackMonth: number, fallbackYear: number): RosterDay[] {
  const range = inferPublishedRangeFromRawText(roster.rawText);
  if (!range) return days;

  const start = range.start.getTime();
  const end = range.end.getTime();
  const forwardContinuationLimit = end + 45 * 24 * 60 * 60_000;
  return days.filter((day) => {
    const time = dayDateTime(day, fallbackMonth, fallbackYear);
    // Remove resíduos do mês anterior, mas preserva a programação já
    // publicada do mês seguinte para que ela apareça no seletor mensal.
    return (time >= start && time <= end) || (time > end && time <= forwardContinuationLimit);
  });
}

function inferRosterPeriodFromRawText(rawText?: string | null): { month: number; year: number } | null {
  const text = String(rawText || '');
  const range = text.match(/\b\d{1,2}-([A-Za-z]{3})-(\d{4})\s+to\s+\d{1,2}-([A-Za-z]{3})-(\d{4})\b/i);
  if (range) {
    const month = MONTHS[range[1].toUpperCase()] || MONTHS[range[3].toUpperCase()];
    const year = Number(range[2]) || Number(range[4]);
    if (month && year) return { month, year };
  }

  const first = text.match(/\b\d{1,2}-([A-Za-z]{3})-(\d{4})\b/i);
  if (first) {
    const month = MONTHS[first[1].toUpperCase()];
    const year = Number(first[2]);
    if (month && year) return { month, year };
  }

  return null;
}

function inferRosterPeriodFromDays(days: RosterDay[], fallbackMonth: number, fallbackYear: number): { month: number; year: number } {
  const counts = new Map<string, { month: number; year: number; count: number }>();

  for (const day of days || []) {
    const parsed = parseRosterDate(day.date, day.month || fallbackMonth, day.year || fallbackYear);
    if (!parsed.month || !parsed.year) continue;
    const key = `${parsed.month}|${parsed.year}`;
    const current = counts.get(key) || { month: parsed.month, year: parsed.year, count: 0 };
    current.count += Math.max(1, (day.legs || []).length);
    counts.set(key, current);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || { month: fallbackMonth, year: fallbackYear };
}

function inferCanonicalRosterPeriod(roster: CrewRoster, days: RosterDay[], fallbackMonth: number, fallbackYear: number): { month: number; year: number } {
  // Primeiro tenta o período publicado do CrewRosterReport: "01-Jul-2026 to 31-Jul-2026".
  // Isso evita exibir Junho quando o PDF é de Julho.
  const fromText = inferRosterPeriodFromRawText(roster.rawText);
  if (fromText) return fromText;

  return inferRosterPeriodFromDays(days, fallbackMonth, fallbackYear);
}

export function normalizeRosterDays(roster: CrewRoster): CrewRoster {
  const byActivity = new Map<string, RosterDay>();
  const defaultMonth = roster.month || new Date().getMonth() + 1;
  const defaultYear = roster.year || new Date().getFullYear();

  for (const sourceDay of Array.isArray(roster.days) ? roster.days : []) {
    const parsed = parseRosterDate(sourceDay.date, sourceDay.month || defaultMonth, sourceDay.year || defaultYear);
    const date = formatDate(parsed.day, parsed.month, parsed.year);
    const day = cloneDay({ ...sourceDay, date, dayNumber: parsed.day, month: parsed.month, year: parsed.year });
    day.legs = selectPhysicalLegSequence(sortLegs(day.legs || [], day.dutyReport));

    const activityKey = day.legs?.length
      ? `${date}|VOO|${day.dutyReport || ''}|${day.legs[0]?.flightNumber || day.pairingCode || ''}`
      : `${date}|${day.type || day.pairingCode || 'OTHER'}|${day.dutyReport || ''}|${day.dutyDebrief || ''}`;
    const current = byActivity.get(activityKey);
    if (!current) {
      const seen = new Set<string>();
      day.legs = day.legs.filter((leg) => {
        const key = legKey(day, leg);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      byActivity.set(activityKey, day);
      continue;
    }

    const seen = new Set((current.legs || []).map((leg) => legKey(current, leg)));
    for (const leg of day.legs || []) {
      const key = legKey(day, leg);
      if (!seen.has(key)) {
        current.legs.push(leg);
        seen.add(key);
      }
    }

    current.legs = selectPhysicalLegSequence(sortLegs(current.legs || [], current.dutyReport));
    current.rawText = [current.rawText, day.rawText].filter(Boolean).join(' ');
    current.type = current.legs.length ? 'VOO' : current.type;
    current.pairingCode = current.pairingCode || day.pairingCode;
    current.dutyReport = current.dutyReport || day.dutyReport;
    current.dutyDebrief = current.dutyDebrief || day.dutyDebrief;
    current.hotel = current.hotel || day.hotel;
    current.isNextDay = Boolean(current.isNextDay || day.isNextDay || current.legs.some((leg) => legCrossesNextDay(leg)));
  }

  const collectedDays = Array.from(byActivity.values())
    .map((day) => ({ ...day, legs: selectPhysicalLegSequence(sortLegs(day.legs || [], day.dutyReport)) }))
    .sort((a, b) => dateAt(a, '00:00', 0).getTime() - dateAt(b, '00:00', 0).getTime());
  const period = inferCanonicalRosterPeriod(roster, collectedDays, defaultMonth, defaultYear);
  const completedDays = completeContinuityDays(collectedDays, roster);
  const normalizedDays = filterDaysByPublishedRange(completedDays, roster, period.month, period.year);

  return {
    ...roster,
    month: period.month,
    year: period.year,
    days: normalizedDays,
  };
}

export function buildCanonicalRosterEvents(roster: CrewRoster): CanonicalRosterEvent[] {
  const normalized = normalizeRosterDays(roster);
  const events: CanonicalRosterEvent[] = [];

  // Estado da jornada corrente. Vive fora do laço de dias porque uma jornada que
  // atravessa 00:00 continua no dia civil seguinte com a mesma identidade: a
  // virada de data não abre jornada nem apresentação nova (#512).
  let currentJourneyId = '';
  let journeyPreviousLeg: FlightLeg | null = null;
  let journeyPreviousEndMs: number | null = null;

  const closeJourney = () => {
    currentJourneyId = '';
    journeyPreviousLeg = null;
    journeyPreviousEndMs = null;
  };

  normalized.days.forEach((day) => {
    if (day.legs?.length) {
      const legs = sortLegs(day.legs, day.dutyReport);
      let physicalDayOffset = 0;
      let previousArrivalAbsolute: number | null = null;
      legs.forEach((leg, index) => {
        const departure = normalizeTime(leg.departureTime) || '00:00';
        const arrival = normalizeTime(leg.arrivalTime) || departure;
        const start = dateAt(day, departure, 0);
        const end = dateAt(day, arrival, 23);
        const departureMinute = minutes(departure) || 0;
        const arrivalMinute = minutes(arrival) || 0;
        while (previousArrivalAbsolute != null && departureMinute + physicalDayOffset * 1440 < previousArrivalAbsolute) physicalDayOffset += 1;
        start.setDate(start.getDate() + physicalDayOffset);
        const arrivalOffset = physicalDayOffset + (legCrossesNextDay(leg) || arrivalMinute < departureMinute ? 1 : 0);
        end.setDate(end.getDate() + arrivalOffset);
        previousArrivalAbsolute = arrivalMinute + arrivalOffset * 1440;
        const isNextDay = physicalDayOffset > 0 || arrivalOffset > 0;

        const gapMinutes = journeyPreviousEndMs != null
          ? Math.round((start.getTime() - journeyPreviousEndMs) / 60_000)
          : null;
        const boundary = journeyBoundaryReason(journeyPreviousLeg, leg, gapMinutes, index === 0, day);
        const showPresentation = boundary !== null;
        if (showPresentation) {
          currentJourneyId = `jornada|${start.toISOString()}|${leg.flightNumber}|${leg.origin}`;
        }

        // #525: um intervalo ENTRE jornadas precisa existir na linha do tempo,
        // mesmo quando não é pernoite. `journeyBoundaryReason` declara boundary
        // por razões que não exigem intervalo nenhum (apresentação publicada,
        // descontinuidade física), enquanto o pernoite sintético só nasce com
        // 12h a 96h. Entre os dois critérios havia uma zona morta: boundary
        // declarado com intervalo curto zerava `groundBeforeMinutes` (correto —
        // não é conexão) e não gerava stay, então o intervalo sumia da UI.
        //
        // Este evento cobre exatamente essa faixa, e é derivado do BOUNDARY, não
        // de pares de dias civis — por isso também representa o intervalo entre
        // duas jornadas dentro do mesmo dia civil, que a varredura por dia civil
        // nunca alcança.
        //
        // `gapMinutes` só é não-nulo quando existe perna anterior na sequência
        // contínua; um pernoite/folga já emitido encerra a jornada e zera esse
        // estado, então este evento nunca duplica um stay existente.
        if (showPresentation && gapMinutes != null && gapMinutes > 0) {
          const restStart = new Date(journeyPreviousEndMs as number);
          const station = airportCode(journeyPreviousLeg?.destination) || airportCode(leg.origin);
          events.push({
            id: `journey-rest|${restStart.toISOString()}|${station}`,
            kind: 'journey-rest',
            date: formatDate(restStart.getDate(), restStart.getMonth() + 1, restStart.getFullYear()),
            publishedDay: day,
            startDateTime: restStart.toISOString(),
            endDateTime: start.toISOString(),
            flightNumber: '',
            origin: station,
            destination: station,
            presentation: '',
            departure: '',
            arrival: '',
            isNextDay: restStart.toDateString() !== start.toDateString(),
            sourceConfidence: 'alta',
            legIndex: -1,
            legCount: 0,
            showPresentation: false,
            // Repouso entre jornadas nunca é tempo em solo: solo é intra-jornada.
            groundBeforeMinutes: null,
            restMinutes: gapMinutes,
            journeyId: currentJourneyId,
            journeyBoundary: boundary,
          });
        }

        // Apresentação da jornada: evidência publicada da etapa, senão a do dia
        // quando o dia realmente publica uma, senão a própria decolagem.
        const publishedPresentation = normalizeTime(leg.presentationTime)
          || (index === 0 && dayReportIsPublished(day) ? normalizeTime(day.dutyReport) : null);
        const rawPresentation = publishedPresentation || departure;
        const presentation = showPresentation && !presentationIsUnsafe(rawPresentation, departure) ? rawPresentation : departure;

        events.push({
          id: `${day.date}|${index}|${leg.flightNumber}|${leg.origin}|${leg.destination}|${departure}|${arrival}`,
          kind: 'flight',
          date: day.date,
          publishedDay: day,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          flightNumber: leg.flightNumber,
          origin: leg.origin,
          destination: leg.destination,
          presentation,
          departure,
          arrival,
          isNextDay,
          sourceConfidence: presentation === rawPresentation ? 'alta' : 'media',
          legIndex: index,
          legCount: legs.length,
          showPresentation,
          // Tempo em solo só descreve espera DENTRO de uma jornada. Entre
          // jornadas o intervalo é repouso, não conexão (#440, #512).
          groundBeforeMinutes: boundary === null ? gapMinutes : null,
          leg,
          journeyId: currentJourneyId,
          journeyBoundary: boundary,
        });

        journeyPreviousLeg = leg;
        journeyPreviousEndMs = end.getTime();
      });
      return;
    }

    // Folga, pernoite, reserva ou treinamento encerram a jornada anterior:
    // a próxima etapa de voo recomeça com apresentação própria.
    closeJourney();

    const type = String(day.type || day.pairingCode || '').toUpperCase();
    const continuity = day as RosterDay & { continuityInferred?: boolean; continuityStart?: string; continuityEnd?: string };
    const isContinuityStay = Boolean(continuity.continuityInferred) || /(?:PERNOITE|DESCANSO_BASE)_CONTINUIDADE/.test(type);
    const kind: CanonicalRosterEventKind = ['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'VC'].includes(type)
      ? 'rest'
      : (isContinuityStay || day.hotel || /PERNOITE|LAYOVER|ESTADIA|HOTEL/.test(type) ? 'stay' : 'duty');
    const startTime = normalizeTime(day.dutyReport) || '00:00';
    const endTime = normalizeTime(day.dutyDebrief) || '23:59';
    const continuityStart = continuity.continuityStart ? new Date(continuity.continuityStart) : null;
    const continuityEnd = continuity.continuityEnd ? new Date(continuity.continuityEnd) : null;
    const hasExactContinuity = Boolean(continuityStart && continuityEnd && Number.isFinite(continuityStart.getTime()) && Number.isFinite(continuityEnd.getTime()) && continuityEnd >= continuityStart);
    const start = hasExactContinuity ? continuityStart! : dateAt(day, startTime, 0);
    const end = hasExactContinuity ? continuityEnd! : dateAt(day, endTime, 23);
    if (!hasExactContinuity && (minutes(endTime) ?? 0) < (minutes(startTime) ?? 0)) end.setDate(end.getDate() + 1);

    events.push({
      id: `${day.date}|${kind}|${day.pairingCode || day.type || 'event'}`,
      kind,
      date: day.date,
      publishedDay: day,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      flightNumber: day.pairingCode || day.type || 'DUTY',
      origin: day.base,
      destination: day.base,
      presentation: startTime,
      departure: startTime,
      arrival: endTime,
      isNextDay: end.getDate() !== start.getDate(),
      sourceConfidence: 'media',
      legIndex: 0,
      legCount: 1,
      showPresentation: true,
      groundBeforeMinutes: null,
      journeyId: `${kind}|${day.date}|${day.pairingCode || day.type || 'event'}`,
      journeyBoundary: 'primeira-etapa',
    });
  });

  return events.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
}

export function selectNextRosterEvent(events: CanonicalRosterEvent[], now = new Date()): CanonicalRosterEvent | null {
  const sorted = [...events].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const active = sorted.find((event) => {
    const start = new Date(event.startDateTime).getTime();
    const end = new Date(event.endDateTime).getTime();
    return start <= now.getTime() && end >= now.getTime();
  });
  if (active) return active;
  return sorted.find((event) => new Date(event.startDateTime).getTime() > now.getTime()) || null;
}

export function rosterCounters(roster: CrewRoster) {
  const normalized = normalizeRosterDays(roster);
  const events = buildCanonicalRosterEvents(normalized);
  return {
    days: normalized.days.length,
    flights: events.filter((event) => event.kind === 'flight').length,
    activities: events.filter((event) => event.kind === 'duty' || event.kind === 'stay').length,
    rest: events.filter((event) => event.kind === 'rest').length,
    events: events.length,
  };
}
