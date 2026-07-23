export type LifePeriod = 'auto' | 'manha' | 'tarde' | 'noite' | 'qualquer';
export type LifeFlexibility = 'flexivel' | 'equilibrado' | 'estruturado';
export type LifeCoachTone = 'acolhedor' | 'direto' | 'discreto';
export type LifeEventType = 'hydration' | 'study' | 'exercise' | 'leisure' | 'gym_checkin' | 'sleep' | 'recommendation_feedback';
export type LifeEventStatus = 'completed' | 'skipped' | 'planned';

export type LifeEvent = {
  id: string;
  type: LifeEventType;
  occurredAt: string;
  endedAt?: string;
  durationMinutes?: number;
  amount?: number;
  status: LifeEventStatus;
  rating?: number;
  source: 'manual' | 'health-connect' | 'crewcheck' | 'gym-checkin';
  note?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type LifeAdaptivePreferences = {
  version: 1;
  hydrationTargetMl: number;
  hydrationPortionMl: number;
  workoutFrequencyPerWeek: number;
  studyFrequencyPerWeek: number;
  leisureFrequencyPerWeek: number;
  preferredExercisePeriod: LifePeriod;
  preferredStudyPeriod: LifePeriod;
  preferredLeisurePeriod: LifePeriod;
  flexibility: LifeFlexibility;
  coachTone: LifeCoachTone;
  shareGymCheckins: boolean;
  remindersEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  updatedAt: string;
};

export type LifeHealthSnapshot = {
  capturedAt: string;
  sleepMinutes?: number;
  sleepStart?: string;
  sleepEnd?: string;
  sleepSource?: string;
  steps?: number;
  distanceMeters?: number;
  activityMinutes?: number;
  restingHeartRateAverage?: number;
  periodDays?: number;
  source: 'health-connect' | 'manual';
};

export type LifeRoutineContext = {
  capturedAt: string;
  freshness: 'fresh' | 'stale' | 'unavailable';
  learningLevel: 'iniciando' | 'adaptando' | 'personalizado';
  observations: number;
  sleep: {
    available: boolean;
    latestMinutes: number;
    targetMinutes: number;
    deficitMinutes: number;
    source?: string;
  };
  movement: {
    steps: number;
    distanceMeters: number;
  };
  exercise: {
    minutesPeriod: number;
    sessions7Days: number;
    targetSessions: number;
    preferredPeriod: Exclude<LifePeriod, 'auto'>;
    goalReached: boolean;
    lastSessionAt?: string;
  };
  study: {
    minutes7Days: number;
    sessions7Days: number;
    targetSessions: number;
    preferredPeriod: Exclude<LifePeriod, 'auto'>;
  };
  hydration: {
    mlToday: number;
    targetMl: number;
    progress: number;
  };
  leisure: {
    minutes7Days: number;
    sessions7Days: number;
    targetSessions: number;
    preferredPeriod: Exclude<LifePeriod, 'auto'>;
  };
  coaching: {
    flexibility: LifeFlexibility;
    tone: LifeCoachTone;
    remindersEnabled: boolean;
  };
};

export type LifeConciergeRecommendation = {
  id: string;
  category: 'rest' | 'hydration' | 'exercise' | 'study' | 'leisure' | 'balance' | 'calibration';
  title: string;
  body: string;
  actionLabel: string;
  confidence: 'baixa' | 'media' | 'alta';
  reasons: string[];
};

const KEYS = {
  preferences: 'crewcheck:life:adaptive-preferences:v1',
  events: 'crewcheck:life:adaptive-events:v1',
  healthHistory: 'crewcheck:life:health-history:v1',
  goals: 'crewcheck:life:goals:v1',
  activeSession: 'crewcheck:life:active-session:v1',
  nativeSummary: 'crewcheck:life:health-summary:v1',
  profile: 'crewcheck:life:profile:v1',
};

const DEFAULT_PREFERENCES: LifeAdaptivePreferences = {
  version: 1,
  hydrationTargetMl: 2000,
  hydrationPortionMl: 250,
  workoutFrequencyPerWeek: 3,
  studyFrequencyPerWeek: 3,
  leisureFrequencyPerWeek: 2,
  preferredExercisePeriod: 'auto',
  preferredStudyPeriod: 'auto',
  preferredLeisurePeriod: 'auto',
  flexibility: 'flexivel',
  coachTone: 'acolhedor',
  shareGymCheckins: true,
  remindersEnabled: false,
  quietStart: '22:30',
  quietEnd: '07:00',
  updatedAt: '',
};

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback as any, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key } }));
  } catch {}
}

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  } catch {}
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function validDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date = new Date()): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function daysAgo(days: number, now = new Date()): number {
  return now.getTime() - days * 86_400_000;
}

