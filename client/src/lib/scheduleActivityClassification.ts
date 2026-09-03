/**
 * Política única de apresentação da escala para a interface.
 *
 * Esta camada lê a saída do motor canônico, mas não modifica parser, datas,
 * horários, continuidade, origem ou destino.
 *
 * Duas decisões são propositalmente independentes:
 * - o evento conta como programação;
 * - o evento exige deslocamento para a Saída Inteligente.
 *
 * Exemplo: HSB e EAD contam como programação publicada, porém não exigem
 * deslocamento enquanto não houver acionamento ou atividade presencial.
 */

export type ScheduleActivityCategory =
  | 'PROGRAMACAO'
  | 'FOLGA'
  | 'REPOUSO'
  | 'PERNOITE'
  | 'DESCONHECIDA';

type PublishedDayLike = {
  type?: string | null;
  pairingCode?: string | null;
  rawText?: string | null;
  dutyReport?: string | null;
  dutyDebrief?: string | null;
  legs?: unknown[] | null;
};

export type ScheduleActivityLike = {
  placeholder?: boolean | null;
  kind?: string | null;
  code?: string | null;
  type?: string | null;
  pairingCode?: string | null;
  title?: string | null;
  subtitle?: string | null;
  flightNumber?: string | null;
  presentation?: string | null;
  departure?: string | null;
  arrival?: string | null;
  activated?: boolean | null;
  isActivated?: boolean | null;
  legs?: unknown[] | null;
  day?: PublishedDayLike | null;
  canonical?: {
    kind?: string | null;
    code?: string | null;
    publishedDay?: PublishedDayLike | null;
  } | null;
};

export type ScheduleActivityCounts = {
  programming: number;
  flights: number;
  nonFlightProgramming: number;
  rest: number;
  daysOff: number;
  recoveryRest: number;
  overnights: number;
  unknown: number;
};

const DAY_OFF_CODES = new Set([
  'DB',
  'DBC',
  'DC',
  'DCH',
  'DE',
  'DF',
  'DH',
  'DO',
  'DOA',
  'DOB',
  'DOBI',
  'DOF',
  'DOM',
  'DOP',
  'DOPR',
  'DRC',
  'DS',
  'DW',
  'FOLGA',
  'NSC',
  'OFF',
  'VC',
  'FERIAS',
]);

const RECOVERY_REST_CODES = new Set([
  'DR',
  'REST',
  'REPOUSO',
  'DESCANSO',
  'DESCANSO_REGULAMENTAR',
]);

const OVERNIGHT_CODES = new Set([
  'LAYOVER',
  'PERNOITE',
  'ESTADIA',
  'ESTADIA_DIURNA',
]);

const STANDBY_CODES = new Set([
  'HSB',
  'HSB1',
  'HSB2',
  'HSB_ADM',
  'HSB-ADM',
  'HSBD',
  'HSBE',
]);

const ONLINE_CODES = new Set([
  'EAD',
  'NPO',
  'ONTR',
  'WEB',
  'WEB4',
  'WEB5',
]);

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function activityCodeValues(activity: ScheduleActivityLike): string[] {
  const published = activity.canonical?.publishedDay;
  return [
    activity.canonical?.code,
    activity.code,
    activity.pairingCode,
    activity.type,
    activity.day?.pairingCode,
    activity.day?.type,
    published?.pairingCode,
    published?.type,
    activity.flightNumber,
    activity.title,
  ]
    .map(normalize)
    .filter(Boolean);
}

function activityValues(activity: ScheduleActivityLike): string[] {
  return [
    ...activityCodeValues(activity),
    normalize(activity.subtitle),
    normalize(activity.day?.rawText),
    normalize(activity.canonical?.publishedDay?.rawText),
    normalize(activity.kind),
    normalize(activity.canonical?.kind),
  ].filter(Boolean);
}

function activityTokens(activity: ScheduleActivityLike): Set<string> {
  const tokens = new Set<string>();
  for (const value of activityCodeValues(activity)) {
    tokens.add(value);
    for (const token of value.match(/[A-Z0-9]+(?:[-_][A-Z0-9]+)*/g) ?? []) {
      tokens.add(token);
    }
  }
  return tokens;
}

function hasCode(activity: ScheduleActivityLike, codes: ReadonlySet<string>): boolean {
  for (const token of activityTokens(activity)) {
    if (codes.has(token)) return true;
  }
  return false;
}

