/**
 * ATLAS-P0.4 — Dicionário oficial de interface em pt-BR.
 *
 * Centraliza as nomenclaturas oficiais do CrewCheck e substitui termos em
 * inglês que ainda aparecem na interface comum. Termos aeronáuticos
 * reconhecidos (METAR, TAF, NOTAM, ATIS) permanecem.
 *
 * Este módulo é aditivo: convive com o i18n atual em `client/src/lib/i18n.ts`.
 * A migração real (substituir chamadas existentes) fica para o passo de
 * integração, depois da aprovação deste PR.
 */

export const crewCheckLabels = {
  flyDeck: "FlyDeck",
  roster: "Escala",
  routine: "Linha do Dia",
  nextDuty: "Próxima programação",
  smartDeparture: "Saída Inteligente",
  alerts: "Alertas",
  settings: "Preferências",
  nearbyPlaces: "Locais próximos",
  openNow: "Aberto agora",
  closedNow: "Fechado agora",
  viewDetails: "Ver detalhes",
  openMap: "Abrir no mapa",
  calculateRoute: "Traçar rota",
  operationalStatus: "Situação operacional",
  lastUpdated: "Última atualização",
  noSchedule: "Nenhuma programação neste dia",
  restDay: "Folga",
  restPeriod: "Descanso",
  overnight: "Pernoite",
  loading: "Carregando",
  tryAgain: "Tentar novamente",
  temporarilyUnavailable: "Temporariamente indisponível",
} as const;

export type CrewCheckLabelKey = keyof typeof crewCheckLabels;

/** Traduções oficiais que substituem termos em inglês ainda presentes. */
export const crewCheckPtBrReplacements: Record<string, string> = {
  "Roster": "Escala",
  "Routine": "Rotina",
  "Alerts": "Alertas",
  "Next duty": "Próxima programação",
  "Settings": "Preferências",
  "Operational status": "Situação operacional",
  "Nearby places": "Locais próximos",
  "Open now": "Aberto agora",
  "View details": "Ver detalhes",
  "Parser error": "Não foi possível interpretar a escala",
  "API unavailable": "Serviço temporariamente indisponível",
};

/** Mensagens padronizadas de estado (vazio, erro, indisponível). */
export const crewCheckMessages = {
  mapUnavailable: {
    title: "Mapa temporariamente indisponível",
    description:
      "As informações do local continuam disponíveis. Você pode abrir a rota diretamente no aplicativo de mapas.",
  },

  scheduleEmpty: {
    title: "Nenhuma programação neste dia",
    description:
      "Sua escala não possui atividades publicadas para esta data.",
  },

  scheduleParseFailure: {
    title: "Não foi possível interpretar toda a escala",
    description:
      "Revise as atividades apresentadas e tente importar o arquivo novamente.",
  },

  serviceUnavailable: {
    title: "Serviço temporariamente indisponível",
    description:
      "Os últimos dados disponíveis continuam sendo exibidos.",
  },
} as const;

export type CrewCheckMessageKey = keyof typeof crewCheckMessages;

/**
 * Aplica a substituição oficial pt-BR a um texto.
 *
 * Retorna o texto original quando não houver substituição definida.
 * Não toca em siglas aeronáuticas reconhecidas.
 */
export function applyPtBrReplacement(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 90) return text;
  const replacement = crewCheckPtBrReplacements[trimmed];
  return replacement ? text.replace(trimmed, replacement) : text;
}

/** Siglas aeronáuticas reconhecidas que permanecem em pt-BR. */
export const AERONAUTICAL_ACRONYMS: ReadonlySet<string> = new Set([
  "METAR",
  "TAF",
  "NOTAM",
  "ATIS",
  "SIGMET",
  "AIRMET",
  "QNH",
  "QFE",
  "FL",
  "MACH",
  "ILS",
  "VOR",
  "DME",
  "NDB",
  "RNAV",
  "RNP",
  "PBN",
  "CAT",
]);