function normalizePeriod(value: LifePeriod | undefined, fallback: Exclude<LifePeriod, 'auto'>): Exclude<LifePeriod, 'auto'> {
  return value && value !== 'auto' ? value : fallback;
}

function periodForDate(value: string | Date): Exclude<LifePeriod, 'auto'> {
  const date = value instanceof Date ? value : new Date(value);
  const hour = Number.isNaN(date.getTime()) ? 12 : date.getHours();
  if (hour >= 5 && hour < 12) return 'manha';
  if (hour >= 12 && hour < 18) return 'tarde';
  if (hour >= 18 || hour < 5) return 'noite';
  return 'qualquer';
}

function weightedPreferredPeriod(events: LifeEvent[], type: LifeEventType, fallback: Exclude<LifePeriod, 'auto'>): Exclude<LifePeriod, 'auto'> {
  const now = Date.now();
  const scores: Record<Exclude<LifePeriod, 'auto'>, number> = { manha: 0, tarde: 0, noite: 0, qualquer: 0 };
  events.filter((event) => event.type === type && event.status === 'completed').forEach((event) => {
    const date = validDate(event.occurredAt);
    if (!date) return;
    const ageDays = Math.max(0, (now - date.getTime()) / 86_400_000);
    const recency = ageDays <= 7 ? 1.5 : ageDays <= 30 ? 1 : 0.55;
    const rating = event.rating ? clamp(event.rating / 3, 0.5, 1.7) : 1;
    scores[periodForDate(date)] += recency * rating;
  });
  const ranked = (Object.entries(scores) as Array<[Exclude<LifePeriod, 'auto'>, number]>).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[1] > 0 ? ranked[0][0] : fallback;
}

function parseHealthSnapshot(value: any, source: LifeHealthSnapshot['source']): LifeHealthSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const capturedAt = validDate(value.capturedAt || value.updatedAt)?.toISOString();
  if (!capturedAt) return null;
  return {
    capturedAt,
    sleepMinutes: safeNumber(value.sleepMinutes, safeNumber(value.sleepHours) * 60) || undefined,
    sleepStart: validDate(value.sleepStart)?.toISOString(),
    sleepEnd: validDate(value.sleepEnd)?.toISOString(),
    sleepSource: String(value.sleepSource || '').trim() || undefined,
    steps: safeNumber(value.steps) || undefined,
    distanceMeters: safeNumber(value.distanceMeters) || undefined,
    activityMinutes: safeNumber(value.activityMinutes) || undefined,
    restingHeartRateAverage: safeNumber(value.restingHeartRateAverage) || undefined,
    periodDays: clamp(Math.round(safeNumber(value.periodDays, 7)), 1, 30),
    source,
  };
}

export function getLifeAdaptivePreferences(): LifeAdaptivePreferences {
  const stored = readJson(KEYS.preferences, DEFAULT_PREFERENCES);
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    hydrationTargetMl: clamp(Math.round(safeNumber(stored.hydrationTargetMl, 2000)), 250, 8000),
    hydrationPortionMl: clamp(Math.round(safeNumber(stored.hydrationPortionMl, 250)), 50, 1000),
    workoutFrequencyPerWeek: clamp(Math.round(safeNumber(stored.workoutFrequencyPerWeek, 3)), 1, 7),
    studyFrequencyPerWeek: clamp(Math.round(safeNumber(stored.studyFrequencyPerWeek, 3)), 0, 7),
    leisureFrequencyPerWeek: clamp(Math.round(safeNumber(stored.leisureFrequencyPerWeek, 2)), 0, 7),
  };
}

