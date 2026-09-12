export type FemWellbeing = 'well' | 'ok' | 'tired' | 'very_tired';
export type FemPatternMaturity = 'few_data' | 'initial_trend' | 'recurring_pattern' | 'consistent_pattern';

export type FemSymptomKey =
  | 'cramps'
  | 'headache'
  | 'bloating'
  | 'sleep_worse'
  | 'sleepiness'
  | 'irritability'
  | 'mood_change'
  | 'low_energy'
  | 'gastrointestinal'
  | 'hot_flushes'
  | 'night_sweats'
  | 'concentration'
  | 'exercise_discomfort';

export type FemCycleRecord = {
  id: string;
  periodStart: string;
  periodEnd?: string;
  source: 'manual' | 'health_connect' | 'healthkit' | 'import';
  createdAt: string;
};

export type FemCheckin = {
  id: string;
  at: string;
  wellbeing: FemWellbeing;
  sleepQuality?: 1 | 2 | 3 | 4 | 5;
  energy?: 1 | 2 | 3 | 4 | 5;
  symptoms: FemSymptomKey[];
  freeText?: string;
  context?: {
    earlyStart?: boolean;
    madrugada?: boolean;
    presentation?: string;
    sleepHours?: number;
    trainingMinutes?: number;
    hotelNoise?: boolean;
  };
};

export type FemPatternInsight = {
  id: string;
  title: string;
  detail: string;
  sampleSize: number;
  maturity: FemPatternMaturity;
  confidenceLabel: string;
  factors: string[];
};

const DAY = 86_400_000;

function safeDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(a: string, b: string): number | null {
  const left = safeDate(a);
  const right = safeDate(b);
  if (!left || !right) return null;
  return Math.round((right.getTime() - left.getTime()) / DAY);
}

export function maturityForSample(sampleSize: number): FemPatternMaturity {
  if (sampleSize < 3) return 'few_data';
  if (sampleSize < 5) return 'initial_trend';
  if (sampleSize < 8) return 'recurring_pattern';
  return 'consistent_pattern';
}

export function maturityLabel(value: FemPatternMaturity): string {
  switch (value) {
    case 'few_data': return 'Poucos dados';
    case 'initial_trend': return 'Tendência inicial';
    case 'recurring_pattern': return 'Padrão recorrente';
    case 'consistent_pattern': return 'Padrão consistente';
  }
}

export function estimateCycleContext(records: FemCycleRecord[], today = new Date()): {
  cycleDay?: number;
  averageCycleDays?: number;
  cyclesObserved: number;
  confidence: FemPatternMaturity;
} {
  const starts = records
    .map((record) => record.periodStart)
    .filter(Boolean)
    .sort();
  const intervals: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const diff = daysBetween(starts[index - 1], starts[index]);
    if (diff && diff >= 15 && diff <= 60) intervals.push(diff);
  }
  const latest = starts.at(-1);
  const current = latest ? daysBetween(latest, today.toISOString().slice(0, 10)) : null;
  const averageCycleDays = intervals.length
    ? Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length)
    : undefined;
  return {
    cycleDay: current !== null && current >= 0 && current <= 90 ? current + 1 : undefined,
    averageCycleDays,
    cyclesObserved: starts.length,
    confidence: maturityForSample(starts.length),
  };
}

function isLowWellbeing(checkin: FemCheckin): boolean {
  return checkin.wellbeing === 'tired' || checkin.wellbeing === 'very_tired' || (checkin.energy ?? 5) <= 2;
}

function relatedDay(checkin: FemCheckin, cycles: FemCycleRecord[]): number | null {
  const checkDate = checkin.at.slice(0, 10);
  const prior = cycles
    .map((record) => record.periodStart)
    .filter((start) => start <= checkDate)
    .sort()
    .at(-1);
  return prior ? daysBetween(prior, checkDate) : null;
}

