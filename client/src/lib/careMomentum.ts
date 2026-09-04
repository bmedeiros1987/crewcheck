export type MomentumTone = 'discreto' | 'incentivador' | 'fogo-no-parquinho';

export type MomentumSignal = {
  id: string;
  kind: 'sleep' | 'training' | 'recovery' | 'routine' | 'operational';
  direction: 'improved' | 'maintained' | 'resumed' | 'strained';
  confidence: number;
  current?: number;
  previous?: number;
  unit?: string;
  source: string;
  observedAt: string;
};

export type MomentumContext = {
  dutyCount?: number;
  nightDutyCount?: number;
  nightsAway?: number;
  demandingWeek?: boolean;
};

export type MomentumMoment = {
  intent: 'celebrate' | 'support' | 'protect' | 'silence';
  title?: string;
  message?: string;
  evidence: string[];
  confidence: number;
};

const fresh = (signal: MomentumSignal, now: Date) => {
  const observed = new Date(signal.observedAt).getTime();
  return Number.isFinite(observed) && now.getTime() - observed <= 8 * 24 * 60 * 60 * 1000;
};

const trusted = (signal: MomentumSignal) => signal.confidence >= 0.75;

/**
 * Builds a motivational moment from descriptive, user-authorized signals.
 * It never diagnoses health, invents canonical roster facts, or turns an
 * absence of activity into failure. Protection wins over encouragement.
 */
export function buildMomentumMoment(
  signals: MomentumSignal[],
  context: MomentumContext,
  tone: MomentumTone = 'incentivador',
  now = new Date(),
): MomentumMoment {
  const usable = signals.filter((signal) => fresh(signal, now) && trusted(signal));
  if (!usable.length) return { intent: 'silence', evidence: [], confidence: 0 };

  const evidence = usable.map((signal) => `${signal.kind}:${signal.direction}:${signal.source}`);
  const confidence = Math.min(...usable.map((signal) => signal.confidence));
  const strained = usable.some((signal) => signal.direction === 'strained');
  const positive = usable.filter((signal) => ['improved', 'maintained', 'resumed'].includes(signal.direction));

  // A hard week with recovery strain is not a moment to push performance.
  if (context.demandingWeek && strained) {
    return {
      intent: 'protect',
      title: 'Hoje a vitória é descansar.',
      message: 'Sua semana exigiu bastante de você. Não precisa transformar toda janela livre em produtividade.',
      evidence,
      confidence,
    };
  }

  if (!positive.length) return { intent: 'silence', evidence, confidence };

  const sleepImproved = positive.some((signal) => signal.kind === 'sleep' && signal.direction === 'improved');
  const trained = positive.some((signal) => signal.kind === 'training');
  const resumed = positive.some((signal) => signal.direction === 'resumed');

  if (context.demandingWeek && (trained || sleepImproved)) {
    const title = tone === 'fogo-no-parquinho'
      ? 'A escala não facilitou. Você evoluiu mesmo assim. 👊'
      : tone === 'discreto'
        ? 'Boa semana.'
        : 'Semana puxada — e você ainda cuidou de você. 💪';
    return {
      intent: 'celebrate',
      title,
      message: sleepImproved && trained
        ? 'Mesmo com uma programação exigente, você encontrou espaço para treinar e registrou mais tempo de sono que na semana anterior.'
        : trained
          ? 'Mesmo com uma programação exigente, você encontrou boas janelas para treinar.'
          : 'Mesmo com uma programação exigente, seu registro de sono aumentou em relação à semana anterior.',
      evidence,
      confidence,
    };
  }

  if (resumed) {
    return {
      intent: 'celebrate',
      title: 'Você voltou. 💪',
      message: 'Não precisa recuperar o tempo perdido. Só continuar no seu ritmo.',
      evidence,
      confidence,
    };
  }

  return {
    intent: 'celebrate',
    title: tone === 'fogo-no-parquinho' ? 'Consistência também é vitória. 👊' : 'Boa consistência.',
    message: 'O CrewCheck percebeu uma evolução na rotina que você escolheu acompanhar.',
    evidence,
    confidence,
  };
}