export function saveLifeAdaptivePreferences(value: Partial<LifeAdaptivePreferences>): LifeAdaptivePreferences {
  const next: LifeAdaptivePreferences = {
    ...getLifeAdaptivePreferences(),
    ...value,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  writeJson(KEYS.preferences, next);
  return next;
}

export function saveLifeGoals(value: unknown) {
  if (!value || typeof value !== 'object') return;
  writeJson(KEYS.goals, { ...(value as Record<string, unknown>), updatedAt: new Date().toISOString() });
}

export function listLifeEvents(): LifeEvent[] {
  const raw = readJson<LifeEvent[]>(KEYS.events, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((event) => event && validDate(event.occurredAt)).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function recordLifeEvent(input: Omit<LifeEvent, 'id' | 'occurredAt'> & { id?: string; occurredAt?: string }): LifeEvent {
  const event: LifeEvent = {
    ...input,
    id: input.id || uniqueId(input.type),
    occurredAt: validDate(input.occurredAt)?.toISOString() || new Date().toISOString(),
    durationMinutes: input.durationMinutes === undefined ? undefined : clamp(Math.round(safeNumber(input.durationMinutes)), 0, 1440),
    amount: input.amount === undefined ? undefined : Math.max(0, Math.round(safeNumber(input.amount))),
    rating: input.rating === undefined ? undefined : clamp(Math.round(safeNumber(input.rating)), 1, 5),
  };
  const cutoff = daysAgo(90);
  const next = [event, ...listLifeEvents().filter((item) => new Date(item.occurredAt).getTime() >= cutoff && item.id !== event.id)].slice(0, 1200);
  writeJson(KEYS.events, next);
  return event;
}

export function recordHydration(amountMl?: number): LifeEvent {
  const preferences = getLifeAdaptivePreferences();
  return recordLifeEvent({
    type: 'hydration',
    amount: amountMl || preferences.hydrationPortionMl,
    status: 'completed',
    source: 'manual',
  });
}

export function recordGymCheckIn(gymName = '', share = false): LifeEvent {
  return recordLifeEvent({
    type: 'gym_checkin',
    status: 'completed',
    source: 'gym-checkin',
    note: gymName.trim() || 'Academia',
    metadata: { shared: share },
  });
}

export function startLifeSession(type: 'study' | 'exercise' | 'leisure', note = '') {
  writeJson(KEYS.activeSession, { id: uniqueId(type), type, note, startedAt: new Date().toISOString() });
}

export function getActiveLifeSession(): { id: string; type: 'study' | 'exercise' | 'leisure'; note?: string; startedAt: string } | null {
  const raw = readJson<any>(KEYS.activeSession, null);
  return raw?.id && validDate(raw.startedAt) ? raw : null;
}

export function finishLifeSession(rating?: number): LifeEvent | null {
  const active = getActiveLifeSession();
  if (!active) return null;
  const start = new Date(active.startedAt);
  const end = new Date();
  const event = recordLifeEvent({
    id: active.id,
    type: active.type,
    occurredAt: start.toISOString(),
    endedAt: end.toISOString(),
    durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
    status: 'completed',
    rating,
    source: 'crewcheck',
    note: active.note,
  });
  try { window.localStorage.removeItem(KEYS.activeSession); } catch {}
  window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key: KEYS.activeSession } }));
  return event;
}

export function cancelLifeSession() {
  if (!storageAvailable()) return;
  try { window.localStorage.removeItem(KEYS.activeSession); } catch {}
  window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { key: KEYS.activeSession } }));
}

