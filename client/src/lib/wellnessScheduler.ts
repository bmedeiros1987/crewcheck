/**
 * CrewCheck Wellness Scheduler — motor determinístico e auditável.
 *
 * Entrada: programação oficial (C/I e C/O em UTC real, fuso de cada aeroporto), janelas de
 * referência do relatório CrewCheck, compromissos pessoais (somente intervalos ocupados, sem
 * título) e, quando autorizados, dados de sono/FC de repouso/atividade do relógio.
 * Saída por dia: TRAIN / TRAIN_LIGHT / RECOVERY / REST, intensidade, confiança, fatores e janela.
 *
 * Regras rígidas (preferências do usuário, não regras aeronáuticas):
 *  - nenhum treino começa antes de C/O + minimumRecoveryBeforeWorkoutHours (padrão 8h);
 *  - o treino termina até a próxima apresentação − minimumBufferBeforeDutyHours (padrão 4h);
 *  - não sobrepõe compromisso pessoal;
 *  - dados de saúde são comparados à LINHA DE BASE do próprio usuário, nunca a limiar universal;
 *  - nada é inventado: dado ausente aparece como "Dado não disponível".
 * Não é diagnóstico médico nem avaliação de aptidão; uso exclusivo de bem-estar pessoal.
 */
import type { RosterDutyInterval } from './calendarExport';

export type WellnessDecision = 'TRAIN' | 'TRAIN_LIGHT' | 'RECOVERY' | 'REST';
export type WellnessIntensity = 'complete' | 'moderate' | 'light' | 'recovery' | 'rest';
export type WellnessConfidence = 'alta' | 'média' | 'baixa';
export type ReferenceAvailability = 'ideal' | 'good' | 'moderate' | 'limited';

export interface WellnessPreferences {
  autoOrganize: boolean;
  syncSchedule: boolean;
  syncAcademia: boolean;
  useHealthData: boolean;
  minimumRecoveryBeforeWorkoutHours: number;
  minimumBufferBeforeDutyHours: number;
  earliestWorkoutStart: string;
  latestWorkoutEnd: string;
  academiaCalendarName: string;
  scheduleCalendarName: string;
}

export const DEFAULT_WELLNESS_PREFERENCES: WellnessPreferences = {
  autoOrganize: false,
  syncSchedule: true,
  syncAcademia: true,
  useHealthData: true,
  minimumRecoveryBeforeWorkoutHours: 8,
  minimumBufferBeforeDutyHours: 4,
  earliestWorkoutStart: '06:00',
  latestWorkoutEnd: '22:30',
  academiaCalendarName: 'Academia',
  scheduleCalendarName: 'Bruno & Marina',
};

export function normalizeWellnessPreferences(value: Partial<WellnessPreferences> | null | undefined): WellnessPreferences {
  const merged = { ...DEFAULT_WELLNESS_PREFERENCES, ...(value || {}) };
  const hours = (input: unknown, fallback: number, max: number) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? Math.round(parsed * 4) / 4 : fallback;
  };
  const clock = (input: unknown, fallback: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input)) ? String(input) : fallback);
  return {
    autoOrganize: Boolean(merged.autoOrganize),
    syncSchedule: Boolean(merged.syncSchedule),
    syncAcademia: Boolean(merged.syncAcademia),
    useHealthData: Boolean(merged.useHealthData),
    minimumRecoveryBeforeWorkoutHours: hours(merged.minimumRecoveryBeforeWorkoutHours, 8, 24),
    minimumBufferBeforeDutyHours: hours(merged.minimumBufferBeforeDutyHours, 4, 24),
    earliestWorkoutStart: clock(merged.earliestWorkoutStart, '06:00'),
    latestWorkoutEnd: clock(merged.latestWorkoutEnd, '22:30'),
    academiaCalendarName: String(merged.academiaCalendarName || 'Academia').trim().slice(0, 100) || 'Academia',
    scheduleCalendarName: String(merged.scheduleCalendarName || '').trim().slice(0, 100),
  };
}

