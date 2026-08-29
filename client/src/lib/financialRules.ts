import type { CrewRoster } from './pdfParser';
import { getLegalProfile, type CrewRoleSelection } from './actRules';
import {
  ACT_BREAKFAST_PERCENT,
  ACT_DOMESTIC_MAIN_MEAL_BRL,
} from './financialAmounts';

export {
  ACT_BREAKFAST_PERCENT,
  ACT_DOMESTIC_MAIN_MEAL_BRL,
  perDiemSlotAmount,
  roundCurrencyAmount,
} from './financialAmounts';

export type PerDiemCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP';
export type PerDiemRateKey =
  | 'domestic'
  | 'north_america'
  | 'mexico'
  | 'south_america_caribbean'
  | 'argentina'
  | 'chile'
  | 'england'
  | 'europe'
  | 'africa'
  | 'other_international';

export interface PerDiemActRate {
  key: PerDiemRateKey;
  label: string;
  currency: PerDiemCurrency;
  mainMeal: number;
}

export interface SalaryActRates {
  dayKm: number;
  nightKm: number;
  reserveHour: number;
  standbyHour: number;
  excessHour: number;
}

export type ActFinancialFunctionKey =
  | 'cabin'
  | 'cabin_chief'
  | 'pilot_first_officer'
  | 'pilot_commander'
  | 'pilot_embraer_first_officer'
  | 'pilot_embraer_commander'
  | 'unknown';

export interface ActFinancialProfile {
  version: string;
  effectiveFrom: string;
  sourceUrl: string;
  roleLabel: string;
  functionKey: ActFinancialFunctionKey;
  functionLabel: string;
  profileLabel: string;
  legalReference: string;
  salary: SalaryActRates;
  perDiem: PerDiemActRate[];
  breakfastPercent: number;
  requiresManualFunction: boolean;
}

export interface PerDiemClassification {
  kind: 'domestic' | 'international' | 'pending';
  airport: string;
  rateKey: PerDiemRateKey | null;
  confidence: 'alta' | 'baixa';
  reason: string;
}

export type AirportPerDiemOverrides = Record<string, PerDiemRateKey>;

/**
 * ACT LATAM 2025/2027 — valores vigentes a partir de 01/12/2025.
 * A diária nacional de R$ 109,95 é um valor-fonte do SNA e não deve ser
 * recalculada no cliente a partir dos valores históricos de R$ 105,04 ou
 * R$ 109,44. Componentes salariais e diárias internacionais seguem as tabelas
 * segregadas por função auditadas nesta mesma versão.
 */
export const ACT_FINANCIAL_RULES_VERSION = 'ACT-LATAM-2025-2027.2025-12-SNA-109.95';
export const ACT_FINANCIAL_RULES_EFFECTIVE_FROM = '2025-12-01';
export const ACT_FINANCIAL_RULES_SOURCE_URL = 'https://www.aeronautas.org.br/pilotos-e-comissarios-da-latam-aprovam-propostas-de-acts-por-funcao/';

export const ACT_PER_DIEM_RATES: PerDiemActRate[] = [
  { key: 'domestic', label: 'Nacional', currency: 'BRL', mainMeal: ACT_DOMESTIC_MAIN_MEAL_BRL },
  { key: 'north_america', label: 'América do Norte', currency: 'USD', mainMeal: 28.70 },
  { key: 'mexico', label: 'México', currency: 'USD', mainMeal: 23.00 },
  { key: 'south_america_caribbean', label: 'América do Sul e Caribe', currency: 'USD', mainMeal: 21.00 },
  { key: 'argentina', label: 'Argentina', currency: 'USD', mainMeal: 22.05 },
  { key: 'chile', label: 'Chile', currency: 'USD', mainMeal: 25.15 },
  { key: 'england', label: 'Inglaterra', currency: 'GBP', mainMeal: 24.00 },
  { key: 'europe', label: 'Europa', currency: 'EUR', mainMeal: 25.00 },
  { key: 'africa', label: 'África', currency: 'USD', mainMeal: 24.70 },
  { key: 'other_international', label: 'Demais países', currency: 'USD', mainMeal: 21.05 },
];