export function ingestHealthSummary(value: unknown): LifeHealthSnapshot | null {
  const snapshot = parseHealthSnapshot(value, 'health-connect');
  if (!snapshot) return null;
  const cutoff = daysAgo(35);
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  const next = [snapshot, ...(Array.isArray(history) ? history : []).filter((item) => item.capturedAt !== snapshot.capturedAt && new Date(item.capturedAt).getTime() >= cutoff)].slice(0, 120);
  writeJson(KEYS.healthHistory, next);
  return snapshot;
}

export function ingestManualSummary(value: unknown): LifeHealthSnapshot | null {
  const snapshot = parseHealthSnapshot({ ...(value as any), capturedAt: (value as any)?.updatedAt || new Date().toISOString() }, 'manual');
  if (!snapshot) return null;
  const cutoff = daysAgo(35);
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  const next = [snapshot, ...(Array.isArray(history) ? history : []).filter((item) => item.capturedAt !== snapshot.capturedAt && new Date(item.capturedAt).getTime() >= cutoff)].slice(0, 120);
  writeJson(KEYS.healthHistory, next);
  return snapshot;
}

function currentSnapshot(): LifeHealthSnapshot | null {
  const direct = parseHealthSnapshot(readJson<any>(KEYS.nativeSummary, null), 'health-connect');
  if (direct) return direct;
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  return Array.isArray(history) ? history.map((item) => parseHealthSnapshot(item, item.source || 'manual')).find(Boolean) || null : null;
}

function profileTargets() {
  const profile = readJson<any>(KEYS.profile, {});
  const goals = readJson<any>(KEYS.goals, {});
  const merged = { ...profile, ...goals };
  return {
    sleepMinutes: clamp(Math.round(safeNumber(merged.sleepTarget, 7.5) * 60), 60, 720),
    studyMinutes: clamp(Math.round(safeNumber(merged.studyTargetMinutes, 180)), 0, 1440),
    trainingMinutes: clamp(Math.round(safeNumber(merged.trainingTargetMinutes, 150)), 0, 1440),
  };
}

