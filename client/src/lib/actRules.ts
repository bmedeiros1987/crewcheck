import type { CrewRoster } from './pdfParser';

export type CrewRole = 'cabin' | 'pilot';
export type CrewRoleSelection = CrewRole | 'auto';
export type CrewFunctionKey = 'cabin' | 'cabin_chief' | 'pilot_commander' | 'pilot_first_officer' | 'pilot';
export interface CrewFunctionResolution {
  role: CrewRole | 'auto';
  functionKey: CrewFunctionKey | 'unknown';
  functionLabel: string;
  confidence: RoleConfidence;
  reason: string;
  menuScopes: Array<'cabin' | 'pilot' | 'instructor' | 'admin' | 'all'>;
}
export type AircraftGroup = 'narrowBody' | 'wideBody';
export type RoleConfidence = 'alta' | 'media' | 'baixa';

export interface LegalProfileSummary {
  role: CrewRole;
  roleLabel: string;
  functionLabel: string;
  actName: string;
  actValidity: string;
  confidence: RoleConfidence;
  inferenceReason: string;
  aircraftGroup: AircraftGroup;
  aircraftGroupLabel: string;
  flightLimit28Days: number;
  flightLimit365Days: number;
  dsrReference: string;
  nineDaysOffCompensation: string;
  sourceFiles: string[];
  actSelectionMode?: 'perfil' | 'escala' | 'manual' | 'fallback';
  menuScopes?: Array<'cabin' | 'pilot' | 'instructor' | 'admin' | 'all'>;
  roleAliasesAccepted?: string[];
}

export interface ActRuleSet {
  role: CrewRole;
  roleLabel: string;
  actName: string;
  actValidity: string;
  rankPatterns: RegExp[];
  standby: {
    minHours: number;
    maxHours: number;
    monthlyLimit: number;
    calloutMinutesDefault: number;
    calloutMinutesMultiAirport: number;
    restIfNotCalledHours: number;
    legalReference: string;
  };
  reserve: {
    minHours: number;
    maxHours: number;
    restAccommodationThresholdHours: number;
    legalReference: string;
  };
  groundBetweenLegs: {
    maxDayMinutes: number;
    maxNightMinutes: number;
    dayStart: string;
    nightStart: string;
    legalReference: string;
  };
  nightOps: {
    maxConsecutive: number;
    maxIn168h: number;
    resetAfterFreeHours: number;
    windowStart: string;
    windowEnd: string;
    legalReference: string;
  };
  flightLimits: {
    narrowBody28Days: number;
    narrowBody365Days: number;
    wideBody28Days: number;
    wideBody365Days: number;
    legalReference: string;
  };
  daysOff: {
    mainParameter: number;
    criticalFloor: number;
    narrowDsr: string;
    wideDsr: string;
    nineDaysOffCompensation: Record<string, string>;
    legalReference: string;
  };
  rest: {
    additionalAfterSimpleDutyOverHours: number;
    additionalRestHours: number;
    legalReference: string;
  };
  sourceFile: string;
}