const CABIN_RATES: SalaryActRates = {
  dayKm: 0.058547,
  nightKm: 0.117095,
  reserveHour: 49.77,
  standbyHour: 16.59,
  excessHour: 49.77,
};

// Chave e objeto próprios: os valores hoje coincidem, mas uma futura tabela de
// chefe de cabine não pode alterar silenciosamente o perfil de comissário.
const CABIN_CHIEF_RATES: SalaryActRates = { ...CABIN_RATES };

const PILOT_RATES: Record<string, SalaryActRates> = {
  first_officer: {
    dayKm: 0.143193,
    nightKm: 0.291202,
    reserveHour: 121.71,
    standbyHour: 40.57,
    excessHour: 121.71,
  },
  commander: {
    dayKm: 0.216028,
    nightKm: 0.432096,
    reserveHour: 183.62,
    standbyHour: 61.20,
    excessHour: 183.62,
  },
  embraer_first_officer: {
    dayKm: 0.065869,
    nightKm: 0.131739,
    reserveHour: 55.99,
    standbyHour: 18.66,
    excessHour: 55.99,
  },
  embraer_commander: {
    dayKm: 0.162021,
    nightKm: 0.324042,
    reserveHour: 137.72,
    standbyHour: 45.90,
    excessHour: 137.72,
  },
};

export const ACT_SALARY_RATES_BY_FUNCTION: Record<Exclude<ActFinancialFunctionKey, 'unknown'>, SalaryActRates> = {
  cabin: CABIN_RATES,
  cabin_chief: CABIN_CHIEF_RATES,
  pilot_first_officer: PILOT_RATES.first_officer,
  pilot_commander: PILOT_RATES.commander,
  pilot_embraer_first_officer: PILOT_RATES.embraer_first_officer,
  pilot_embraer_commander: PILOT_RATES.embraer_commander,
};

const EMPTY_SALARY_RATES: SalaryActRates = {
  dayKm: 0,
  nightKm: 0,
  reserveHour: 0,
  standbyHour: 0,
  excessHour: 0,
};

const BRAZIL_AIRPORTS = new Set([
  'AAX', 'AJU', 'AQA', 'ARU', 'ATM', 'BAU', 'BEL', 'BPS', 'BSB', 'BVB', 'BVH',
  'CAC', 'CAW', 'CGB', 'CGH', 'CGR', 'CKS', 'CLV', 'CNF', 'CPV', 'CWB', 'CXJ',
  'DOU', 'FEN', 'FLN', 'FOR', 'GEL', 'GIG', 'GRU', 'GYN', 'IGU', 'IOS', 'IMP',
  'JDO', 'JJD', 'JOI', 'JPA', 'JPR', 'LDB', 'LEC', 'MAB', 'MAO', 'MCP', 'MCZ',
  'MGF', 'NAT', 'NVT', 'OPS', 'PET', 'PFB', 'PIN', 'PMW', 'PNZ', 'POA', 'PPB',
  'PVH', 'RAO', 'RBR', 'REC', 'RIA', 'SDU', 'SJP', 'SLZ', 'SSA', 'STM', 'TBT',
  'TFF', 'THE', 'UBA', 'UDI', 'VAG', 'VCP', 'VIX', 'XAP',
]);