export interface WellnessReferenceWindow {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM local
  end: string; // HH:MM local
  availability: ReferenceAvailability;
}

/** Compromisso pessoal reduzido a intervalo ocupado (título e detalhes nunca entram no motor). */
export interface WellnessBusyInterval {
  startUtcMs: number;
  endUtcMs: number;
}

export interface WellnessHealthDay {
  date: string; // YYYY-MM-DD (dia a que o resumo se refere)
  capturedAt?: string;
  summaryPeriodDays?: number;
  sleepMinutes?: number;
  restingHeartRate?: number;
  steps?: number;
  activityMinutes?: number;
  exerciseMinutes?: number;
  provenance?: Partial<Record<'sleepMinutes' | 'restingHeartRate' | 'steps' | 'activityMinutes', { start: string; end: string; periodDays: number }>>;
}

export interface WellnessPlanInput {
  intervals: RosterDutyInterval[];
  references?: WellnessReferenceWindow[];
  busy?: WellnessBusyInterval[];
  health?: WellnessHealthDay[];
  preferences?: Partial<WellnessPreferences>;
  homeTimeZone?: string;
  /** Datas (YYYY-MM-DD) a planejar; padrão: datas da escala e das referências. */
  dates?: string[];
}

export interface WellnessFactor {
  ok: boolean;
  text: string;
}

export interface WellnessDayPlan {
  date: string;
  key: string;
  decision: WellnessDecision;
  intensity: WellnessIntensity;
  title: string;
  confidence: WellnessConfidence;
  factors: WellnessFactor[];
  reason: string;
  timeZone: string;
  window: { startLocal: string; endLocal: string; startUtcMs: number; endUtcMs: number } | null;
  durationMinutes: number;
  context: {
    previousRelease: string | null;
    nextReport: string | null;
    restHoursSincePrevious: number | null;
    hoursUntilNext: number | null;
  };
  health: {
    available: boolean;
    sleep: string;
    restingHeartRate: string;
    activity: string;
    recovery: string;
  };
  reference: WellnessReferenceWindow | null;
  adjustedFromReference: boolean;
  adjustmentNote: string;
  /** REST só vira evento quando substitui uma referência ou decorre do relógio (evita poluir dias de voo). */
  publishEvent: boolean;
}

const LEVELS: { decision: WellnessDecision; intensity: WellnessIntensity; title: string; minutes: number }[] = [
  { decision: 'TRAIN', intensity: 'complete', title: '🏋️ Academia · Treino completo', minutes: 75 },
  { decision: 'TRAIN', intensity: 'moderate', title: '🏋️ Academia · Treino moderado', minutes: 60 },
  { decision: 'TRAIN_LIGHT', intensity: 'light', title: '🚶 Academia · Treino leve', minutes: 45 },
  { decision: 'RECOVERY', intensity: 'recovery', title: '🧘 Recuperação · Mobilidade / caminhada', minutes: 25 },
  { decision: 'REST', intensity: 'rest', title: '😴 Descanso recomendado', minutes: 0 },
];
const REST_LEVEL = 4;
const REFERENCE_LEVEL: Record<ReferenceAvailability, number> = { ideal: 0, good: 1, moderate: 2, limited: 3 };
const HOUR = 3_600_000;
const MINUTE = 60_000;
const DEFAULT_TZ = 'America/Sao_Paulo';

// ---------- tempo com fuso explícito (independe do fuso do aparelho) ----------
function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - utcMs;
}

export function localToUtcMs(isoDate: string, clock: string, timeZone: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = clock.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const first = offsetMs(guess, timeZone);
  const candidate = guess - first;
  const second = offsetMs(candidate, timeZone);
  return second === first ? candidate : guess - second;
}

