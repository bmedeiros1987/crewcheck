import type { DayLoadAnalysis } from './complianceEngine';

export type RoutineActivityType = 'musculacao' | 'corrida' | 'caminhada' | 'crossfit' | 'estudo' | 'faculdade' | 'personalizado';
export type RoutineIntensity = 'baixa' | 'moderada' | 'alta';
export type RoutinePeriod = 'manha' | 'tarde' | 'noite' | 'qualquer';

export interface RoutineActivityConfig {
  id: string;
  type: RoutineActivityType;
  name: string;
  durationMinutes: number;
  intensity: RoutineIntensity;
  frequencyPerWeek: number;
  preferredPeriod: RoutinePeriod;
  notes?: string;
}

export interface RoutineSuggestion {
  id: string;
  date: string;
  dayOfWeek: string;
  activityName: string;
  activityType: RoutineActivityType;
  durationMinutes: number;
  startTime: string;
  endTime: string;
  intensity: RoutineIntensity;
  score: number;
  suitability: 'ideal' | 'boa' | 'moderada' | 'evitar';
  confidence: 'alta' | 'media' | 'baixa';
  reason: string;
  caution: string;
  dayLabel: string;
  category: 'routine' | 'recovery' | 'meal';
  protectedWindow: boolean;
}



const ROUTINE_SLOT_STEP = 15;
const ROUTINE_PREMIUM_VERSION = '10.8.77';
const ROUTINE_MIN_SLEEP_BUFFER_MINUTES = 90;
const ROUTINE_HIGH_INTENSITY_COOLDOWN_HOURS = 36;


export type MealWindowId = 'breakfast' | 'lunch' | 'dinner' | 'supper';

export interface MealPolicyWindow {
  id: MealWindowId;
  name: string;
  startTime: string;
  endTime: string;
  allowanceRule: string;
  protectedLabel: string;
}

export const CREWCHECK_MEAL_WINDOWS: MealPolicyWindow[] = [
  {
    id: 'breakfast',
    name: 'Café da manhã',
    startTime: '05:00',
    endTime: '08:00',
    allowanceRule: 'Diária igual a 25% do valor das refeições principais; não é devida quando já estiver incluída na conta do hotel.',
    protectedLabel: 'café protegido',
  },
  {
    id: 'lunch',
    name: 'Almoço',
    startTime: '11:00',
    endTime: '13:00',
    allowanceRule: 'Janela de refeição principal protegida para alimentação e planejamento de rotina.',
    protectedLabel: 'almoço protegido',
  },
  {
    id: 'dinner',
    name: 'Jantar',
    startTime: '19:00',
    endTime: '20:00',
    allowanceRule: 'Janela de refeição principal protegida para alimentação e planejamento de rotina.',
    protectedLabel: 'jantar protegido',
  },
  {
    id: 'supper',
    name: 'Ceia',
    startTime: '00:00',
    endTime: '01:00',
    allowanceRule: 'Devida independentemente do serviço de alimentação a bordo quando o aeronauta estiver em efetivo exercício de suas funções; considera o intervalo da apresentação até 30 minutos após o término da jornada.',
    protectedLabel: 'ceia protegida',
  },
];

const DEFAULT_ROUTINE_ACTIVITIES: RoutineActivityConfig[] = [
  { id: 'musculacao-60', type: 'musculacao', name: 'Musculação', durationMinutes: 60, intensity: 'moderada', frequencyPerWeek: 3, preferredPeriod: 'manha' },
  { id: 'caminhada-45', type: 'caminhada', name: 'Caminhada', durationMinutes: 45, intensity: 'baixa', frequencyPerWeek: 2, preferredPeriod: 'qualquer' },
  { id: 'estudo-90', type: 'estudo', name: 'Estudo', durationMinutes: 90, intensity: 'baixa', frequencyPerWeek: 3, preferredPeriod: 'noite' },
];

export function defaultRoutineActivities(): RoutineActivityConfig[] {
  return DEFAULT_ROUTINE_ACTIVITIES.map((item) => ({ ...item }));
}

export function getActivityLabel(type: RoutineActivityType): string {
  const labels: Record<RoutineActivityType, string> = {
    musculacao: 'Musculação',
    corrida: 'Corrida',
    caminhada: 'Caminhada',
    crossfit: 'Crossfit',
    estudo: 'Estudo',
    faculdade: 'Faculdade',
    personalizado: 'Personalizado',
  };
  return labels[type];
}

export function getActivityDefaultIntensity(type: RoutineActivityType): RoutineIntensity {
  if (type === 'crossfit' || type === 'corrida') return 'alta';
  if (type === 'musculacao') return 'moderada';
  return 'baixa';
}

export function getActivityDefaultDuration(type: RoutineActivityType): number {
  const defaults: Record<RoutineActivityType, number> = {
    musculacao: 60,
    corrida: 45,
    caminhada: 45,
    crossfit: 60,
    estudo: 90,
    faculdade: 120,
    personalizado: 60,
  };
  return defaults[type];
}

