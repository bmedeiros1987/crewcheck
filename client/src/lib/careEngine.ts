export type CareIntent = 'celebrate' | 'support' | 'protect' | 'reassure' | 'nudge' | 'act' | 'silence';

export type CareAction = {
  label: string;
  actionId: string;
};

export type CareMoment = {
  id: string;
  intent: Exclude<CareIntent, 'silence'>;
  title: string;
  detail?: string;
  primaryAction?: CareAction;
  secondaryAction?: CareAction;
  confidence: number;
  importance: number;
  utility: number;
  interruptionCost: number;
  expiresAt?: string;
  cooldownKey?: string;
  safetyCritical?: boolean;
  provenance?: string[];
};

export type CareDecision =
  | {
      intent: 'silence';
      reason: 'no-candidates' | 'below-threshold' | 'cooldown' | 'expired';
      score: number;
    }
  | {
      intent: Exclude<CareIntent, 'silence'>;
      moment: CareMoment;
      score: number;
    };

export type CareDecisionContext = {
  now?: Date;
  threshold?: number;
  recentlyShownCooldownKeys?: ReadonlySet<string>;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * Care is intentionally conservative. A high-confidence, useful moment may speak;
 * a merely interesting one should stay quiet. Critical operational/safety moments
 * remain eligible even if the interruption cost is high.
 */
export function scoreCareMoment(moment: CareMoment): number {
  const confidence = clamp01(moment.confidence);
  const importance = clamp01(moment.importance);
  const utility = clamp01(moment.utility);
  const interruptionCost = clamp01(moment.interruptionCost);

  const positive = (importance * 0.4) + (utility * 0.35) + (confidence * 0.25);
  const penalty = moment.safetyCritical ? 0 : interruptionCost * 0.42;
  return Math.max(0, Math.min(1, positive - penalty));
}

export function decideCareMoment(
  candidates: readonly CareMoment[],
  context: CareDecisionContext = {},
): CareDecision {
  const now = context.now ?? new Date();
  const threshold = clamp01(context.threshold ?? 0.56);
  const cooldowns = context.recentlyShownCooldownKeys ?? new Set<string>();

  if (candidates.length === 0) {
    return { intent: 'silence', reason: 'no-candidates', score: 0 };
  }

  const eligible = candidates.filter((candidate) => {
    if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() <= now.getTime()) return false;
    if (candidate.cooldownKey && cooldowns.has(candidate.cooldownKey) && !candidate.safetyCritical) return false;
    return true;
  });

  if (eligible.length === 0) {
    const hadExpired = candidates.some((candidate) => candidate.expiresAt && new Date(candidate.expiresAt).getTime() <= now.getTime());
    return { intent: 'silence', reason: hadExpired ? 'expired' : 'cooldown', score: 0 };
  }

  const ranked = eligible
    .map((moment) => ({ moment, score: scoreCareMoment(moment) }))
    .sort((a, b) => {
      if (a.moment.safetyCritical !== b.moment.safetyCritical) return a.moment.safetyCritical ? -1 : 1;
      return b.score - a.score;
    });

  const winner = ranked[0];
  if (!winner.moment.safetyCritical && winner.score < threshold) {
    return { intent: 'silence', reason: 'below-threshold', score: winner.score };
  }

  return { intent: winner.moment.intent, moment: winner.moment, score: winner.score };
}

export type WeeklyTrainingCareInput = {
  gymVisitsThisWeek: number;
  usualWeeklyGymVisits?: number;
  workload: 'light' | 'normal' | 'heavy' | 'very-heavy';
  nightsAwayFromBase?: number;
  earlyOrLateDuties?: number;
  goodTrainingWindowsNextWeek?: number;
  userHasTrainingGoal?: boolean;
};

const workloadCopy = (workload: WeeklyTrainingCareInput['workload']) => {
  if (workload === 'very-heavy') return 'sua semana foi especialmente puxada';
  if (workload === 'heavy') return 'sua escala foi puxada';
  if (workload === 'light') return 'sua semana teve uma programação mais leve';
  return 'sua semana teve uma carga normal';
};

/**
 * Produces a care candidate, never a health judgement. The user's own goal or
 * established routine can be acknowledged, but CrewCheck does not tell the user
 * that they "need" to exercise more.
 */
export function buildWeeklyTrainingCareMoment(input: WeeklyTrainingCareInput): CareMoment | null {
  const visits = Math.max(0, Math.floor(input.gymVisitsThisWeek));
  const usual = input.usualWeeklyGymVisits == null ? undefined : Math.max(0, input.usualWeeklyGymVisits);
  const windows = Math.max(0, Math.floor(input.goodTrainingWindowsNextWeek ?? 0));
  const heavy = input.workload === 'heavy' || input.workload === 'very-heavy';
  const provenance = ['weekly-training-summary', `workload:${input.workload}`];

  if (heavy && visits >= 2) {
    return {
      id: 'weekly-training-celebrate',
      intent: 'celebrate',
      title: 'Semana puxada — e você ainda encontrou tempo para você. 💪',
      detail: `${workloadCopy(input.workload)} e, mesmo assim, você foi à academia ${visits} ${visits === 1 ? 'vez' : 'vezes'}.`,
      confidence: 0.94,
      importance: 0.72,
      utility: 0.74,
      interruptionCost: 0.16,
      cooldownKey: 'weekly-training',
      provenance,
    };
  }

  if (usual != null && visits < usual && (input.userHasTrainingGoal || usual >= 2)) {
    return {
      id: 'weekly-training-support',
      intent: 'support',
      title: 'Sua rotina de treino mudou um pouco esta semana.',
      detail: windows > 0
        ? `Você conseguiu ir ${visits} ${visits === 1 ? 'vez' : 'vezes'}. Encontrei ${windows} boas ${windows === 1 ? 'janela' : 'janelas'} na próxima semana, sem apertar sua programação.`
        : `Você conseguiu ir ${visits} ${visits === 1 ? 'vez' : 'vezes'}. Se quiser retomar seu ritmo, eu posso procurar boas janelas na próxima semana.`,
      primaryAction: { label: 'Me ajuda a planejar', actionId: 'care.plan-training-week' },
      secondaryAction: { label: 'Agora não', actionId: 'care.dismiss-training-week' },
      confidence: 0.9,
      importance: 0.58,
      utility: windows > 0 ? 0.82 : 0.64,
      interruptionCost: heavy ? 0.28 : 0.2,
      cooldownKey: 'weekly-training',
      provenance,
    };
  }

  if (visits >= 2) {
    return {
      id: 'weekly-training-consistency',
      intent: 'celebrate',
      title: 'Boa consistência esta semana. 💪',
      detail: `Você conseguiu encaixar ${visits} ${visits === 1 ? 'treino' : 'treinos'} mesmo com a rotina mudando ao longo dos dias.`,
      confidence: 0.9,
      importance: 0.52,
      utility: 0.58,
      interruptionCost: 0.22,
      cooldownKey: 'weekly-training',
      provenance,
    };
  }

  return null;
}
