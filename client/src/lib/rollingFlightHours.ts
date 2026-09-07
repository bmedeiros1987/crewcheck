export type FlightHoursObservation = {
  /** Civil operational date in CrewCheck's canonical DD/MM/YYYY representation. */
  date: string;
  /** Flight hours attributable to that operational date. */
  hours: number;
};

const DAY_MS = 86_400_000;
const ROLLING_28_DAYS_MS = 28 * DAY_MS;

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * Parse a CrewCheck civil date without inheriting the host/device timezone.
 * Regulatory rolling windows are calendar-day windows, so using Date(y,m,d)
 * would make the same roster depend on the machine timezone/DST.
 */
export function crewDateUtcEpoch(date: string): number | null {
  const match = String(date || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const parsed = new Date(epoch);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return null;
  return epoch;
}

export function competenceKey(month: number, year: number): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function observationCompetenceKey(observation: FlightHoursObservation): string | null {
  const epoch = crewDateUtcEpoch(observation.date);
  if (epoch === null) return null;
  const date = new Date(epoch);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * KPI da competência ativa. Histórico adjacente pode participar de janelas
 * móveis, mas nunca deve inflar este total.
 */
export function sumFlightHoursForCompetence(
  observations: FlightHoursObservation[],
  month: number,
  year: number,
): number {
  const target = competenceKey(month, year);
  if (!target) return 0;
  const total = observations.reduce((sum, observation) => {
    if (observationCompetenceKey(observation) !== target) return sum;
    const hours = Number(observation.hours);
    return Number.isFinite(hours) && hours > 0 ? sum + hours : sum;
  }, 0);
  return round1(total);
}

/**
 * Maior soma observada em qualquer janela de 28 dias civis consecutivos.
 * O intervalo é [início, início + 28 dias): D1..D28; ao entrar D29, D1 sai.
 * Observações do mesmo dia são somadas e histórico de competência adjacente é
 * deliberadamente elegível. Datas inválidas e horas não positivas não viram
 * evidência regulatória.
 */
export function maxFlightHoursRolling28Days(observations: FlightHoursObservation[]): number {
  const byDay = new Map<number, number>();
  for (const observation of observations) {
    const epoch = crewDateUtcEpoch(observation.date);
    const hours = Number(observation.hours);
    if (epoch === null || !Number.isFinite(hours) || hours <= 0) continue;
    byDay.set(epoch, (byDay.get(epoch) || 0) + hours);
  }

  const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  let best = 0;
  let left = 0;
  let sum = 0;

  for (let right = 0; right < days.length; right += 1) {
    const [rightEpoch, rightHours] = days[right];
    sum += rightHours;
    while (left <= right && rightEpoch - days[left][0] >= ROLLING_28_DAYS_MS) {
      sum -= days[left][1];
      left += 1;
    }
    if (sum > best) best = sum;
  }

  return round1(best);
}

/** Assess trailing windows ending in the active publication, through its last
 * observed day. Missing calendar dates are unknown, never inferred zero hours.
 * Explicit zero-hour days provide coverage; duplicate entries only add hours.
 * The observed maximum is a lower bound when coverage is incomplete.
 */
export function assessFlightHoursRolling28Days(
  observations: FlightHoursObservation[],
  month: number,
  year: number,
): { maxHours: number; complete: boolean } {
  if (!competenceKey(month, year)) return { maxHours: 0, complete: false };
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  const firstRequired = start - 27 * DAY_MS;
  const byDay = new Map<number, number>();
  let lastActive: number | null = null;
  for (const observation of observations) {
    const epoch = crewDateUtcEpoch(observation.date);
    if (epoch === null || epoch < firstRequired || epoch >= end) continue;
    const hours = Number(observation.hours);
    if (!Number.isFinite(hours) || hours < 0) continue;
    byDay.set(epoch, (byDay.get(epoch) || 0) + hours);
    if (epoch >= start) lastActive = Math.max(lastActive ?? start, epoch);
  }
  // Even without an active day, preceding observations can establish a lower
  // bound at the first active date, but cannot establish complete coverage.
  const last = lastActive ?? start;
  let complete = lastActive !== null;
  let sum = 0;
  let best = 0;
  for (let epoch = firstRequired; epoch <= last; epoch += DAY_MS) {
    if (!byDay.has(epoch)) complete = false;
    sum += byDay.get(epoch) || 0;
    sum -= byDay.get(epoch - ROLLING_28_DAYS_MS) || 0;
    if (epoch >= start) best = Math.max(best, sum);
  }
  return { maxHours: round1(best), complete };
}