export const ACT_RULES: Record<CrewRole, ActRuleSet> = {
  cabin: {
    role: 'cabin',
    roleLabel: 'Comissário(a)',
    actName: 'ACT Aeronautas Comissários 2025/2027',
    actValidity: '01/12/2025 a 30/11/2027',
    rankPatterns: [/\bCC(M|F|P)?\b/i, /COMISS/i, /CABIN/i, /FLIGHT\s*ATT/i],
    standby: {
      minHours: 3,
      maxHours: 12,
      monthlyLimit: 8,
      calloutMinutesDefault: 90,
      calloutMinutesMultiAirport: 150,
      restIfNotCalledHours: 12,
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.3.11',
    },
    reserve: {
      minHours: 3,
      maxHours: 6,
      restAccommodationThresholdHours: 3,
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.3.12',
    },
    groundBetweenLegs: {
      maxDayMinutes: 180,
      maxNightMinutes: 120,
      dayStart: '05:00',
      nightStart: '22:00',
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.3.13',
    },
    nightOps: {
      maxConsecutive: 2,
      maxIn168h: 4,
      resetAfterFreeHours: 48,
      windowStart: '00:00',
      windowEnd: '06:00',
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.3.14',
    },
    flightLimits: {
      narrowBody28Days: 90,
      narrowBody365Days: 900,
      wideBody28Days: 100,
      wideBody365Days: 1000,
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.3.17',
    },
    daysOff: {
      mainParameter: 10,
      criticalFloor: 9,
      narrowDsr: '22 dias de labor x 8 dias de folga — narrow body',
      wideDsr: '21 dias de labor x 9 dias de folga — wide body',
      nineDaysOffCompensation: { default: 'Comissário de voo: R$ 430,00' },
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusulas 3.4.7, 3.4.8 e 3.4.12',
    },
    rest: {
      additionalAfterSimpleDutyOverHours: 10,
      additionalRestHours: 1,
      legalReference: 'ACT Aeronautas Comissários 2025/2027, cláusula 3.5.3',
    },
    sourceFile: '/legal/ACT-Comissarios-2025-2027.pdf',
  },
  pilot: {
    role: 'pilot',
    roleLabel: 'Piloto(a)',
    actName: 'ACT Aeronautas Pilotos 2025/2027',
    actValidity: '01/12/2025 a 30/11/2027',
    rankPatterns: [/\b(CM|CMD|CMT|CP|FO|F\/O|COP|COPILOTO|COMANDANTE|PILOTO)\b/i],
    standby: {
      minHours: 3,
      maxHours: 12,
      monthlyLimit: 8,
      calloutMinutesDefault: 90,
      calloutMinutesMultiAirport: 150,
      restIfNotCalledHours: 12,
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.3.11',
    },
    reserve: {
      minHours: 3,
      maxHours: 6,
      restAccommodationThresholdHours: 3,
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.3.12',
    },
    groundBetweenLegs: {
      maxDayMinutes: 180,
      maxNightMinutes: 120,
      dayStart: '05:00',
      nightStart: '22:00',
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.3.13',
    },
    nightOps: {
      maxConsecutive: 2,
      maxIn168h: 4,
      resetAfterFreeHours: 48,
      windowStart: '00:00',
      windowEnd: '06:00',
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.3.14',
    },
    flightLimits: {
      narrowBody28Days: 90,
      narrowBody365Days: 900,
      wideBody28Days: 100,
      wideBody365Days: 1000,
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.3.17',
    },
    daysOff: {
      mainParameter: 10,
      criticalFloor: 9,
      narrowDsr: '22 dias de labor x 8 dias de folga — Airbus-A32F e Embraer',
      wideDsr: '21 dias de labor x 9 dias de folga — wide body',
      nineDaysOffCompensation: {
        copiloto: 'Copiloto: R$ 1.000,00',
        comandante: 'Comandante: R$ 2.000,00',
        'copiloto embraer': 'Copiloto Embraer: R$ 1.000,00',
        'comandante embraer': 'Comandante Embraer: R$ 2.000,00',
        default: 'Copiloto: R$ 1.000,00 · Comandante: R$ 2.000,00',
      },
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusulas 3.4.7, 3.4.8 e 3.4.12',
    },
    rest: {
      additionalAfterSimpleDutyOverHours: 10,
      additionalRestHours: 1,
      legalReference: 'ACT Aeronautas Pilotos 2025/2027, cláusula 3.5.3',
    },
    sourceFile: '/legal/ACT-Pilotos-2025-2027.pdf',
  },
};

const ROLE_ALIAS_MAP: Array<{ key: CrewFunctionKey; role: CrewRole; label: string; patterns: RegExp[]; scopes: Array<'cabin' | 'pilot' | 'instructor' | 'admin' | 'all'> }> = [
  {
    key: 'cabin_chief', role: 'cabin', label: 'Chefe de cabine / Comissário líder', scopes: ['cabin', 'all'],
    patterns: [/\bCHEFE\s+DE\s+CABINE\b/i, /\bCHEFE\b/i, /\bL[IÍ]DER\s+DE\s+CABINE\b/i, /\bPUR(SER)?\b/i, /\bSENIOR\s+CABIN\b/i, /\bCCM\s*1\b/i]
  },
  {
    key: 'cabin', role: 'cabin', label: 'Comissário(a) de voo', scopes: ['cabin', 'all'],
    patterns: [/\bCCM\b/i, /\bCC\b/i, /\bCCF\b/i, /\bCMS\b/i, /\bCOMISS[AÁ]RI[OA]\b/i, /\bCOMISSARIO\b/i, /\bCOMISSARIA\b/i, /\bCABIN\s*CREW\b/i, /\bFLIGHT\s*ATT(ENDANT)?\b/i, /\bTRIPULANTE\s+DE\s+CABINE\b/i]
  },
  {
    key: 'pilot_commander', role: 'pilot', label: 'Comandante', scopes: ['pilot', 'all'],
    patterns: [/\bCOMANDANTE\b/i, /\bCMTE\b/i, /\bCMT\b/i, /\bCMD\b/i, /\bCAPT?\b/i, /\bCAPTAIN\b/i, /\bCP\b/i, /\bP1\b/i]
  },
  {
    key: 'pilot_first_officer', role: 'pilot', label: 'Copiloto / Primeiro Oficial', scopes: ['pilot', 'all'],
    patterns: [/\bCOPILOTO\b/i, /\bCO\s*PILOTO\b/i, /\bCO-PILOTO\b/i, /\bFO\b/i, /\bF\/O\b/i, /\bFIRST\s*OFFICER\b/i, /\bSIC\b/i, /\bP2\b/i, /\bCP2\b/i]
  },
  {
    key: 'pilot', role: 'pilot', label: 'Piloto(a)', scopes: ['pilot', 'all'],
    patterns: [/\bPILOTO\b/i, /\bPILOT\b/i, /\bTRIPULANTE\s+DE\s+VOO\b/i, /\bFLIGHT\s*CREW\b/i]
  },
];