export function getLifeRoutineContext(now = new Date()): LifeRoutineContext {
  const preferences = getLifeAdaptivePreferences();
  const events = listLifeEvents();
  const snapshot = currentSnapshot();
  const targets = profileTargets();
  const sevenDays = daysAgo(7, now);
  const today = startOfDay(now);
  const recent = events.filter((event) => new Date(event.occurredAt).getTime() >= sevenDays && event.status === 'completed');
  const exerciseEvents = recent.filter((event) => event.type === 'exercise' || event.type === 'gym_checkin');
  const studyEvents = recent.filter((event) => event.type === 'study');
  const leisureEvents = recent.filter((event) => event.type === 'leisure');
  const hydrationEvents = events.filter((event) => event.type === 'hydration' && event.status === 'completed' && new Date(event.occurredAt).getTime() >= today);
  const captured = validDate(snapshot?.capturedAt);
  const ageHours = captured ? Math.max(0, (now.getTime() - captured.getTime()) / 3_600_000) : Infinity;
  const freshness: LifeRoutineContext['freshness'] = !captured ? 'unavailable' : ageHours <= 36 ? 'fresh' : ageHours <= 168 ? 'stale' : 'unavailable';
  const observations = events.filter((event) => event.status === 'completed').length + readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []).length;
  const learningLevel: LifeRoutineContext['learningLevel'] = observations >= 24 ? 'personalizado' : observations >= 8 ? 'adaptando' : 'iniciando';
  const latestSleep = Math.max(0, Math.round(safeNumber(snapshot?.sleepMinutes)));
  const exercisePeriod = preferences.preferredExercisePeriod === 'auto'
    ? weightedPreferredPeriod(events, 'exercise', weightedPreferredPeriod(events, 'gym_checkin', 'tarde'))
    : normalizePeriod(preferences.preferredExercisePeriod, 'tarde');
  const studyPeriod = preferences.preferredStudyPeriod === 'auto'
    ? weightedPreferredPeriod(events, 'study', 'noite')
    : normalizePeriod(preferences.preferredStudyPeriod, 'noite');
  const leisurePeriod = preferences.preferredLeisurePeriod === 'auto'
    ? weightedPreferredPeriod(events, 'leisure', 'tarde')
    : normalizePeriod(preferences.preferredLeisurePeriod, 'tarde');
  const exerciseMinutes = Math.max(safeNumber(snapshot?.activityMinutes), exerciseEvents.reduce((sum, event) => sum + safeNumber(event.durationMinutes), 0));
  const hydrationMl = hydrationEvents.reduce((sum, event) => sum + safeNumber(event.amount), 0);
  return {
    capturedAt: captured?.toISOString() || '',
    freshness,
    learningLevel,
    observations,
    sleep: {
      available: latestSleep > 0,
      latestMinutes: latestSleep,
      targetMinutes: targets.sleepMinutes,
      deficitMinutes: latestSleep > 0 ? Math.max(0, targets.sleepMinutes - latestSleep) : 0,
      source: snapshot?.sleepSource,
    },
    movement: {
      steps: Math.max(0, Math.round(safeNumber(snapshot?.steps))),
      distanceMeters: Math.max(0, safeNumber(snapshot?.distanceMeters)),
    },
    exercise: {
      minutesPeriod: Math.max(0, Math.round(exerciseMinutes)),
      sessions7Days: exerciseEvents.length,
      targetSessions: preferences.workoutFrequencyPerWeek,
      preferredPeriod: exercisePeriod,
      goalReached: exerciseEvents.length >= preferences.workoutFrequencyPerWeek,
      lastSessionAt: exerciseEvents[0]?.occurredAt,
    },
    study: {
      minutes7Days: Math.round(studyEvents.reduce((sum, event) => sum + safeNumber(event.durationMinutes), 0)),
      sessions7Days: studyEvents.length,
      targetSessions: preferences.studyFrequencyPerWeek,
      preferredPeriod: studyPeriod,
    },
    hydration: {
      mlToday: Math.round(hydrationMl),
      targetMl: preferences.hydrationTargetMl,
      progress: preferences.hydrationTargetMl > 0 ? clamp(hydrationMl / preferences.hydrationTargetMl, 0, 2) : 0,
    },
    leisure: {
      minutes7Days: Math.round(leisureEvents.reduce((sum, event) => sum + safeNumber(event.durationMinutes), 0)),
      sessions7Days: leisureEvents.length,
      targetSessions: preferences.leisureFrequencyPerWeek,
      preferredPeriod: leisurePeriod,
    },
    coaching: {
      flexibility: preferences.flexibility,
      tone: preferences.coachTone,
      remindersEnabled: preferences.remindersEnabled,
    },
  };
}

function periodLabel(period: Exclude<LifePeriod, 'auto'>): string {
  return period === 'manha' ? 'pela manhã' : period === 'tarde' ? 'à tarde' : period === 'noite' ? 'à noite' : 'em qualquer horário livre';
}

function nextProgramLabel(nextProgram?: { title?: string; presentation?: string; departure?: string } | null): string {
  if (!nextProgram?.title) return 'sua próxima programação';
  const time = nextProgram.presentation || nextProgram.departure;
  return `${nextProgram.title}${time ? ` às ${time}` : ''}`;
}