export function buildRoutineSuggestions(days: DayLoadAnalysis[], activities: RoutineActivityConfig[]): RoutineSuggestion[] {
  const chronological = [...days].sort((a, b) => parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime());
  const suggestions: RoutineSuggestion[] = [];
  const usedSlots = new Set<string>();
  if (!chronological.length || !activities.length) return suggestions;

  const weeks = splitDaysByRosterWeek(chronological);

  activities.forEach((activity) => {
    const desiredPerWeek = Math.max(1, Math.min(7, Number(activity.frequencyPerWeek) || 1));

    weeks.forEach((weekDays, weekIndex) => {
      const ranked = weekDays
        .map((day) => {
          const globalIndex = chronological.findIndex((item) => item.date === day.date);
          const previous = chronological[globalIndex - 1] || null;
          const next = chronological[globalIndex + 1] || null;
          return scoreDayForActivity(day, activity, previous, next);
        })
        .sort((a, b) => b.score - a.score || parseRosterDate(a.day.date).getTime() - parseRosterDate(b.day.date).getTime());

      let count = 0;
      for (const option of ranked) {
        if (count >= desiredPerWeek) break;
        // Mesmo quando a semana está pesada, gerar pelo menos uma recomendação prudente para a escala inteira.
        if (option.score < 35 && isPhysicalActivity(activity.type) && count > 0) continue;
        const slot = pickTimeSlot(option.day, activity, usedSlots);
        if (!slot) continue;
        if (!isRoutineSlotAvailable(usedSlots, option.day.date, slot.startTime, activity.durationMinutes)) continue;
        reserveRoutineSlot(usedSlots, option.day.date, slot.startTime, activity.durationMinutes);
        const safeWindowNote = slot.strategy ? `janela segura ${slot.strategy}` : 'janela segura fora da programação';
        suggestions.push({
          id: `${activity.id}-w${weekIndex}-${option.day.date}-${count}`,
          date: option.day.date,
          dayOfWeek: option.day.dayOfWeek,
          activityName: activity.name || getActivityLabel(activity.type),
          activityType: activity.type,
          durationMinutes: activity.durationMinutes,
          startTime: slot.startTime,
          endTime: addMinutes(slot.startTime, activity.durationMinutes),
          intensity: activity.intensity,
          score: option.score,
          suitability: scoreToSuitability(option.score),
          confidence: option.confidence,
          reason: [option.reason, safeWindowNote].filter(Boolean).join(' · '),
          caution: [option.caution, slot.caution].filter(Boolean).join(' · '),
          dayLabel: option.day.label,
          category: 'routine',
          protectedWindow: true,
        });
        count++;
      }
    });
  });

  const restSuggestions = buildRestRecoverySuggestions(chronological, usedSlots);
  const mealSuggestions = buildMealPolicySuggestions(chronological, usedSlots);

  return applyPremiumRoutineReliability([...suggestions, ...restSuggestions, ...mealSuggestions], chronological)
    .sort((a, b) => parseRosterDate(a.date).getTime() - parseRosterDate(b.date).getTime() || a.startTime.localeCompare(b.startTime))
    .slice(0, 220);
}


function applyPremiumRoutineReliability(items: RoutineSuggestion[], days: DayLoadAnalysis[]): RoutineSuggestion[] {
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const previousPhysicalByType = new Map<RoutineActivityType, RoutineSuggestion>();
  return items.map((item) => {
    const day = dayByDate.get(item.date);
    if (!day || item.category !== 'routine') return item;
    let score = item.score;
    let suitability = item.suitability;
    let confidence = item.confidence;
    const cautions = [item.caution].filter(Boolean);
    const reasons = [item.reason, `rotina premium ${ROUTINE_PREMIUM_VERSION}`].filter(Boolean);
    const isPhysical = isPhysicalActivity(item.activityType);
    const isHighDemand = isPhysical && (item.intensity === 'alta' || item.durationMinutes >= 90 || item.activityType === 'crossfit' || item.activityType === 'corrida');

    if (isHighDemand && (day.isNightDuty || day.isLateFinish || day.isEarlyStart)) {
      score -= 18;
      cautions.push('atividade forte rebaixada por madrugada/apresentação cedo/fim tardio');
    }
    if (isHighDemand && ((day.restBefore !== null && day.restBefore < 14) || (day.restAfter !== null && day.restAfter < 14))) {
      score -= 22;
      cautions.push('repouso curto: prefira mobilidade, caminhada leve ou recuperação');
      confidence = confidence === 'alta' ? 'media' : confidence;
    }
    if (isHighDemand) {
      const previous = previousPhysicalByType.get(item.activityType);
      if (previous) {
        const diffHours = Math.abs(parseRosterDate(item.date).getTime() - parseRosterDate(previous.date).getTime()) / 36e5;
        if (diffHours < ROUTINE_HIGH_INTENSITY_COOLDOWN_HOURS) {
          score -= 12;
          cautions.push('janela próxima de outro treino forte; manter intensidade controlada');
        }
      }
      previousPhysicalByType.set(item.activityType, item);
    }
    if (!isPhysical && (day.isNightDuty || day.isLateFinish)) {
      score -= 6;
      cautions.push('atividade cognitiva após jornada noturna deve ser curta e opcional');
    }
    if (day.isDayOff && isPhysical && item.intensity !== 'alta') {
      score += 8;
      reasons.push('folga favorece rotina leve com recuperação preservada');
    }
    score = Math.round(clamp(score, 0, 100));
    suitability = scoreToSuitability(score);
    return {
      ...item,
      score,
      suitability,
      confidence,
      reason: reasons.slice(0, 4).join(' · '),
      caution: cautions.filter(Boolean).slice(0, 4).join(' · '),
      protectedWindow: true,
    };
  });
}

