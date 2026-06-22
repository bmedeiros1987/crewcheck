import type { CrewRoster } from './pdfParser';

export type CrewRole = 'cabin' | 'pilot';
export type CrewRoleSelection = CrewRole | 'auto';
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
    actName: 'ACT SNA/TAM Aeronautas Comissários 2025/2027',
    actValidity: '01/12/2025 a 30/11/2027',
    rankPatterns: [/\bCC(M|F|P)?\b/i, /COMISS/i, /CABIN/i, /FLIGHT\s*ATT/i],
    standby: {
      minHours: 3,
      maxHours: 12,
      monthlyLimit: 8,
      calloutMinutesDefault: 90,
      calloutMinutesMultiAirport: 150,
      restIfNotCalledHours: 12,
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.3.11',
    },
    reserve: {
      minHours: 3,
      maxHours: 6,
      restAccommodationThresholdHours: 3,
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.3.12',
    },
    groundBetweenLegs: {
      maxDayMinutes: 180,
      maxNightMinutes: 120,
      dayStart: '05:00',
      nightStart: '22:00',
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.3.13',
    },
    nightOps: {
      maxConsecutive: 2,
      maxIn168h: 4,
      resetAfterFreeHours: 48,
      windowStart: '00:00',
      windowEnd: '06:00',
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.3.14',
    },
    flightLimits: {
      narrowBody28Days: 90,
      narrowBody365Days: 900,
      wideBody28Days: 100,
      wideBody365Days: 1000,
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.3.17',
    },
    daysOff: {
      mainParameter: 10,
      criticalFloor: 9,
      narrowDsr: '22 dias de labor x 8 dias de folga — narrow body',
      wideDsr: '21 dias de labor x 9 dias de folga — wide body',
      nineDaysOffCompensation: { default: 'Comissário de voo: R$ 430,00' },
      legalReference: 'ACT Comissários 2025/2027, cláusulas 3.4.7, 3.4.8 e 3.4.12',
    },
    rest: {
      additionalAfterSimpleDutyOverHours: 10,
      additionalRestHours: 1,
      legalReference: 'ACT Comissários 2025/2027, cláusula 3.5.3',
    },
    sourceFile: '/legal/ACT-Comissarios-2025-2027.pdf',
  },
  pilot: {
    role: 'pilot',
    roleLabel: 'Piloto(a)',
    actName: 'ACT SNA/TAM Aeronautas Pilotos 2025/2027',
    actValidity: '01/12/2025 a 30/11/2027',
    rankPatterns: [/\b(CM|CMD|CMT|CP|FO|F\/O|COP|COPILOTO|COMANDANTE|PILOTO)\b/i],
    standby: {
      minHours: 3,
      maxHours: 12,
      monthlyLimit: 8,
      calloutMinutesDefault: 90,
      calloutMinutesMultiAirport: 150,
      restIfNotCalledHours: 12,
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.3.11',
    },
    reserve: {
      minHours: 3,
      maxHours: 6,
      restAccommodationThresholdHours: 3,
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.3.12',
    },
    groundBetweenLegs: {
      maxDayMinutes: 180,
      maxNightMinutes: 120,
      dayStart: '05:00',
      nightStart: '22:00',
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.3.13',
    },
    nightOps: {
      maxConsecutive: 2,
      maxIn168h: 4,
      resetAfterFreeHours: 48,
      windowStart: '00:00',
      windowEnd: '06:00',
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.3.14',
    },
    flightLimits: {
      narrowBody28Days: 90,
      narrowBody365Days: 900,
      wideBody28Days: 100,
      wideBody365Days: 1000,
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.3.17',
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
      legalReference: 'ACT Pilotos 2025/2027, cláusulas 3.4.7, 3.4.8 e 3.4.12',
    },
    rest: {
      additionalAfterSimpleDutyOverHours: 10,
      additionalRestHours: 1,
      legalReference: 'ACT Pilotos 2025/2027, cláusula 3.5.3',
    },
    sourceFile: '/legal/ACT-Pilotos-2025-2027.pdf',
  },
};

export function getLegalProfile(roster: CrewRoster, selection: CrewRoleSelection = 'auto'): LegalProfileSummary {
  const { role, confidence, reason } = inferCrewRole(roster, selection);
  const rule = ACT_RULES[role];
  const aircraftGroup = inferAircraftGroup(roster);
  const functionLabel = inferFunctionLabel(roster, role);
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
  };
}

export function getActRulesForProfile(profile: LegalProfileSummary): ActRuleSet {
  return ACT_RULES[profile.role];
}

export function inferCrewRole(roster: CrewRoster, selection: CrewRoleSelection = 'auto'): { role: CrewRole; confidence: RoleConfidence; reason: string } {
  if (selection === 'cabin') return { role: 'cabin', confidence: 'alta', reason: 'Função selecionada manualmente: Comissário(a).' };
  if (selection === 'pilot') return { role: 'pilot', confidence: 'alta', reason: 'Função selecionada manualmente: Piloto(a).' };

  const text = `${roster.rank || ''} ${roster.rawText || ''} ${roster.crewName || ''}`.toUpperCase();
  const rankOnly = `${roster.rank || ''}`.toUpperCase();

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
  const source = `${roster.rank || ''} ${roster.rawText || ''}`.toUpperCase();
  if (role === 'cabin') return 'Comissário de voo';
  if (/COMANDANTE\s+EMBRAER|CMD\s*E|CMT\s*E/.test(source)) return 'Comandante Embraer';
  if (/COPILOTO\s+EMBRAER|CP\s*E|FO\s*E/.test(source)) return 'Copiloto Embraer';
  if (/COMANDANTE|\bCM\b|\bCMD\b|\bCMT\b|CAPTAIN/.test(source)) return 'Comandante';
  if (/COPILOTO|\bCP\b|\bFO\b|FIRST\s*OFFICER/.test(source)) return 'Copiloto';
  return 'Piloto';
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