export function buildFemInsights(cycles: FemCycleRecord[], checkins: FemCheckin[]): FemPatternInsight[] {
  const insights: FemPatternInsight[] = [];
  if (!cycles.length || !checkins.length) return insights;

  const premenstrual = checkins.filter((checkin) => {
    const checkDate = checkin.at.slice(0, 10);
    const next = cycles.map((record) => record.periodStart).filter((start) => start > checkDate).sort()[0];
    if (!next) return false;
    const diff = daysBetween(checkDate, next);
    return diff !== null && diff >= 1 && diff <= 3;
  });
  const preLow = premenstrual.filter(isLowWellbeing);
  if (premenstrual.length >= 2 && preLow.length >= Math.ceil(premenstrual.length / 2)) {
    const maturity = maturityForSample(premenstrual.length);
    insights.push({
      id: 'pre-period-wellbeing',
      title: 'Há um padrão perto do início da menstruação',
      detail: `Em ${preLow.length} de ${premenstrual.length} registros feitos 1–3 dias antes do início informado da menstruação, você marcou energia baixa ou cansaço.`,
      sampleSize: premenstrual.length,
      maturity,
      confidenceLabel: maturityLabel(maturity),
      factors: ['autorrelato', 'datas do ciclo'],
    });
  }

  const early = checkins.filter((checkin) => checkin.context?.earlyStart);
  const earlyLow = early.filter(isLowWellbeing);
  if (early.length >= 3 && earlyLow.length >= Math.ceil(early.length * 0.6)) {
    const maturity = maturityForSample(early.length);
    insights.push({
      id: 'early-start-wellbeing',
      title: 'Early starts aparecem em dias de menor disposição no seu histórico',
      detail: `Você marcou cansaço ou energia baixa em ${earlyLow.length} de ${early.length} check-ins associados a early start. Isso é associação pessoal, não causalidade.`,
      sampleSize: early.length,
      maturity,
      confidenceLabel: maturityLabel(maturity),
      factors: ['early start', 'autorrelato'],
    });
  }

  const poorSleep = checkins.filter((checkin) => (checkin.sleepQuality ?? 5) <= 2);
  const poorSleepLow = poorSleep.filter(isLowWellbeing);
  if (poorSleep.length >= 3 && poorSleepLow.length >= Math.ceil(poorSleep.length * 0.6)) {
    const maturity = maturityForSample(poorSleep.length);
    insights.push({
      id: 'sleep-wellbeing',
      title: 'Sono percebido pior coincide com menor disposição',
      detail: `Em ${poorSleepLow.length} de ${poorSleep.length} registros com sono percebido baixo, você também relatou cansaço ou energia baixa.`,
      sampleSize: poorSleep.length,
      maturity,
      confidenceLabel: maturityLabel(maturity),
      factors: ['qualidade de sono', 'autorrelato'],
    });
  }

  const symptomCounts = new Map<FemSymptomKey, number>();
  for (const checkin of checkins) {
    for (const symptom of checkin.symptoms) symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
  }
  const top = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    const maturity = maturityForSample(top[1]);
    insights.push({
      id: `symptom-${top[0]}`,
      title: 'Um sintoma aparece de forma repetida nos seus registros',
      detail: `O mesmo sintoma foi registrado ${top[1]} vezes. Abra o histórico para comparar com sono, escala, treino e fase estimada do ciclo.`,
      sampleSize: top[1],
      maturity,
      confidenceLabel: maturityLabel(maturity),
      factors: ['sintomas autorreportados'],
    });
  }

  const cycleDays = checkins.map((checkin) => relatedDay(checkin, cycles)).filter((value): value is number => value !== null);
  if (cycleDays.length >= 3 && !insights.length) {
    const maturity = maturityForSample(cycleDays.length);
    insights.push({
      id: 'history-building',
      title: 'Seu histórico já permite comparações pessoais',
      detail: 'O CrewLife Fem já tem registros suficientes para começar a comparar ciclo, sono, escala e bem-estar sem presumir como você deveria se sentir.',
      sampleSize: cycleDays.length,
      maturity,
      confidenceLabel: maturityLabel(maturity),
      factors: ['ciclo', 'check-ins'],
    });
  }

  return insights.slice(0, 4);
}

export function buildRecoverySuggestion(input: {
  cycleContext: ReturnType<typeof estimateCycleContext>;
  latestCheckin?: FemCheckin;
  insights: FemPatternInsight[];
  nextPresentation?: string;
}): { title: string; body: string } {
  const { latestCheckin, insights, nextPresentation } = input;
  if (latestCheckin && isLowWellbeing(latestCheckin)) {
    return {
      title: 'Talvez valha proteger mais recuperação hoje',
      body: `${nextPresentation ? `Sua próxima apresentação está indicada para ${nextPresentation}. ` : ''}Você relatou menor disposição no check-in mais recente. Posso priorizar sugestões de sono, rotina leve e menos compromissos opcionais, sem concluir que você está fatigada.`,
    };
  }
  if (insights.length) {
    return {
      title: 'Há histórico pessoal útil para organizar sua rotina',
      body: `${insights[0].detail} Use isso como contexto para decidir descanso, treino e compromissos — não como diagnóstico ou previsão.`,
    };
  }
  return {
    title: 'Vamos aprender o seu padrão, sem generalizar',
    body: 'Registre ciclo e check-ins quando quiser. O CrewLife Fem só começa a sugerir padrões quando houver dados pessoais suficientes.',
  };
}