function buildRestRecoverySuggestions(days: DayLoadAnalysis[], usedSlots: Set<string>): RoutineSuggestion[] {
  const output: RoutineSuggestion[] = [];
  days.forEach((day) => {
    const needsRest = day.fatigueScore >= 58 || day.isLateFinish || day.isNightDuty || (day.restBefore !== null && day.restBefore < 14) || (day.restAfter !== null && day.restAfter < 14);
    if (!needsRest) return;
    const restActivity: RoutineActivityConfig = {
      id: 'descanso-recuperacao',
      type: 'personalizado',
      name: 'Descanso / recuperação',
      durationMinutes: day.isNightDuty || day.isLateFinish ? 120 : 90,
      intensity: 'baixa',
      frequencyPerWeek: 7,
      preferredPeriod: day.isEarlyStart ? 'tarde' : day.isLateFinish || day.isNightDuty ? 'manha' : 'noite',
    };
    const slot = pickTimeSlot(day, restActivity, usedSlots);
    if (!slot) return;
    if (!isRoutineSlotAvailable(usedSlots, day.date, slot.startTime, restActivity.durationMinutes)) return;
    reserveRoutineSlot(usedSlots, day.date, slot.startTime, restActivity.durationMinutes);
    output.push({
      id: `descanso-${day.date}-${slot.startTime}`,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      activityName: 'Descanso / recuperação',
      activityType: 'personalizado',
      durationMinutes: restActivity.durationMinutes,
      startTime: slot.startTime,
      endTime: addMinutes(slot.startTime, restActivity.durationMinutes),
      intensity: 'baixa',
      score: Math.max(62, 100 - day.fatigueScore),
      suitability: day.fatigueScore >= 72 ? 'ideal' : 'boa',
      confidence: day.type === 'OTHER' ? 'media' : 'alta',
      reason: `proteção de sono/recuperação · ${slot.strategy}`,
      caution: [slot.caution, 'Priorize sono, hidratação e alimentação; evite treino intenso quando houver repouso curto.'].filter(Boolean).join(' · '),
      dayLabel: day.label,
      category: 'recovery',
      protectedWindow: true,
    });
  });
  return output;
}


function buildMealPolicySuggestions(days: DayLoadAnalysis[], usedSlots: Set<string>): RoutineSuggestion[] {
  const output: RoutineSuggestion[] = [];
  days.forEach((day) => {
    const dutyWindows = getPerDiemEligibleDutyWindows(day);
    for (const meal of CREWCHECK_MEAL_WINDOWS) {
      const mealStart = timeToMinutes(meal.startTime);
      const mealEndRaw = timeToMinutes(meal.endTime);
      const mealEnd = meal.id === 'supper' && mealEndRaw <= mealStart ? mealEndRaw + 24 * 60 : mealEndRaw;
      const overlaps = dutyWindows.some((window) => {
        if (!isDutyWindowEligibleForMeal(window, meal.id)) return false;
        return windowHasMealOverlap(window, mealStart, mealEnd, meal.id === 'supper');
      });
      if (!overlaps) continue;
      const durationMinutes = Math.max(15, (mealEnd - mealStart) % (24 * 60) || 60);
      const id = `alimentacao-${meal.id}-${day.date}`;
      if (!isRoutineSlotAvailable(usedSlots, day.date, meal.startTime, Math.min(durationMinutes, 180))) continue;
      reserveRoutineSlot(usedSlots, day.date, meal.startTime, Math.min(durationMinutes, 180));
      output.push({
        id,
        date: day.date,
        dayOfWeek: day.dayOfWeek,
        activityName: meal.name,
        activityType: 'personalizado',
        durationMinutes,
        startTime: meal.startTime,
        endTime: meal.endTime,
        intensity: 'baixa',
        score: 100,
        suitability: 'ideal',
        confidence: 'alta',
        reason: meal.id === 'supper'
          ? 'Ceia somente por voo ou reserva ativa dentro da janela 00:00–01:00. Sobreaviso puro e pernoite sem trabalho não contam.'
          : `${meal.name} somente quando a atividade efetiva cruza a janela ${meal.startTime}–${meal.endTime}.`,
        caution: meal.allowanceRule,
        dayLabel: day.label,
        category: 'meal',
        protectedWindow: true,
      });
    }
  });
  return output;
}

type PerDiemSource = 'duty' | 'flight' | 'standby' | 'reserve' | 'training' | 'raw';
type PerDiemDutyWindow = { start: number; end: number; label: string; source: PerDiemSource };