const INTERNATIONAL_GROUPS: Record<Exclude<PerDiemRateKey, 'domestic' | 'other_international'>, string[]> = {
  north_america: [
    'ATL', 'BOS', 'DFW', 'EWR', 'FLL', 'IAD', 'IAH', 'JFK', 'LAS', 'LAX', 'MCO',
    'MIA', 'ORD', 'SFO', 'YYZ', 'YUL', 'YVR',
  ],
  mexico: ['CUN', 'GDL', 'MEX', 'MTY'],
  south_america_caribbean: [
    'ASU', 'AUA', 'BOG', 'CCS', 'CLO', 'CUR', 'GYE', 'HAV', 'LIM', 'LPB', 'MDE',
    'MVD', 'PTY', 'PUJ', 'UIO', 'SJO', 'SDQ', 'VVI',
  ],
  argentina: ['AEP', 'BRC', 'COR', 'EZE', 'MDZ', 'ROS', 'SLA', 'TUC', 'USH'],
  chile: ['ANF', 'CCP', 'CJC', 'IPC', 'IQQ', 'PUQ', 'SCL', 'ZCO'],
  england: ['BHX', 'LGW', 'LHR', 'MAN'],
  europe: [
    'AMS', 'BCN', 'CDG', 'FCO', 'FRA', 'LIS', 'MAD', 'MXP', 'OPO', 'ORY', 'VCE',
    'ZRH',
  ],
  africa: ['CAI', 'CMN', 'CPT', 'JNB', 'LAD', 'LOS'],
};

const INTERNATIONAL_AIRPORT_RATE = new Map<string, PerDiemRateKey>(
  Object.entries(INTERNATIONAL_GROUPS).flatMap(([key, airports]) =>
    airports.map((airport) => [airport, key as PerDiemRateKey] as const)
  )
);