const ROLE_ALIASES_ACCEPTED = [
  'CC', 'CCM', 'CCF', 'CMS', 'Comissário(a)', 'Comissário de voo', 'Chefe de cabine', 'Líder de cabine', 'Purser', 'Cabin Crew', 'Flight Attendant',
  'Piloto', 'Comandante', 'CMTE', 'CMT', 'CMD', 'CP', 'Captain', 'Copiloto', 'FO', 'F/O', 'First Officer', 'P1', 'P2'
];

function normalizeRoleSource(value?: string | null): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').toUpperCase().trim();
}

export function resolveCrewFunction(value?: string | null): CrewFunctionResolution {
  const text = normalizeRoleSource(value);
  if (!text) return { role: 'auto', functionKey: 'unknown', functionLabel: 'Função não informada', confidence: 'baixa', reason: 'Função não preenchida no perfil; o CrewCheck vai tentar detectar pela escala.', menuScopes: ['all'] };
  const found = ROLE_ALIAS_MAP.find((item) => item.patterns.some((pattern) => pattern.test(text)));
  if (found) {
    return { role: found.role, functionKey: found.key, functionLabel: found.label, confidence: 'alta', reason: `Função definida no perfil: ${value}.`, menuScopes: found.scopes };
  }
  return { role: 'auto', functionKey: 'unknown', functionLabel: value || 'Função não informada', confidence: 'baixa', reason: `A função do perfil (${value}) não foi reconhecida com segurança; o CrewCheck vai tentar detectar pela escala.`, menuScopes: ['all'] };
}

export function crewRoleSelectionFromFunction(value?: string | null): CrewRoleSelection {
  const resolved = resolveCrewFunction(value);
  return resolved.role === 'cabin' || resolved.role === 'pilot' ? resolved.role : 'auto';
}

function readStoredProfileFunction(): string {
  try {
    const storage = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
    if (!storage) return '';
    return String(storage.getItem('crewcheck_profile_rank') || storage.getItem('crewcheck_profile_function') || storage.getItem('crewcheck_role_selection_label') || '').trim();
  } catch { return ''; }
}


export function getLegalProfile(roster: CrewRoster, selection: CrewRoleSelection = 'auto'): LegalProfileSummary {
  const { role, confidence, reason } = inferCrewRole(roster, selection);
  const rule = ACT_RULES[role];
  const aircraftGroup = inferAircraftGroup(roster);
  const functionResolution = resolveCrewFunction(readStoredProfileFunction());
  const functionLabel = functionResolution.role === role && functionResolution.functionKey !== 'unknown' ? functionResolution.functionLabel : inferFunctionLabel(roster, role);
  const flightLimit28Days = aircraftGroup === 'wideBody' ? rule.flightLimits.wideBody28Days : rule.flightLimits.narrowBody28Days;
  const flightLimit365Days = aircraftGroup === 'wideBody' ? rule.flightLimits.wideBody365Days : rule.flightLimits.narrowBody365Days;
  const compensation = compensationForFunction(rule, functionLabel);

  return {
    role,
    roleLabel: rule.roleLabel,
    functionLabel,
    actName: rule.actName,
    actValidity: rule.actValidity,
    confidence,
    inferenceReason: reason,
    aircraftGroup,
    aircraftGroupLabel: aircraftGroup === 'wideBody' ? 'Wide Body' : 'Narrow Body / A32F / Embraer',
    flightLimit28Days,
    flightLimit365Days,
    dsrReference: aircraftGroup === 'wideBody' ? rule.daysOff.wideDsr : rule.daysOff.narrowDsr,
    nineDaysOffCompensation: compensation,
    sourceFiles: [rule.sourceFile],
    actSelectionMode: reason.includes('perfil') || reason.includes('Perfil') ? 'perfil' : selection === 'auto' ? (confidence === 'baixa' ? 'fallback' : 'escala') : 'manual',
    menuScopes: functionResolution.role === role ? functionResolution.menuScopes : [role, 'all'],
    roleAliasesAccepted: ROLE_ALIASES_ACCEPTED,
  };
}