export function buildLifeConciergeRecommendation(nextProgram?: { title?: string; presentation?: string; departure?: string } | null): LifeConciergeRecommendation {
  const context = getLifeRoutineContext();
  const currentPeriod = periodForDate(new Date());
  const program = nextProgramLabel(nextProgram);
  const reasons: string[] = [];

  if (context.sleep.available && context.sleep.deficitMinutes >= 90) {
    reasons.push(`sono recente ${Math.round(context.sleep.latestMinutes / 6) / 10} h`, `meta pessoal ${Math.round(context.sleep.targetMinutes / 6) / 10} h`, program);
    return {
      id: `rest-${new Date().toISOString().slice(0, 10)}`,
      category: 'rest',
      title: 'Hoje o melhor investimento é preservar a recuperação',
      body: `O concierge rebaixou treino forte e blocos longos. Priorize uma janela de descanso, hidratação e uma atividade leve antes de ${program}.`,
      actionLabel: 'Proteger descanso',
      confidence: context.freshness === 'fresh' ? 'alta' : 'media',
      reasons,
    };
  }

  if (new Date().getHours() >= 11 && context.hydration.progress < 0.45) {
    reasons.push(`${context.hydration.mlToday} ml registrados hoje`, `meta pessoal ${context.hydration.targetMl} ml`, program);
    return {
      id: `hydration-${new Date().toISOString().slice(0, 10)}`,
      category: 'hydration',
      title: 'Faça uma pausa curta para hidratação',
      body: 'Registre um copo agora e mantenha a meta pessoal distribuída ao longo do dia, sem concentrar tudo perto do descanso ou da apresentação.',
      actionLabel: `Registrar ${getLifeAdaptivePreferences().hydrationPortionMl} ml`,
      confidence: 'alta',
      reasons,
    };
  }

  const exerciseWindow = context.exercise.preferredPeriod === currentPeriod || context.exercise.preferredPeriod === 'qualquer';
  if (!context.exercise.goalReached && exerciseWindow && (!context.sleep.available || context.sleep.deficitMinutes < 60)) {
    reasons.push(`${context.exercise.sessions7Days}/${context.exercise.targetSessions} atividades nesta semana`, `melhor adesão ${periodLabel(context.exercise.preferredPeriod)}`, program);
    return {
      id: `exercise-${new Date().toISOString().slice(0, 10)}`,
      category: 'exercise',
      title: 'Uma boa janela para cumprir sua atividade sem brigar com a escala',
      body: 'O sistema encontrou um horário parecido com aqueles em que você costuma aderir melhor. Comece com o compromisso de apenas chegar; a intensidade continua sendo uma escolha sua.',
      actionLabel: 'Fazer check-in',
      confidence: context.learningLevel === 'personalizado' ? 'alta' : 'media',
      reasons,
    };
  }

  const studyWindow = context.study.preferredPeriod === currentPeriod || context.study.preferredPeriod === 'qualquer';
  if (context.study.targetSessions > 0 && context.study.sessions7Days < context.study.targetSessions && studyWindow) {
    reasons.push(`${context.study.sessions7Days}/${context.study.targetSessions} blocos de estudo nesta semana`, `melhor adesão ${periodLabel(context.study.preferredPeriod)}`, program);
    return {
      id: `study-${new Date().toISOString().slice(0, 10)}`,
      category: 'study',
      title: 'Boa janela para um bloco curto e focado de estudo',
      body: 'O concierge sugere começar pequeno e parar antes de comprometer o descanso. O horário será reajustado conforme você registra o que realmente conseguiu cumprir.',
      actionLabel: 'Iniciar estudo',
      confidence: context.learningLevel === 'iniciando' ? 'baixa' : 'media',
      reasons,
    };
  }

  if (context.leisure.targetSessions > 0 && context.leisure.sessions7Days < context.leisure.targetSessions) {
    reasons.push(`${context.leisure.sessions7Days}/${context.leisure.targetSessions} momentos de lazer nesta semana`, program);
    return {
      id: `leisure-${new Date().toISOString().slice(0, 10)}`,
      category: 'leisure',
      title: 'Reserve também um espaço que não seja obrigação',
      body: 'Lazer e tempo pessoal fazem parte do plano. Escolha algo simples e compatível com a janela disponível, sem transformar descanso em mais uma meta rígida.',
      actionLabel: 'Registrar lazer',
      confidence: 'media',
      reasons,
    };
  }

  if (context.observations < 5) {
    reasons.push('poucos registros pessoais', 'aprendizado local ainda em início', program);
    return {
      id: 'calibration',
      category: 'calibration',
      title: 'Estou aprendendo seu ritmo real',
      body: 'Registre água, estudo, academia, lazer e se a sugestão funcionou. Em poucos dias o CrewCheck começa a reconhecer horários com maior adesão e preservar melhor o descanso.',
      actionLabel: 'Registrar uma ação',
      confidence: 'baixa',
      reasons,
    };
  }

  reasons.push('metas principais equilibradas', `aprendizado ${context.learningLevel}`, program);
  return {
    id: `balance-${new Date().toISOString().slice(0, 10)}`,
    category: 'balance',
    title: 'Seu plano está equilibrado; mantenha flexibilidade',
    body: 'Nenhuma ação urgente foi detectada. O concierge continuará ajustando os melhores horários conforme sua escala e os registros reais desta semana.',
    actionLabel: 'Ver meu padrão',
    confidence: context.learningLevel === 'personalizado' ? 'alta' : 'media',
    reasons,
  };
}