function normalizeAirport(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function readRegisteredCrewFunction(): string {
  try {
    const storage = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
    if (!storage) return '';
    let email = '';
    try {
      const user = JSON.parse(String(storage.getItem('crewcheck_auth_user') || '{}'));
      email = String(user?.email || '').trim().toLowerCase();
    } catch {}
    if (email) {
      const scoped = String(storage.getItem(`crewcheck_profile_rank:${email}`) || '').trim();
      if (scoped) return scoped;
    }
    return String(storage.getItem('crewcheck_profile_rank') || '').trim();
  } catch {
    return '';
  }
}

function normalizeFunctionLabel(functionLabel: string): string {
  return functionLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function cabinSalaryProfile(functionLabel: string): { key: ActFinancialFunctionKey; label: string; rates: SalaryActRates; manual: boolean } {
  const value = normalizeFunctionLabel(functionLabel);
  const chief = value.includes('chefe') || value.includes('lider') || value.includes('purser') || value.includes('ccm 1');
  return {
    key: chief ? 'cabin_chief' : 'cabin',
    label: chief ? 'Chefe de cabine / Comissário líder' : 'Comissário(a) de voo',
    rates: chief ? CABIN_CHIEF_RATES : CABIN_RATES,
    manual: false,
  };
}

function pilotSalaryProfile(functionLabel: string): { key: ActFinancialFunctionKey; label: string; rates: SalaryActRates; manual: boolean } {
  const value = normalizeFunctionLabel(functionLabel);
  const embraer = value.includes('embraer');
  if (value.includes('comandante')) {
    return {
      key: embraer ? 'pilot_embraer_commander' : 'pilot_commander',
      label: embraer ? 'Comandante Embraer' : 'Comandante',
      rates: embraer ? PILOT_RATES.embraer_commander : PILOT_RATES.commander,
      manual: false,
    };
  }
  if (value.includes('copiloto') || value.includes('primeiro oficial')) {
    return {
      key: embraer ? 'pilot_embraer_first_officer' : 'pilot_first_officer',
      label: embraer ? 'Copiloto Embraer' : 'Copiloto',
      rates: embraer ? PILOT_RATES.embraer_first_officer : PILOT_RATES.first_officer,
      manual: false,
    };
  }
  return { key: 'unknown', label: 'Piloto(a) - função pendente', rates: EMPTY_SALARY_RATES, manual: true };
}

export function resolveActFinancialRules(
  roster: CrewRoster,
  roleSelection: CrewRoleSelection = 'auto'
): ActFinancialProfile {
  const legal = getLegalProfile(roster, roleSelection);
  const registeredFunction = readRegisteredCrewFunction() || legal.functionLabel;
  if (legal.role === 'cabin') {
    const cabin = cabinSalaryProfile(registeredFunction);
    return {
      version: ACT_FINANCIAL_RULES_VERSION,
      effectiveFrom: ACT_FINANCIAL_RULES_EFFECTIVE_FROM,
      sourceUrl: ACT_FINANCIAL_RULES_SOURCE_URL,
      roleLabel: legal.roleLabel,
      functionKey: cabin.key,
      functionLabel: cabin.label,
      profileLabel: cabin.label + ' - ACT 2025/2027',
      legalReference: 'ACT Aeronautas Comissários 2025/2027 - cláusulas 2.4.1, 2.4.2, 3.2.7 e 3.2.8',
      salary: cabin.rates,
      perDiem: ACT_PER_DIEM_RATES,
      breakfastPercent: ACT_BREAKFAST_PERCENT,
      requiresManualFunction: cabin.manual,
    };
  }

  const pilot = pilotSalaryProfile(registeredFunction);
  return {
    version: ACT_FINANCIAL_RULES_VERSION,
    effectiveFrom: ACT_FINANCIAL_RULES_EFFECTIVE_FROM,
    sourceUrl: ACT_FINANCIAL_RULES_SOURCE_URL,
    roleLabel: legal.roleLabel,
    functionKey: pilot.key,
    functionLabel: pilot.label,
    profileLabel: pilot.label + ' - ACT 2025/2027',
    legalReference: 'ACT Aeronautas Pilotos 2025/2027 - cláusulas 2.4.1, 2.4.2, 3.2.7 e 3.2.8',
    salary: pilot.rates,
    perDiem: ACT_PER_DIEM_RATES,
    breakfastPercent: ACT_BREAKFAST_PERCENT,
    requiresManualFunction: pilot.manual,
  };
}

function classifyAirport(
  airport: string,
  overrides: AirportPerDiemOverrides
): PerDiemClassification {
  const normalized = normalizeAirport(airport);
  const override = overrides[normalized];
  if (override) {
    return {
      kind: override === 'domestic' ? 'domestic' : 'international',
      airport: normalized,
      rateKey: override,
      confidence: 'alta',
      reason: 'Classificação manual do usuário/Admin.',
    };
  }
  if (BRAZIL_AIRPORTS.has(normalized)) {
    return {
      kind: 'domestic',
      airport: normalized,
      rateKey: 'domestic',
      confidence: 'alta',
      reason: 'Aeroporto nacional reconhecido.',
    };
  }
  const rateKey = INTERNATIONAL_AIRPORT_RATE.get(normalized);
  if (rateKey) {
    return {
      kind: 'international',
      airport: normalized,
      rateKey,
      confidence: 'alta',
      reason: 'Destino internacional reconhecido na tabela do ACT.',
    };
  }
  return {
    kind: 'pending',
    airport: normalized,
    rateKey: null,
    confidence: 'baixa',
    reason: 'Aeroporto ainda não classificado; nenhum valor foi presumido.',
  };
}

export function resolvePerDiemRule(
  origin?: string | null,
  destination?: string | null,
  overrides: AirportPerDiemOverrides = {}
): PerDiemClassification {
  const from = classifyAirport(normalizeAirport(origin), overrides);
  const to = classifyAirport(normalizeAirport(destination), overrides);

  if (to.kind === 'international') return to;
  if (from.kind === 'international') return from;
  if (from.kind === 'domestic' && to.kind === 'domestic') return to;
  if (to.kind !== 'pending') return to;
  if (from.kind !== 'pending') return from;
  return to.airport ? to : from;
}

export function perDiemRate(
  key: PerDiemRateKey,
  rates: PerDiemActRate[] = ACT_PER_DIEM_RATES
): PerDiemActRate {
  return rates.find((item) => item.key === key)
    || rates.find((item) => item.key === 'other_international')
    || ACT_PER_DIEM_RATES[ACT_PER_DIEM_RATES.length - 1];
}