function activityText(activity: ScheduleActivityLike): string {
  return activityValues(activity).join(' ');
}

function activitySemanticText(activity: ScheduleActivityLike): string {
  return activityCodeValues(activity).join(' ');
}

function hasFlightLegs(activity: ScheduleActivityLike): boolean {
  const direct = Array.isArray(activity.legs) ? activity.legs.length : 0;
  const day = Array.isArray(activity.day?.legs) ? activity.day!.legs!.length : 0;
  const published = Array.isArray(activity.canonical?.publishedDay?.legs)
    ? activity.canonical!.publishedDay!.legs!.length
    : 0;
  return direct + day + published > 0;
}

export function isFlightScheduleActivity(activity: ScheduleActivityLike): boolean {
  const kind = normalize(activity.kind);
  const canonicalKind = normalize(activity.canonical?.kind);
  if (kind === 'FLIGHT' || canonicalKind === 'FLIGHT' || hasFlightLegs(activity)) {
    return true;
  }
  return activityValues(activity).some((value) => /\b[A-Z0-9]{2}\s?\d{3,4}\b/.test(value));
}

export function classifyScheduleActivity(
  activity: ScheduleActivityLike,
): ScheduleActivityCategory {
  if (!activity || activity.placeholder) return 'DESCONHECIDA';

  if (hasCode(activity, RECOVERY_REST_CODES)) return 'REPOUSO';
  if (hasCode(activity, DAY_OFF_CODES)) return 'FOLGA';

  const kind = normalize(activity.kind);
  const canonicalKind = normalize(activity.canonical?.kind);

  if (kind === 'REST' || canonicalKind === 'REST') {
    return /\b(?:DR|REST|REPOUSO|DESCANSO REGULAMENTAR)\b/.test(activitySemanticText(activity))
      ? 'REPOUSO'
      : 'FOLGA';
  }

  if (
    kind === 'STAY'
    || canonicalKind === 'STAY'
    || hasCode(activity, OVERNIGHT_CODES)
  ) {
    return 'PERNOITE';
  }

  if (
    isFlightScheduleActivity(activity)
    || ['DUTY', 'RESERVE', 'STANDBY', 'ACTIVITY', 'GROUND'].includes(kind)
    || ['DUTY', 'RESERVE', 'STANDBY', 'ACTIVITY', 'GROUND'].includes(canonicalKind)
  ) {
    return 'PROGRAMACAO';
  }

  const text = activityText(activity);
  if (/\b(?:FOLGA|FERIAS|DAY OFF)\b/.test(text)) return 'FOLGA';
  if (/\b(?:REPOUSO|DESCANSO REGULAMENTAR)\b/.test(text)) return 'REPOUSO';
  if (/\b(?:PERNOITE|ESTADIA DIURNA|LAYOVER)\b/.test(text)) return 'PERNOITE';

  const hasPublishedWindow = Boolean(
    activity.presentation
    || activity.departure
    || activity.arrival
    || activity.day?.dutyReport
    || activity.day?.dutyDebrief
    || activity.canonical?.publishedDay?.dutyReport
    || activity.canonical?.publishedDay?.dutyDebrief,
  );
  return hasPublishedWindow ? 'PROGRAMACAO' : 'DESCONHECIDA';
}

export function isProgramScheduleActivity(activity: ScheduleActivityLike): boolean {
  // #537: `journey-rest` é projetado como `duty` apenas para permanecer fora
  // do contrato de pernoite/stay. O tipo projetado nunca pode fazê-lo voltar a
  // ser programação em seletores materializados que usam este predicado.
  if (isJourneyRestScheduleActivity(activity)) return false;
  return classifyScheduleActivity(activity) === 'PROGRAMACAO';
}

export function isRestScheduleActivity(activity: ScheduleActivityLike): boolean {
  const category = classifyScheduleActivity(activity);
  return category === 'FOLGA' || category === 'REPOUSO';
}

export function isOvernightScheduleActivity(activity: ScheduleActivityLike): boolean {
  return classifyScheduleActivity(activity) === 'PERNOITE';
}

function isStandby(activity: ScheduleActivityLike): boolean {
  return normalize(activity.kind) === 'STANDBY'
    || normalize(activity.canonical?.kind) === 'STANDBY'
    || hasCode(activity, STANDBY_CODES)
    || /\bSOBREAVISO\b/.test(activityText(activity));
}