export function recordRecommendationFeedback(recommendationId: string, useful: boolean) {
  recordLifeEvent({
    type: 'recommendation_feedback',
    status: 'completed',
    source: 'crewcheck',
    rating: useful ? 5 : 1,
    note: recommendationId,
    metadata: { useful },
  });
}

function timeToday(value: string, date = new Date()): Date {
  const [hour, minute] = String(value || '').split(':').map(Number);
  const next = new Date(date);
  next.setHours(Number.isFinite(hour) ? hour : 12, Number.isFinite(minute) ? minute : 0, 0, 0);
  return next;
}

function periodReminderTime(period: Exclude<LifePeriod, 'auto'>): string {
  if (period === 'manha') return '09:00';
  if (period === 'tarde') return '16:00';
  if (period === 'noite') return '19:30';
  return '17:00';
}

export function scheduleLifeRemindersForToday(): number {
  if (typeof window === 'undefined') return 0;
  const preferences = getLifeAdaptivePreferences();
  if (!preferences.remindersEnabled) return 0;
  const runtime = (window as any).CrewCheckPremium;
  if (!runtime?.scheduleNotification) return 0;
  const context = getLifeRoutineContext();
  const now = new Date();
  const planned: Array<{ title: string; body: string; time: Date }> = [];
  const nextHydration = new Date(now.getTime() + 2 * 3_600_000);
  if (context.hydration.progress < 0.8 && nextHydration.getHours() < 21) {
    planned.push({ title: 'CrewCheck Life · Hidratação', body: 'Pausa curta: registre um copo e siga sua meta pessoal com tranquilidade.', time: nextHydration });
  }
  if (!context.exercise.goalReached) {
    planned.push({ title: 'CrewCheck Life · Movimento', body: 'Existe uma janela possível para atividade. Confira a escala e escolha uma intensidade compatível com sua disposição.', time: timeToday(periodReminderTime(context.exercise.preferredPeriod)) });
  }
  if (context.study.targetSessions > 0 && context.study.sessions7Days < context.study.targetSessions) {
    planned.push({ title: 'CrewCheck Life · Estudo', body: 'Um bloco curto pode render mais que uma sessão longa. Preserve o descanso antes da próxima programação.', time: timeToday(periodReminderTime(context.study.preferredPeriod)) });
  }
  let count = 0;
  planned.sort((a, b) => a.time.getTime() - b.time.getTime()).slice(0, 3).forEach((item) => {
    if (item.time.getTime() <= now.getTime() + 60_000) return;
    if (runtime.scheduleNotification(item.title, item.body, item.time.getTime())) count += 1;
  });
  return count;
}

export function shareGymCheckInText(gymName = ''): string {
  const label = gymName.trim() || 'na academia';
  return `Check-in CrewCheck Life: cheguei ${label}. Hoje o objetivo é começar e respeitar meu ritmo. ✈️`;
}

export function clearLifeConciergeData() {
  if (!storageAvailable()) return;
  Object.values(KEYS).filter((key) => ![KEYS.nativeSummary, KEYS.profile].includes(key)).forEach((key) => {
    try { window.localStorage.removeItem(key); } catch {}
  });
  window.dispatchEvent(new CustomEvent('crewcheck:life-adaptive-update', { detail: { cleared: true } }));
}