function getPerDiemEligibleDutyWindows(day: DayLoadAnalysis): PerDiemDutyWindow[] {
  const raw = Array.isArray(day.blockedWindows) && day.blockedWindows.length
    ? day.blockedWindows
    : day.dutyStartTime && day.dutyEndTime
      ? [{ startTime: day.dutyStartTime, endTime: day.dutyEndTime, isNextDay: day.isDutyNextDay, label: day.label, source: day.type === 'ASB' ? 'reserve' as const : day.type === 'HSB' || day.type === 'HSBE' ? 'standby' as const : day.type === 'VOO' ? 'flight' as const : day.type === 'CRM' ? 'training' as const : 'duty' as const }]
      : [];
  return raw
    .map((item) => {
      const start = timeToMinutesOrNull(item.startTime);
      const endRaw = timeToMinutesOrNull(item.endTime);
      if (start === null || endRaw === null) return null;
      let end = endRaw;
      if (item.isNextDay || end <= start) end += 24 * 60;
      return { start, end, label: item.label || day.label || 'programação', source: (item.source || 'duty') as PerDiemSource };
    })
    .filter((item): item is PerDiemDutyWindow => Boolean(item && item.end > item.start));
}

function isDutyWindowEligibleForMeal(window: PerDiemDutyWindow, mealId: MealWindowId): boolean {
  const source = String(window.source || '').toLowerCase();
  const label = String(window.label || '').toUpperCase();
  const isStandby = source === 'standby' || /\bHSBE?\b|SOBREAVISO|HOME STAND/.test(label);
  const isReserve = source === 'reserve' || /\bASB\b|\bRES\b|RESERVA|AIRPORT STAND/.test(label);
  const isFlight = source === 'flight' || /\bLA\s?\d{3,4}\b|VOO|FLIGHT/.test(label);
  const isTraining = source === 'training' || /TREIN|TRAIN|CHECK|C32F|CBF|EMER|CRM|\bMT\b/.test(label);
  if (isStandby && !isReserve && !isFlight) return false;
  if (mealId === 'supper') return isFlight || isReserve;
  return isFlight || isReserve || isTraining || source === 'duty' || source === 'raw';
}

function windowHasMealOverlap(window: PerDiemDutyWindow, mealStart: number, mealEnd: number, isSupper: boolean): boolean {
  const candidates = [{ start: window.start, end: window.end }];
  if (isSupper) {
    // A ceia é estrita: só entra se voo/reserva estiver efetivamente ativo em 00:00–01:00.
    // Uma janela encerrada em 23:55/23:59 não cruza 00:00 e, portanto, não paga ceia.
    candidates.push({ start: window.start - 24 * 60, end: window.end - 24 * 60 });
  }
  return candidates.some((candidate) => windowsOverlapWithOvernight(mealStart, mealEnd, candidate.start, candidate.end));
}

function getDeclaredDutyWindows(day: DayLoadAnalysis): Array<{ start: number; end: number; label: string }> {
  // Mantido para compatibilidade com rotinas; para diárias use getPerDiemEligibleDutyWindows.
  const declaredWindows = Array.isArray(day.blockedWindows) ? day.blockedWindows : [];
  const raw = declaredWindows.length
    ? declaredWindows
    : day.dutyStartTime && day.dutyEndTime
      ? [{ startTime: day.dutyStartTime, endTime: day.dutyEndTime, isNextDay: day.isDutyNextDay, label: day.label, source: 'duty' as const }]
      : [];
  return raw
    .map((item) => {
      const start = timeToMinutesOrNull(item.startTime);
      const endRaw = timeToMinutesOrNull(item.endTime);
      if (start === null || endRaw === null) return null;
      let end = endRaw;
      if (item.isNextDay || end <= start) end += 24 * 60;
      return { start, end, label: item.label || 'programação' };
    })
    .filter((item): item is { start: number; end: number; label: string } => Boolean(item && item.end > item.start));
}

