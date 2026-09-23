export const METRIC_KEYS = ['sleepMinutes', 'sleepScore', 'skinTemperature', 'steps', 'exerciseMinutes', 'energyScore'] as const;
export type MetricKey = typeof METRIC_KEYS[number];
export type Feeling = 'unknown' | 'tired' | 'okay' | 'well' | 'unwell';
export type Observation = { value: number; observedAt: string; source: 'samsung-health' | 'manual' };
export type WellnessData = Partial<Record<MetricKey, Observation>>;
export type ManualRecord = { sleepHours: number; steps: number; activityMinutes: number; updatedAt: string };
export const METRICS: Record<MetricKey, { label: string; unit: string; min: number; max: number; note: string }> = {
  sleepMinutes: { label: 'Sono', unit: 'min', min: 0, max: 1440, note: 'Último sono concluído' },
  sleepScore: { label: 'Qualidade do sono', unit: '/100', min: 0, max: 100, note: 'Pontuação estimada pela Samsung' },
  skinTemperature: { label: 'Temperatura da pele', unit: '°C', min: 10, max: 50, note: 'Durante o sono · não mede febre' },
  steps: { label: 'Passos', unit: '', min: 0, max: 200000, note: 'Total do dia informado pela fonte' },
  exerciseMinutes: { label: 'Atividade física', unit: 'min', min: 0, max: 1440, note: 'Exercícios concluídos hoje' },
  energyScore: { label: 'Energy Score', unit: '/100', min: 0, max: 100, note: 'Estimativa de energia da Samsung' },
};

// Reject malformed, future, stale or mismatched-source data. Null is never zero.
export function normalizeWellness(value: unknown, source: Observation['source'], now = Date.now()): WellnessData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: WellnessData = {};
  for (const key of METRIC_KEYS) {
    const item = (value as Record<string, unknown>)[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const observation = item as Partial<Observation>;
    const spec = METRICS[key];
    const date = typeof observation.observedAt === 'string' ? Date.parse(observation.observedAt) : NaN;
    if (observation.source !== source || typeof observation.value !== 'number' || !Number.isFinite(observation.value)) continue;
    if (!Number.isFinite(date) || date > now || now - date >= 24 * 3600000) continue;
    if (['steps', 'exerciseMinutes'].includes(key) && new Date(date).toDateString() !== new Date(now).toDateString()) continue;
    if (observation.value < spec.min || observation.value > spec.max) continue;
    if (source === 'manual' && !['sleepMinutes', 'steps', 'exerciseMinutes'].includes(key)) continue;
    if (key === 'steps' && !Number.isInteger(observation.value)) continue;
    result[key] = { value: observation.value, observedAt: new Date(date).toISOString(), source };
  }
  return result;
}

export function manualWellness(manual: ManualRecord, now = Date.now()): WellnessData {
  const metric = (value: number): Observation => ({ value, source: 'manual', observedAt: manual.updatedAt });
  // Legacy manual fields defaulted to zero, so zero cannot prove a recorded measurement.
  return normalizeWellness({ sleepMinutes: manual.sleepHours > 0 ? metric(manual.sleepHours * 60) : undefined, steps: manual.steps > 0 ? metric(manual.steps) : undefined, exerciseMinutes: manual.activityMinutes > 0 ? metric(manual.activityMinutes) : undefined }, 'manual', now);
}

export function metricText(key: MetricKey, observation?: Observation): string {
  if (!observation) return 'Sem dado';
  if (key === 'sleepMinutes') {
    const minutes = Math.round(observation.value);
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`;
  }
  return observation.value.toLocaleString('pt-BR', { maximumFractionDigits: key === 'skinTemperature' ? 1 : 0 }) + (METRICS[key].unit ? ` ${METRICS[key].unit}` : '');
}

export type Suggestion = { kind: 'check-in' | 'rest' | 'gentle' | 'choice'; title: string; description: string; reasons: string[]; activities: string[] };

// Personal wellness options, never a diagnosis, a training prescription or fitness-for-duty assessment.
// Proprietary scores and peripheral temperature are displayed as context, not treated as clinical thresholds.
export function suggestWellness(data: WellnessData, feeling: Feeling, sleepGoalHours: number, now = Date.now()): Suggestion {
  const current = { ...normalizeWellness(data, 'manual', now), ...normalizeWellness(data, 'samsung-health', now) };
  if (feeling === 'unwell') return { kind: 'rest', title: 'Hoje, priorize como você se sente', description: 'Adie o treino se estiver indisposto. Sintomas e limitações pessoais têm prioridade sobre qualquer pontuação do relógio.', reasons: ['Você informou que não está se sentindo bem.'], activities: ['Descanso', 'Orientação profissional se necessário'] };
  if (feeling === 'tired') return { kind: 'rest', title: 'Abra espaço para recuperar', description: 'Considere um período tranquilo ou descanso. Você pode reorganizar as atividades pessoais de hoje.', reasons: ['Você informou cansaço.'], activities: ['Descanso', 'Relaxamento', 'Mobilidade confortável, se quiser'] };
  const sleep = current.sleepMinutes;
  if (!sleep || feeling === 'unknown') return { kind: 'check-in', title: 'Vamos entender seu momento', description: 'Um registro recente de sono e sua percepção de disposição ajudam a escolher uma atividade. Dados ausentes não significam recuperação boa.', reasons: [!sleep ? 'Sono recente não disponível.' : 'Falta sua percepção de disposição.'], activities: ['Registrar como estou', 'Consultar meus dados'] };
  const goal = Number.isFinite(sleepGoalHours) && sleepGoalHours >= 1 && sleepGoalHours <= 12 ? sleepGoalHours * 60 : null;
  if (goal !== null && sleep.value < goal) return { kind: 'gentle', title: 'Prefira um ritmo mais leve', description: 'Seu sono ficou abaixo da meta que você escolheu. Considere descanso, mobilidade suave ou uma caminhada confortável, conforme sua disposição.', reasons: [`Sono registrado: ${metricText('sleepMinutes', sleep)}.`, `Sua meta pessoal: ${sleepGoalHours.toLocaleString('pt-BR')} h.`], activities: ['Descanso', 'Mobilidade suave', 'Caminhada leve'] };
  const reasons = [`Sono recente: ${metricText('sleepMinutes', sleep)}.`, feeling === 'well' ? 'Você informou boa disposição.' : 'Você informou disposição regular.'];
  if (current.exerciseMinutes) reasons.push(`Atividade já registrada hoje: ${metricText('exerciseMinutes', current.exerciseMinutes)}.`);
  return { kind: 'choice', title: 'Escolha um movimento que combine com você', description: 'Considere uma atividade habitual e confortável. Ajuste a duração e a intensidade à sua experiência e às suas limitações; uma pontuação alta não libera treino intenso.', reasons, activities: feeling === 'well' ? ['Caminhada', 'Bicicleta em ritmo confortável', 'Seu treino habitual adaptado'] : ['Caminhada leve', 'Mobilidade', 'Descanso, se preferir'] };
}