function isActivated(activity: ScheduleActivityLike): boolean {
  return Boolean(
    activity.activated
    || activity.isActivated
    || hasFlightLegs(activity)
    || /\b(?:ACIONADO|ACIONAMENTO|CHAMADO|CONVOCADO)\b/.test(activityText(activity)),
  );
}

function isRemoteActivity(activity: ScheduleActivityLike): boolean {
  if (hasCode(activity, ONLINE_CODES)) return true;
  return /\b(?:EAD|ONLINE|E-LEARNING|FOXSYSTEM|REMOTO)\b/.test(activityText(activity));
}

/**
 * Decide somente se a programação exige deslocamento.
 *
 * HSB não acionado e atividade remota continuam contando como programação,
 * mas não podem abrir cálculo de saída.
 */
/**
 * Apresentação realmente publicada da atividade, ou null.
 *
 * "Conexão/Solo" é o rótulo de uma etapa que continua DENTRO de uma jornada já
 * iniciada: descreve espera em solo, não apresentação. Planejar saída a partir
 * dele levaria o tripulante a um horário que não existe (#512).
 */
export function publishedPresentationOf(activity: ScheduleActivityLike): string | null {
  const presentation = String(activity?.presentation || '').trim();
  if (!presentation || presentation === '—' || presentation === CONTINUATION_PRESENTATION) return null;
  return /\d{1,2}:\d{2}/.test(presentation) ? presentation : null;
}

/**
 * Rótulo que a etapa recebe quando continua dentro de uma jornada já aberta.
 * Distingue-se de apresentação AUSENTE: ausência é apenas desconhecimento
 * nesta camada, enquanto este rótulo é evidência positiva de que a etapa não
 * tem apresentação própria.
 */
const CONTINUATION_PRESENTATION = 'Conexão/Solo';

function hasContinuationPresentation(activity: ScheduleActivityLike): boolean {
  const presentation = String(activity?.presentation || '').trim();
  return presentation === CONTINUATION_PRESENTATION;
}

/**
 * #537: repouso ENTRE jornadas é representação de intervalo, nunca programação.
 * Ele é projetado como `duty` de propósito (mapeá-lo para `stay` inflaria a
 * contagem de pernoites), então o `kind` da projeção não o distingue — quem
 * distingue é o tipo canônico.
 */
export function isJourneyRestScheduleActivity(activity: ScheduleActivityLike): boolean {
  return normalize(activity?.canonical?.kind) === 'JOURNEY-REST';
}

export function isSmartDepartureEligible(activity: ScheduleActivityLike): boolean {
  // Repouso entre jornadas não tem apresentação por definição: ele descreve
  // justamente o intervalo ANTES da apresentação da jornada seguinte. Planejar
  // saída, despertador ou diária a partir dele produz horário inexistente.
  if (isJourneyRestScheduleActivity(activity)) return false;
  if (!isProgramScheduleActivity(activity)) return false;
  // Continuação de jornada carrega tempo de solo, não apresentação: planejar
  // saída a partir dela levaria a um horário que não existe (#512). Apresentação
  // apenas ausente não decide nada aqui — quem sabe disso é a camada de eventos.
  if (hasContinuationPresentation(activity)) return false;
  if (isFlightScheduleActivity(activity)) return true;
  if (isStandby(activity) && !isActivated(activity)) return false;
  if (isRemoteActivity(activity)) return false;
  return true;
}

export function countScheduleCategories(
  activities: readonly ScheduleActivityLike[],
): ScheduleActivityCounts {
  const counts: ScheduleActivityCounts = {
    programming: 0,
    flights: 0,
    nonFlightProgramming: 0,
    rest: 0,
    daysOff: 0,
    recoveryRest: 0,
    overnights: 0,
    unknown: 0,
  };

  for (const activity of activities) {
    const category = classifyScheduleActivity(activity);
    if (category === 'PROGRAMACAO') {
      counts.programming += 1;
      if (isFlightScheduleActivity(activity)) counts.flights += 1;
      else counts.nonFlightProgramming += 1;
      continue;
    }
    if (category === 'FOLGA') {
      counts.rest += 1;
      counts.daysOff += 1;
      continue;
    }
    if (category === 'REPOUSO') {
      counts.rest += 1;
      counts.recoveryRest += 1;
      continue;
    }
    if (category === 'PERNOITE') {
      counts.overnights += 1;
      continue;
    }
    counts.unknown += 1;
  }

  return counts;
}