export function getActRulesForProfile(profile: LegalProfileSummary): ActRuleSet {
  return ACT_RULES[profile.role];
}

export function inferCrewRole(roster: CrewRoster, selection: CrewRoleSelection = 'auto'): { role: CrewRole; confidence: RoleConfidence; reason: string } {
  if (selection === 'cabin') return { role: 'cabin', confidence: 'alta', reason: 'Função selecionada manualmente: Comissário(a).' };
  if (selection === 'pilot') return { role: 'pilot', confidence: 'alta', reason: 'Função selecionada manualmente: Piloto(a).' };

  const profileFunction = resolveCrewFunction(readStoredProfileFunction());
  if (selection === 'auto' && (profileFunction.role === 'cabin' || profileFunction.role === 'pilot')) {
    return { role: profileFunction.role, confidence: profileFunction.confidence, reason: `${profileFunction.reason} ACT aplicada automaticamente pelo perfil para evitar erro de cálculo.` };
  }

  const text = `${roster.rank || ''} ${roster.rawText || ''} ${roster.crewName || ''}`.toUpperCase();
  const rankOnly = `${roster.rank || ''}`.toUpperCase();
  const rosterFunction = resolveCrewFunction(roster.rank || '');
  if (rosterFunction.role === 'cabin' || rosterFunction.role === 'pilot') {
    return { role: rosterFunction.role, confidence: 'alta', reason: `Identificado pelo código de função da escala: ${roster.rank || rosterFunction.functionLabel}.` };
  }

  if (ACT_RULES.cabin.rankPatterns.some(pattern => pattern.test(rankOnly))) {
    return { role: 'cabin', confidence: 'alta', reason: `Identificado pelo código de função da escala: ${roster.rank || 'CC'}.` };
  }
  if (ACT_RULES.pilot.rankPatterns.some(pattern => pattern.test(rankOnly))) {
    return { role: 'pilot', confidence: 'alta', reason: `Identificado pelo código de função da escala: ${roster.rank || 'piloto'}.` };
  }
  if (/\b(CC|COMISS|CABIN|FLIGHT\s*ATT)\b/.test(text)) {
    return { role: 'cabin', confidence: 'media', reason: 'Foram encontrados indícios textuais de comissário na escala.' };
  }
  if (/\b(COMANDANTE|COPILOTO|PILOTO|CAPTAIN|FIRST\s*OFFICER|\bFO\b|\bCM\b|\bCP\b)\b/.test(text)) {
    return { role: 'pilot', confidence: 'media', reason: 'Foram encontrados indícios textuais de piloto na escala.' };
  }

  return { role: 'cabin', confidence: 'baixa', reason: 'A função não ficou clara no PDF; o sistema aplicou ACT de comissários por padrão. Confirme manualmente se for piloto.' };
}

function inferFunctionLabel(roster: CrewRoster, role: CrewRole): string {
  const stored = resolveCrewFunction(readStoredProfileFunction());
  if (stored.role === role && stored.functionKey !== 'unknown') return stored.functionLabel;
  const source = normalizeRoleSource(`${roster.rank || ''} ${roster.rawText || ''}`);
  const rosterFunction = resolveCrewFunction(source);
  if (rosterFunction.role === role && rosterFunction.functionKey !== 'unknown') return rosterFunction.functionLabel;
  if (role === 'cabin') return 'Comissário(a) de voo';
  if (/COMANDANTE\s+EMBRAER|CMD\s*E|CMT\s*E|CMTE\s*E/.test(source)) return 'Comandante Embraer';
  if (/COPILOTO\s+EMBRAER|FO\s*E|F\/O\s*E/.test(source)) return 'Copiloto Embraer';
  if (/COMANDANTE|\bCMTE\b|\bCMD\b|\bCMT\b|CAPTAIN|\bCP\b/.test(source)) return 'Comandante';
  if (/COPILOTO|\bFO\b|F\/O|FIRST\s*OFFICER/.test(source)) return 'Copiloto';
  return 'Piloto(a)';
}

function inferAircraftGroup(roster: CrewRoster): AircraftGroup {
  const allAircraft = roster.days.flatMap(day => day.legs || []).map(leg => String(leg.aircraftType || '')).join(' ').toUpperCase();
  const allText = `${allAircraft} ${roster.rawText || ''}`.toUpperCase();
  if (/\b(330|332|333|339|350|351|359|777|773|787|789|767|76W|WB|WIDE)\b/.test(allText)) return 'wideBody';
  return 'narrowBody';
}

function compensationForFunction(rule: ActRuleSet, functionLabel: string): string {
  const normalized = functionLabel.toLowerCase();
  const direct = rule.daysOff.nineDaysOffCompensation[normalized];
  return direct || rule.daysOff.nineDaysOffCompensation.default;
}