function localParts(utcMs: number, timeZone: string): { date: string; clock: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, clock: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` };
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const value = new Date(Date.UTC(y, m - 1, d + days, 12));
  return value.toISOString().slice(0, 10);
}

function brDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function describeInstant(utcMs: number | null, timeZone: string, referenceDate: string): string | null {
  if (utcMs == null) return null;
  const local = localParts(utcMs, timeZone);
  return local.date === referenceDate ? local.clock : `${local.clock} de ${brDate(local.date)}`;
}

function hoursLabel(hours: number): string {
  const total = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
}

function roundUpTo5(utcMs: number): number {
  return Math.ceil(utcMs / (5 * MINUTE)) * 5 * MINUTE;
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

type Segment = [number, number];

function subtract(segments: Segment[], block: Segment): Segment[] {
  const out: Segment[] = [];
  for (const [start, end] of segments) {
    if (block[1] <= start || block[0] >= end) { out.push([start, end]); continue; }
    if (block[0] > start) out.push([start, block[0]]);
    if (block[1] < end) out.push([block[1], end]);
  }
  return out;
}

// Only timestamped daily evidence participates; capture time is not measurement time.
function dailyValue(day: WellnessHealthDay, metric: 'sleepMinutes' | 'restingHeartRate' | 'steps' | 'activityMinutes', timeZone: string): number | undefined {
  const value = day[metric];
  const source = day.provenance?.[metric];
  const start = Date.parse(source?.start || '');
  const end = Date.parse(source?.end || '');
  if (!Number.isFinite(value) || !value || value <= 0 || !source || source.periodDays !== 1 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * HOUR ||
      localParts(end, timeZone).date !== day.date) return undefined;
  return value;
}

// ---------- motor ----------
export function planWellness(input: WellnessPlanInput): WellnessDayPlan[] {
  const prefs = normalizeWellnessPreferences(input.preferences);
  const homeTimeZone = input.homeTimeZone || DEFAULT_TZ;
  const timed = input.intervals
    .filter((item) => item.startUtcMs != null && item.endUtcMs != null)
    .sort((a, b) => (a.startUtcMs as number) - (b.startUtcMs as number));
  const byDate = new Map<string, RosterDutyInterval[]>();
  for (const item of input.intervals) byDate.set(item.date, [...(byDate.get(item.date) || []), item]);
  const references = new Map((input.references || []).map((ref) => [ref.date, ref]));
  const health = new Map((input.health || []).map((item) => [item.date, item]));
  const dates = Array.from(new Set(input.dates || [...input.intervals.map((item) => item.date), ...references.keys()])).sort();
  const recoveryMs = prefs.minimumRecoveryBeforeWorkoutHours * HOUR;
  const bufferMs = prefs.minimumBufferBeforeDutyHours * HOUR;
  const plans: WellnessDayPlan[] = [];

  for (const date of dates) {
    const middayHome = localToUtcMs(date, '12:00', homeTimeZone);
    const lastBefore = [...timed].reverse().find((item) => (item.endUtcMs as number) <= middayHome);
    const timeZone = lastBefore?.endTimeZone || homeTimeZone;
    const dayStart = localToUtcMs(date, prefs.earliestWorkoutStart, timeZone);
    const dayEnd = localToUtcMs(date, prefs.latestWorkoutEnd, timeZone);
    const dayKinds = (byDate.get(date) || []).map((item) => item.kind);
    const reference = references.get(date) || null;
    const factors: WellnessFactor[] = [];
    const limits: string[] = [];

    // Segmentos livres após os HARD GATES (8h pós C/O, margem pré-apresentação, pessoal).
    let free: Segment[] = [[dayStart, dayEnd]];
    for (const duty of timed) {
      free = subtract(free, [(duty.startUtcMs as number) - bufferMs, (duty.endUtcMs as number) + recoveryMs]);
    }
    let personalConflict = false;
    for (const busy of input.busy || []) {
      const before = free.reduce((sum, [s, e]) => sum + (e - s), 0);
      free = subtract(free, [busy.startUtcMs, busy.endUtcMs]);
      if (free.reduce((sum, [s, e]) => sum + (e - s), 0) < before) personalConflict = true;
    }
    free = free.map(([s, e]): Segment => [roundUpTo5(s), e]).filter(([s, e]) => e - s >= 20 * MINUTE);

    // Jornada anterior ao dia útil (para a carga da escala quando não há referência).
    const previous = [...timed].reverse().find((item) => (item.endUtcMs as number) <= dayStart + 6 * HOUR) || null;
    const restHours = previous ? (dayStart - (previous.endUtcMs as number)) / HOUR : null;

    // Nível base: referência do relatório ou, sem ela, tamanho da maior janela livre.
    const longest = free.reduce((max, [s, e]) => Math.max(max, e - s), 0) / HOUR;
    const restDay = dayKinds.some((kind) => kind === 'rest' || kind === 'vacation');
    let level = reference ? REFERENCE_LEVEL[reference.availability] : longest >= 4 && restDay ? 0 : longest >= 3 ? 1 : longest >= 2 ? 2 : longest >= 0.75 ? 3 : REST_LEVEL;
    if (!reference) {
      // Sem referência, a carga da escala ajusta o nível (com referência ela já está embutida).
      const prevDuty = previous && previous.endUtcMs != null && previous.startUtcMs != null ? previous : null;
      if (prevDuty) {
        const dutyHours = ((prevDuty.endUtcMs as number) - (prevDuty.startUtcMs as number)) / HOUR;
        const endHour = Number(localParts(prevDuty.endUtcMs as number, prevDuty.endTimeZone).clock.slice(0, 2));
        if (dutyHours >= 10 || prevDuty.legsCount >= 4) { level += 1; limits.push(`Jornada anterior pesada (${hoursLabel(dutyHours)}, ${prevDuty.legsCount} etapa(s))`); }
        if (endHour < 6 && (restHours ?? 99) < 24) { level += 1; limits.push('Liberação na madrugada antes deste dia'); }
      }
    }
    if (dayKinds.includes('standby-airport')) { level = REST_LEVEL; limits.push('ASB: em sobreaviso no aeroporto'); }
    else if (dayKinds.includes('standby-home')) { level = Math.max(level, 3); limits.push('HSB: fique próximo de casa (mobilidade/caminhada leve)'); }

    // Relógio (somente se autorizado e disponível): comparação com a linha de base pessoal.
    const rawToday = prefs.useHealthData ? health.get(date) : undefined;
    const today = rawToday ? { ...rawToday, sleepMinutes: dailyValue(rawToday, 'sleepMinutes', timeZone), restingHeartRate: dailyValue(rawToday, 'restingHeartRate', timeZone), steps: dailyValue(rawToday, 'steps', timeZone), activityMinutes: dailyValue(rawToday, 'activityMinutes', timeZone) } : undefined;
    const history = (input.health || []).filter((item) => item.date < date && item.date >= addDaysIso(date, -30));
    const sleepBaseline = median(history.map((item) => dailyValue(item, 'sleepMinutes', timeZone) || 0));
    const rhrBaseline = median(history.map((item) => dailyValue(item, 'restingHeartRate', timeZone) || 0));
    const recoveryKnown = Boolean(today?.sleepMinutes && sleepBaseline && today?.restingHeartRate && rhrBaseline);
    let healthDriven = false;
    const healthView = { available: Boolean(today?.sleepMinutes || today?.restingHeartRate || today?.steps || today?.activityMinutes), sleep: 'Dado não disponível', restingHeartRate: 'Dado não disponível', activity: 'Dado não disponível', recovery: 'Dado não disponível' };
    if (today) {
      if (today.sleepMinutes) {
        healthView.sleep = `${hoursLabel(today.sleepMinutes / 60)}${sleepBaseline ? ` (sua média ${hoursLabel(sleepBaseline / 60)})` : ' (linha de base em formação)'}`;
        if (sleepBaseline) {
          const ratio = today.sleepMinutes / sleepBaseline;
          if (ratio < 0.7) { level += 2; healthDriven = true; limits.push('Sono bem abaixo do seu habitual'); }
          else if (ratio < 0.85) { level += 1; healthDriven = true; limits.push('Sono abaixo do seu habitual'); }
          else factors.push({ ok: true, text: 'Sono dentro do seu habitual' });
        }
      }
      if (today.restingHeartRate) {
        healthView.restingHeartRate = `${Math.round(today.restingHeartRate)} bpm${rhrBaseline ? ` (sua média ${Math.round(rhrBaseline)} bpm)` : ' (linha de base em formação)'}`;
        if (rhrBaseline) {
          const delta = (today.restingHeartRate - rhrBaseline) / rhrBaseline;
          const pct = Math.round(delta * 100);
          if (delta > 0.1) { level += 2; healthDriven = true; limits.push(`FC repouso ${pct}% acima da sua média`); }
          else if (delta > 0.05) { level += 1; healthDriven = true; limits.push(`FC repouso ${pct}% acima da sua média`); }
          else factors.push({ ok: true, text: 'FC repouso dentro da sua média' });
        }
      }
      if (today.activityMinutes || today.steps) healthView.activity = [today.activityMinutes ? `${Math.round(today.activityMinutes)} min de atividade` : '', today.steps ? `${Math.round(today.steps).toLocaleString('pt-BR')} passos` : ''].filter(Boolean).join(' · ');
      healthView.recovery = healthDriven ? 'Intermediária: reduzir carga' : recoveryKnown ? 'Dentro do seu padrão' : 'Dado não disponível';
    }
    const yesterday = health.get(addDaysIso(date, -1));
    if (prefs.useHealthData && yesterday?.exerciseMinutes && yesterday.exerciseMinutes >= 60 && level === 0) {
      level = 1; limits.push('Treino longo registrado ontem');
    }
    const previousPlan = plans[plans.length - 1];
    if (previousPlan && previousPlan.date === addDaysIso(date, -1) && previousPlan.intensity === 'complete' && level === 0) {
      level = 1; limits.push('Evita dois treinos completos seguidos');
    }
    level = Math.min(REST_LEVEL, Math.max(0, level));

    // Janela: preferir o horário de referência; senão manhã em dia livre ou o primeiro horário viável.
    const preferredClock = reference?.start || (restDay ? '08:30' : null);
    const preferred = preferredClock ? localToUtcMs(date, preferredClock, timeZone) : dayStart;
    let window: WellnessDayPlan['window'] = null;
    let chosenLevel = level;
    for (let candidate = level; candidate < REST_LEVEL; candidate += 1) {
      const minutes = candidate === 0 && reference ? Math.max(60, Math.min(90, (localToUtcMs(date, reference.end, timeZone) - localToUtcMs(date, reference.start, timeZone)) / MINUTE)) : LEVELS[candidate].minutes;
      const need = minutes * MINUTE;
      const options = free
        .map(([s, e]) => {
          const start = Math.max(s, Math.min(preferred, e - need));
          return e - start >= need && start >= s ? start : null;
        })
        .filter((start): start is number => start != null)
        .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
      if (options.length) {
        const start = roundUpTo5(options[0]);
        window = { startLocal: localParts(start, timeZone).clock, endLocal: localParts(start + need, timeZone).clock, startUtcMs: start, endUtcMs: start + need };
        chosenLevel = candidate;
        break;
      }
    }
    if (!window && level < REST_LEVEL) {
      chosenLevel = REST_LEVEL;
      limits.push(personalConflict && free.length === 0
        ? 'Agenda pessoal ocupada nas janelas possíveis'
        : `Sem janela que respeite ${prefs.minimumRecoveryBeforeWorkoutHours}h após o C/O e ${prefs.minimumBufferBeforeDutyHours}h antes da próxima apresentação`);
    } else if (chosenLevel > level) {
      limits.push('Janela livre curta: atividade reduzida para caber com segurança');
    }
    if (personalConflict && window) factors.push({ ok: true, text: 'Horário ajustado para não conflitar com compromisso pessoal' });

    // Contexto medido a partir da janela escolhida (ou do início do dia útil, se não houver janela).
    const anchorStart = window && chosenLevel !== REST_LEVEL ? window.startUtcMs : dayStart;
    const anchorEnd = window && chosenLevel !== REST_LEVEL ? window.endUtcMs : dayStart;
    const prior = [...timed].reverse().find((item) => (item.endUtcMs as number) <= anchorStart) || null;
    const next = timed.find((item) => (item.startUtcMs as number) >= anchorEnd) || null;
    const sincePrior = prior ? (anchorStart - (prior.endUtcMs as number)) / HOUR : null;
    const untilNext = next ? ((next.startUtcMs as number) - anchorEnd) / HOUR : null;
    const previousRelease = prior ? `${describeInstant(prior.endUtcMs, prior.endTimeZone, date)} (${prior.endAirport})` : null;
    const nextReport = next ? `${describeInstant(next.startUtcMs, next.startTimeZone, date)} (${next.startAirport})` : null;
    if (sincePrior != null) factors.push({ ok: sincePrior >= prefs.minimumRecoveryBeforeWorkoutHours, text: `${hoursLabel(sincePrior)} desde a última jornada` });
    if (untilNext != null) factors.push({ ok: untilNext >= prefs.minimumBufferBeforeDutyHours, text: `Próxima apresentação em ${hoursLabel(untilNext)}` });
    for (const text of limits) factors.push({ ok: false, text });
    if (!healthView.available) factors.push({ ok: false, text: 'Relógio: dado não disponível' });

    const spec = LEVELS[chosenLevel];
    const confidence: WellnessConfidence = recoveryKnown ? 'alta' : reference ? 'média' : 'baixa';
    const reason = chosenLevel === REST_LEVEL
      ? (limits[limits.length - 1] || 'Sem janela adequada hoje')
      : limits.length
        ? `Janela operacional possível, com ressalvas: ${limits.join('; ')}.`
        : recoveryKnown ? 'Janela operacional adequada e recuperação dentro do seu padrão.' : 'Janela operacional possível; recuperação desconhecida. Sugestão baseada apenas na escala.';
    let adjustmentNote = '';
    let adjusted = false;
    if (reference) {
      const moved = !window || window.startLocal !== reference.start || window.endLocal !== reference.end;
      const changedLevel = chosenLevel !== REFERENCE_LEVEL[reference.availability];
      adjusted = moved || changedLevel;
      if (adjusted) adjustmentNote = window ? `Relatório: ${reference.start}–${reference.end}; motor: ${window.startLocal}–${window.endLocal}` : `Relatório: ${reference.start}–${reference.end}; motor: removido`;
    }
    plans.push({
      date,
      key: `wellness|${date}`,
      decision: spec.decision,
      intensity: spec.intensity,
      title: spec.title,
      confidence,
      factors,
      reason,
      timeZone,
      window: chosenLevel === REST_LEVEL ? null : window,
      durationMinutes: chosenLevel === REST_LEVEL || !window ? 0 : Math.round((window.endUtcMs - window.startUtcMs) / MINUTE),
      context: { previousRelease, nextReport, restHoursSincePrevious: sincePrior, hoursUntilNext: untilNext },
      health: healthView,
      reference,
      adjustedFromReference: adjusted,
      adjustmentNote,
      publishEvent: chosenLevel !== REST_LEVEL || Boolean(reference) || healthDriven,
    });
  }
  return plans;
}

export function wellnessDecisionLabel(plan: Pick<WellnessDayPlan, 'decision' | 'intensity'>): string {
  if (plan.intensity === 'complete') return 'TREINO COMPLETO';
  if (plan.intensity === 'moderate') return 'TREINO MODERADO';
  if (plan.decision === 'TRAIN_LIGHT') return 'TREINO LEVE';
  if (plan.decision === 'RECOVERY') return 'RECUPERAÇÃO';
  return 'DESCANSO';
}

/** External text is deliberately independent of health, confidence and reasoning. */
export function wellnessEventDescription(plan: WellnessDayPlan): string {
  return plan.window
    ? `Atividade pessoal · ${plan.window.startLocal}–${plan.window.endLocal}\n#CREWCHECK\n#WELLNESS`
    : 'Reserva pessoal de dia inteiro\n#CREWCHECK\n#WELLNESS';
}
