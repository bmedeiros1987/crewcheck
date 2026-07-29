/**
 * ATLAS-P0.3 — Classificação canônica de atividades.
 *
 * Função única usada por FlyDeck, Escala, Linha do Dia, contadores,
 * calendário e notificações para decidir FOLGA × PROGRAMAÇÃO.
 *
 * Regra canônica de produto:
 *   Folga e descanso NÃO pertencem à categoria Programação.
 *   Não devem contar como programação: DO, DOF, DOP, OFF, repouso,
 *   descanso regulamentar, folga publicada.
 *   Devem contar como programação: voo, reserva, sobreaviso, treinamento,
 *   reunião, passageiro, deslocamento, atividade operacional.
 */

export type ActivityCategory =
  | "PROGRAMACAO"
  | "FOLGA"
  | "REPOUSO"
  | "PERNOITE"
  | "DESCONHECIDA";

/** Códigos canônicos de descanso/folga. */
const REST_CODES = new Set([
  "DO",
  "DOF",
  "DOP",
  "OFF",
  "FOLGA",
]);

/** Rótulos textuais que indicam folga ou descanso. */
const REST_LABELS = [
  "folga",
  "descanso",
  "repouso",
  "day off",
  "dia livre",
];

/** Códigos canônicos de atividade operacional. */
const OPERATIONAL_CODES = new Set([
  "VOO",
  "FLT",
  "RES",
  "RESERVA",
  "HSB",
  "SOBREAVISO",
  "PS",
  "EXTRA",
  "CRM",
  "TREINAMENTO",
  "REUNIAO",
  "REUNIÃO",
  "DESLOCAMENTO",
  "APR",
  "APRESENTACAO",
  "APRESENTAÇÃO",
]);

export interface ScheduleActivity {
  /** Código da atividade (DO, RES, LA3219, etc.). */
  code?: string | null;
  /** Tipo interno normalizado, se houver. */
  type?: string | null;
  /** Título humano da atividade, se houver. */
  title?: string | null;
  /** Indica pernoite, quando preenchido pelo motor canônico. */
  isOvernight?: boolean;
  /** Marca explícita de descanso, quando já classificada em outro ponto. */
  isRest?: boolean;
}

/** Normaliza texto removendo acentos e caixa. */
function normalize(value?: string | null): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Classifica uma atividade em uma das categorias canônicas Atlas.
 *
 * Ordem de precedência:
 *   1. pernoite explícito (isOvernight)
 *   2. descanso explícito (isRest)
 *   3. código na lista de descanso
 *   4. rótulo textual de folga/repouso
 *   5. código/tipo operacional ou padrão de número de voo
 *   6. desconhecida
 */
export function classifyActivity(
  activity: ScheduleActivity,
): ActivityCategory {
  if (activity.isOvernight) {
    return "PERNOITE";
  }

  if (activity.isRest) {
    return "FOLGA";
  }

  const code = normalize(activity.code);
  const type = normalize(activity.type);
  const title = normalize(activity.title);

  if (REST_CODES.has(code) || REST_CODES.has(type)) {
    return "FOLGA";
  }

  const combinedText = `${code} ${type} ${title}`.toLowerCase();

  if (REST_LABELS.some((label) => combinedText.includes(label))) {
    return combinedText.includes("repouso") ? "REPOUSO" : "FOLGA";
  }

  if (
    OPERATIONAL_CODES.has(code) ||
    OPERATIONAL_CODES.has(type) ||
    code.startsWith("LA") ||
    /\b[A-Z]{2}\d{3,4}\b/.test(code)
  ) {
    return "PROGRAMACAO";
  }

  return "DESCONHECIDA";
}

/** Verdadeiro quando a atividade é uma programação operacional (conta no contador). */
export function isOperationalActivity(
  activity: ScheduleActivity,
): boolean {
  return classifyActivity(activity) === "PROGRAMACAO";
}

/** Verdadeiro quando a atividade é algum tipo de descanso (folga ou repouso). */
export function isRestActivity(
  activity: ScheduleActivity,
): boolean {
  const category = classifyActivity(activity);
  return category === "FOLGA" || category === "REPOUSO";
}

/**
 * Verdadeiro quando a atividade deve acionar a Saída Inteligente.
 *
 * Folga, repouso e pernoite sem apresentação operacional NÃO acionam cálculo.
 */
export function shouldCalculateSmartDeparture(
  activity: ScheduleActivity,
): boolean {
  return classifyActivity(activity) === "PROGRAMACAO";
}

/**
 * Conta apenas atividades operacionais.
 *
 * Use SEMPRE esta função em vez de `activities.length`.
 */
export function countOperationalActivities(
  activities: ScheduleActivity[],
): number {
  return activities.filter(isOperationalActivity).length;
}