function windowsOverlapWithOvernight(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function splitDaysByRosterWeek(days: DayLoadAnalysis[]): DayLoadAnalysis[][] {
  const weeks: DayLoadAnalysis[][] = [];
  let current: DayLoadAnalysis[] = [];
  days.forEach((day, index) => {
    const date = parseRosterDate(day.date);
    const startsNewWeek = index > 0 && date.getDay() === 1;
    if (startsNewWeek && current.length) {
      weeks.push(current);
      current = [];
    }
    current.push(day);
  });
  if (current.length) weeks.push(current);
  return weeks;
}

function scoreDayForActivity(day: DayLoadAnalysis, activity: RoutineActivityConfig, previous: DayLoadAnalysis | null, next: DayLoadAnalysis | null) {
  const demand = activityDemand(activity);
  let score = 48;
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (day.isDayOff) {
    score += 30;
    reasons.push('dia de recuperação/folga');
  }
  if (day.type === 'LAYOVER') {
    score += isPhysicalActivity(activity.type) ? 22 : 26;
    reasons.push('inativo/pernoite com janela boa para encaixar rotina');
  }
  if (day.type === 'OTHER') {
    score -= 18;
    cautions.push('dia sem programação lida com alta confiança');
  }
  if (day.fatigueScore >= 70) {
    score -= demand.high * 0.38;
    cautions.push('dia operacional pesado');
  } else if (day.fatigueScore >= 45) {
    score -= demand.high * 0.18;
  } else {
    score += 12;
    reasons.push('carga leve permite encaixar atividade');
  }
  if (!day.isDayOff && day.type !== 'LAYOVER' && day.dutyHours > 0 && day.dutyHours <= 4 && activity.durationMinutes <= 120) {
    score += 16;
    reasons.push('programação curta com janela útil no mesmo dia');
  }
  if (!day.isDayOff && day.type !== 'LAYOVER' && day.dutyHours > 4 && day.dutyHours <= 7 && activity.durationMinutes <= 60 && activity.intensity !== 'alta') {
    score += 8;
    reasons.push('atividade curta cabe em dia operacional moderado');
  }
  if (day.isNightDuty || day.isLateFinish) {
    score -= demand.sleep * 0.35;
    cautions.push('término tarde/madrugada: proteger sono');
  }
  if (day.isEarlyStart) {
    score -= demand.sleep * 0.22;
    cautions.push('apresentação cedo');
  }
  if (day.restBefore !== null && day.restBefore < 14) {
    score -= demand.sleep * 0.28;
    cautions.push(`repouso anterior curto (${day.restBefore}h)`);
  }
  if (day.restAfter !== null && day.restAfter < 14) {
    score -= demand.sleep * 0.38;
    cautions.push(`repouso posterior justo (${day.restAfter}h)`);
  }
  if (previous && previous.fatigueScore >= 70) {
    score -= demand.high * 0.2;
    cautions.push('vem de dia pesado');
  }
  if (next && next.fatigueScore >= 70) {
    score -= demand.high * 0.24;
    cautions.push('próximo dia é pesado');
  }
  if (activity.durationMinutes >= 120 && !day.isDayOff && day.type !== 'LAYOVER' && day.dutyHours > 4) {
    score -= 20;
    cautions.push('atividade longa em dia operacional');
  }
  if (!isPhysicalActivity(activity.type)) {
    score += day.isDayOff ? -5 : 8;
    if (day.isLateFinish || day.isNightDuty) score -= 10;
    reasons.push('atividade cognitiva pode caber em janela leve');
  }
  if (activity.type === 'crossfit' && !day.isDayOff) {
    score -= 25;
    cautions.push('crossfit exige margem alta de recuperação');
  }
  if (activity.type === 'caminhada') {
    score += 10;
    reasons.push('baixo impacto e boa opção de recuperação ativa');
  }

  score = Math.round(clamp(score, 0, 100));
  const confidence: RoutineSuggestion['confidence'] = day.type === 'OTHER' ? 'baixa' : day.type === 'LAYOVER' ? 'media' : 'alta';
  return {
    day,
    score,
    confidence,
    reason: reasons.length ? reasons.slice(0, 3).join(' · ') : 'janela compatível com a carga do dia',
    caution: cautions.length ? cautions.slice(0, 3).join(' · ') : 'manter hidratação, alimentação e margem para deslocamento/sono',
  };
}

function activityDemand(activity: RoutineActivityConfig) {
  let high = 35;
  let sleep = 30;
  if (activity.intensity === 'alta') { high += 35; sleep += 25; }
  if (activity.intensity === 'moderada') { high += 16; sleep += 12; }
  if (activity.durationMinutes >= 90) { high += 12; sleep += 8; }
  if (activity.durationMinutes >= 120) { high += 15; sleep += 12; }
  if (activity.type === 'crossfit') { high += 24; sleep += 16; }
  if (activity.type === 'corrida') { high += 14; sleep += 8; }
  if (activity.type === 'caminhada') { high -= 18; sleep -= 12; }
  if (!isPhysicalActivity(activity.type)) { high -= 16; sleep += 8; }
  return { high: clamp(high, 10, 100), sleep: clamp(sleep, 10, 100) };
}

type RoutineTimeSlot = {
  startTime: string;
  strategy: string;
  caution?: string;
};

function pickTimeSlot(day: DayLoadAnalysis, activity: RoutineActivityConfig, usedSlots: Set<string>): RoutineTimeSlot | null {
  const candidates = buildSafeCandidateTimes(day, activity);
  for (const slot of candidates) {
    if (isRoutineSlotAvailable(usedSlots, day.date, slot.startTime, activity.durationMinutes)) return slot;
  }
  return null;
}

function isRoutineSlotAvailable(usedSlots: Set<string>, date: string, startTime: string, durationMinutes: number): boolean {
  const start = timeToMinutes(startTime);
  const end = start + Math.max(15, Number(durationMinutes) || 60);
  for (let minute = roundDownToStep(start, ROUTINE_SLOT_STEP); minute < end; minute += ROUTINE_SLOT_STEP) {
    if (usedSlots.has(`${date}-${Math.floor(minute / ROUTINE_SLOT_STEP)}`)) return false;
  }
  return true;
}

function reserveRoutineSlot(usedSlots: Set<string>, date: string, startTime: string, durationMinutes: number): void {
  const start = timeToMinutes(startTime);
  const end = start + Math.max(15, Number(durationMinutes) || 60);
  for (let minute = roundDownToStep(start, ROUTINE_SLOT_STEP); minute < end; minute += ROUTINE_SLOT_STEP) {
    usedSlots.add(`${date}-${Math.floor(minute / ROUTINE_SLOT_STEP)}`);
  }
}

function buildSafeCandidateTimes(day: DayLoadAnalysis, activity: RoutineActivityConfig): RoutineTimeSlot[] {
  const duration = Math.max(15, Math.min(240, Number(activity.durationMinutes) || 60));
  const blocked = getBlockedWindows(day, activity);
  const commercialWindows = getCommercialRoutineWindows(activity.preferredPeriod);
  const available = subtractBlockedWindows(commercialWindows, blocked, duration);
  const preferredCandidates = candidateTimes(day, activity);
  const gridCandidates = buildPeriodGrid(activity.preferredPeriod);
  const rawCandidates = uniqueTimes([...preferredCandidates, ...gridCandidates]);
  const safe: RoutineTimeSlot[] = [];

  // Primeiro tenta candidatos naturais dentro de janelas realmente livres.
  for (const time of rawCandidates) {
    const start = timeToMinutes(time);
    const end = start + duration;
    const interval = available.find((item) => start >= item.start && end <= item.end);
    if (!interval) continue;
    if (!isReasonableRoutineWindow(start, end)) continue;
    if (blocked.some((window) => windowsOverlap(start, end, window.start, window.end))) continue;
    safe.push({
      startTime: time,
      strategy: describeSlotStrategy(start, blocked),
      caution: makeTimingCaution(day),
    });
  }

  // Depois cria horários premium encaixados imediatamente antes/depois das programações,
  // mas só quando couberem por inteiro dentro do horário útil e sem encostar na escala.
  for (const window of blocked) {
    const beforeEnd = Math.min(window.start, ROUTINE_DAY_END) - getRoutineTransitionBuffer(activity);
    const beforeStart = beforeEnd - duration;
    if (fitsAnyAvailableWindow(beforeStart, beforeEnd, available) && isReasonableRoutineWindow(beforeStart, beforeEnd)) {
      safe.push({
        startTime: minutesToTime(roundDownToStep(beforeStart, 15)),
        strategy: 'antes da programação, com margem de segurança',
        caution: makeTimingCaution(day),
      });
    }

    const afterStart = roundUpToStep(Math.max(window.end, ROUTINE_DAY_START) + getRoutineTransitionBuffer(activity), 15);
    const afterEnd = afterStart + duration;
    if (fitsAnyAvailableWindow(afterStart, afterEnd, available) && isReasonableRoutineWindow(afterStart, afterEnd)) {
      safe.push({
        startTime: minutesToTime(afterStart),
        strategy: 'depois da programação, sem choque de horário',
        caution: makeTimingCaution(day),
      });
    }
  }

  // Por fim, se ainda não houver opção, usa o melhor começo de cada janela livre.
  for (const interval of available) {
    const start = roundUpToStep(interval.start, 15);
    const end = start + duration;
    if (end <= interval.end && isReasonableRoutineWindow(start, end)) {
      safe.push({
        startTime: minutesToTime(start),
        strategy: blocked.length ? 'janela livre entre programações' : 'em dia sem programação bloqueada',
        caution: makeTimingCaution(day),
      });
    }
  }

  return dedupeSlots(safe)
    .filter((slot) => {
      const start = timeToMinutes(slot.startTime);
      const end = start + duration;
      return fitsAnyAvailableWindow(start, end, available) && !blocked.some((window) => windowsOverlap(start, end, window.start, window.end));
    })
    .sort((a, b) => slotScore(a, day, activity) - slotScore(b, day, activity));
}

const ROUTINE_DAY_START = 6 * 60;
const ROUTINE_DAY_END = 21 * 60 + 30;

function getCommercialRoutineWindows(period: RoutinePeriod): Array<{ start: number; end: number; label: string }> {
  const ranges: Record<RoutinePeriod, Array<[number, number, string]>> = {
    manha: [[8 * 60 + 15, 11 * 60, 'manhã útil após café']],
    tarde: [[13 * 60 + 15, 18 * 60 + 30, 'tarde útil após almoço']],
    noite: [[20 * 60 + 15, ROUTINE_DAY_END, 'noite útil após jantar']],
    qualquer: [[8 * 60 + 15, 11 * 60, 'manhã útil após café'], [13 * 60 + 15, 18 * 60 + 30, 'tarde útil após almoço'], [20 * 60 + 15, ROUTINE_DAY_END, 'noite útil após jantar']],
  };
  return (ranges[period] || ranges.qualquer).map(([start, end, label]) => ({ start, end, label }));
}

function getRoutineTransitionBuffer(activity: RoutineActivityConfig): number {
  if (activity.intensity === 'alta') return 60;
  if (activity.durationMinutes >= 90) return 45;
  if (!isPhysicalActivity(activity.type)) return ROUTINE_MIN_SLEEP_BUFFER_MINUTES / 3;
  return 30;
}

function subtractBlockedWindows(commercialWindows: Array<{ start: number; end: number; label: string }>, blocked: { start: number; end: number; label: string }[], duration: number): Array<{ start: number; end: number; label: string }> {
  let free = commercialWindows.map((item) => ({ ...item }));
  for (const block of blocked) {
    const next: Array<{ start: number; end: number; label: string }> = [];
    for (const slot of free) {
      if (!windowsOverlap(slot.start, slot.end, block.start, block.end)) {
        next.push(slot);
        continue;
      }
      if (block.start > slot.start) next.push({ start: slot.start, end: Math.min(block.start, slot.end), label: slot.label });
      if (block.end < slot.end) next.push({ start: Math.max(block.end, slot.start), end: slot.end, label: slot.label });
    }
    free = next;
  }
  return free
    .map((item) => ({ start: Math.max(ROUTINE_DAY_START, item.start), end: Math.min(ROUTINE_DAY_END, item.end), label: item.label }))
    .filter((item) => item.end - item.start >= duration);
}

function fitsAnyAvailableWindow(start: number, end: number, available: Array<{ start: number; end: number }>): boolean {
  return available.some((item) => start >= item.start && end <= item.end);
}

function candidateTimes(day: DayLoadAnalysis, activity: RoutineActivityConfig): string[] {
  const byPeriod: Record<RoutinePeriod, string[]> = {
    manha: ['06:30', '07:30', '08:30', '09:30', '10:30'],
    tarde: ['12:30', '13:30', '14:30', '15:30', '16:30', '17:30'],
    noite: ['18:15', '19:00', '20:00'],
    qualquer: ['06:30', '07:30', '09:00', '10:30', '12:30', '13:30', '15:00', '16:30', '18:30', '19:30'],
  };
  let candidates = byPeriod[activity.preferredPeriod] || byPeriod.qualquer;
  if (day.isEarlyStart) candidates = ['13:30', '14:30', '15:30', '16:30', '18:30'];
  if (day.isLateFinish || day.isNightDuty) candidates = isPhysicalActivity(activity.type) ? ['09:30', '10:30', '13:30', '14:30'] : ['10:00', '13:30', '15:00', '16:00'];
  if (day.dutyHours > 0 && day.dutyHours <= 4 && !day.isLateFinish && !day.isNightDuty) candidates = activity.preferredPeriod === 'manha' ? ['06:30', '07:30', '08:30'] : ['12:30', '13:30', '14:30', '16:30', '18:30'];
  if (day.isDayOff) candidates = activity.preferredPeriod === 'noite' ? ['18:00', '19:00'] : activity.preferredPeriod === 'tarde' ? ['13:30', '15:00', '16:30'] : ['07:30', '09:00', '10:30', '15:00'];
  if (day.type === 'LAYOVER') candidates = activity.preferredPeriod === 'manha' ? ['08:30', '09:30', '10:30'] : ['10:00', '13:30', '15:00', '17:30'];
  return candidates;
}

function getBlockedWindows(day: DayLoadAnalysis, activity: RoutineActivityConfig): { start: number; end: number; label: string }[] {
  const declaredWindows = Array.isArray(day.blockedWindows) ? day.blockedWindows : [];
  const rawWindows = declaredWindows.length
    ? declaredWindows.map((item) => ({
        startTime: item.startTime,
        endTime: item.endTime,
        isNextDay: Boolean(item.isNextDay),
        label: item.label || 'programação',
        source: item.source,
      }))
    : [{
        startTime: day.dutyStartTime || '',
        endTime: day.dutyEndTime || '',
        isNextDay: Boolean(day.isDutyNextDay),
        label: ['HSB', 'HSBE', 'ASB', 'RES'].includes(String(day.type || '').toUpperCase()) ? 'sobreaviso/reserva' : day.type === 'VOO' ? 'voo' : 'programação',
        source: 'duty' as const,
      }];

  const extra = activity.intensity === 'alta' ? 45 : activity.durationMinutes >= 90 ? 30 : 15;
  const output: { start: number; end: number; label: string }[] = [];

  for (const item of rawWindows) {
    const start = timeToMinutesOrNull(item.startTime);
    const endRaw = timeToMinutesOrNull(item.endTime);
    if (start === null || endRaw === null) continue;

    const labelLower = String(item.label || '').toLowerCase();
    const type = String(day.type || '').toUpperCase();
    const source = String(item.source || '').toLowerCase();
    const isStandbyOrReserve = /sobreaviso|reserva|standby|asb|hsb|res/.test(labelLower) || ['HSB', 'HSBE', 'ASB', 'RES'].includes(type) || source === 'standby' || source === 'reserve';
    const isFlight = /voo|flight/.test(labelLower) || day.type === 'VOO' || source === 'flight';
    const isTraining = /treinamento|check|simulator|ground/.test(labelLower) || source === 'training';
    const beforeBuffer = isStandbyOrReserve ? 90 : isFlight ? 100 : isTraining ? 60 : 60;
    const afterBuffer = isStandbyOrReserve ? 75 : isFlight ? 100 : isTraining ? 60 : 60;
    let end = endRaw;
    if (item.isNextDay || end <= start) end = 24 * 60;

    output.push({
      start: Math.max(0, start - beforeBuffer - extra),
      end: Math.min(24 * 60, end + afterBuffer + extra),
      label: item.label || 'programação',
    });
  }

  for (const meal of CREWCHECK_MEAL_WINDOWS) {
    const start = timeToMinutes(meal.startTime);
    const endRaw = timeToMinutes(meal.endTime);
    const end = meal.id === 'supper' && endRaw <= start ? endRaw + 24 * 60 : endRaw;
    output.push({
      start: Math.max(0, start - 10),
      end: Math.min(24 * 60, end + 10),
      label: meal.protectedLabel,
    });
  }

  return mergeBlockedWindows(output);
}

function mergeBlockedWindows(windows: { start: number; end: number; label: string }[]): { start: number; end: number; label: string }[] {
  const sorted = windows
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number; label: string }[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
      if (!last.label.includes(window.label)) last.label = `${last.label}/${window.label}`;
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

function buildPeriodGrid(period: RoutinePeriod): string[] {
  const ranges: Record<RoutinePeriod, Array<[number, number]>> = {
    manha: [[6 * 60, 11 * 60]],
    tarde: [[12 * 60 + 30, 18 * 60]],
    noite: [[18 * 60, 21 * 60]],
    qualquer: [[6 * 60 + 30, 11 * 60], [12 * 60, 18 * 60], [18 * 60, 21 * 60]],
  };
  const output: string[] = [];
  for (const [start, end] of ranges[period] || ranges.qualquer) {
    for (let minute = start; minute <= end; minute += 30) output.push(minutesToTime(minute));
  }
  return output;
}

function describeSlotStrategy(start: number, blocked: { start: number; end: number; label: string }[]): string {
  if (!blocked.length) return 'em dia sem programação bloqueada pela escala';
  const before = blocked.find((item) => start < item.start);
  const after = [...blocked].reverse().find((item) => start >= item.end);
  if (before) return `antes de ${before.label}`;
  if (after) return `após ${after.label}`;
  return 'janela livre entre programações';
}

function makeTimingCaution(day: DayLoadAnalysis): string {
  const windows = Array.isArray(day.blockedWindows) && day.blockedWindows.length
    ? day.blockedWindows.map((item) => `${item.label}: ${item.startTime}–${item.endTime}${item.isNextDay ? ' (+1)' : ''}`).join(' · ')
    : `${day.dutyStartTime || '--:--'}–${day.dutyEndTime || '--:--'}${day.isDutyNextDay ? ' (+1)' : ''}`;
  return `Janelas bloqueadas consideradas: ${windows}. Sugestão gerada somente em horário útil e sem choque com voo, reserva, sobreaviso ou treinamento.`;
}

function isReasonableRoutineWindow(start: number, end: number): boolean {
  return start >= ROUTINE_DAY_START && end <= ROUTINE_DAY_END && end > start;
}

function windowsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function timeToMinutesOrNull(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.replace('(+1)', '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function timeToMinutes(time: string): number {
  return timeToMinutesOrNull(time) ?? 0;
}

function minutesToTime(total: number): string {
  const dayMinutes = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(dayMinutes / 60)).padStart(2, '0')}:${String(dayMinutes % 60).padStart(2, '0')}`;
}

function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function uniqueTimes(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function dedupeSlots(slots: RoutineTimeSlot[]): RoutineTimeSlot[] {
  const seen = new Set<string>();
  const output: RoutineTimeSlot[] = [];
  for (const slot of slots) {
    if (seen.has(slot.startTime)) continue;
    seen.add(slot.startTime);
    output.push(slot);
  }
  return output;
}

function slotScore(slot: RoutineTimeSlot, day: DayLoadAnalysis, activity: RoutineActivityConfig): number {
  const start = timeToMinutes(slot.startTime);
  const targets: Record<RoutinePeriod, number> = { manha: 9 * 60, tarde: 15 * 60, noite: 19 * 60, qualquer: 15 * 60 };
  let score = Math.abs(start - (targets[activity.preferredPeriod] || targets.qualquer));
  if (day.isLateFinish || day.isNightDuty) score += start < 10 * 60 ? 80 : 0;
  if (day.isEarlyStart) score += start < 15 * 60 ? 90 : 0;
  if (activity.intensity === 'alta' && start >= 20 * 60) score += 90;
  return score;
}

function scoreToSuitability(score: number): RoutineSuggestion['suitability'] {
  if (score >= 78) return 'ideal';
  if (score >= 62) return 'boa';
  if (score >= 42) return 'moderada';
  return 'evitar';
}

export function isPhysicalActivity(type: RoutineActivityType): boolean {
  return ['musculacao', 'corrida', 'caminhada', 'crossfit', 'personalizado'].includes(type);
}

export function isRecoverySuggestion(item: RoutineSuggestion): boolean {
  return item.category === 'recovery';
}

export function isMealSuggestion(item: RoutineSuggestion): boolean {
  return item.category === 'meal';
}

export function isRoutineActivitySuggestion(item: RoutineSuggestion): boolean {
  return item.category === 'routine';
}

function parseRosterDate(value: string): Date {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const dayMinutes = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(dayMinutes / 60)).padStart(2, '0')}:${String(dayMinutes % 60).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
