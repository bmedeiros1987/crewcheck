import type { CrewRoster } from './pdfParser';
import { getLegalProfile, type CrewRoleSelection } from './actRules';

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

export interface ActFinancialProfile {
  version: string;
  roleLabel: string;
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

export const ACT_FINANCIAL_RULES_VERSION = 'ACT-LATAM-2025-2027.1';

export const ACT_PER_DIEM_RATES: PerDiemActRate[] = [
  { key: 'domestic', label: 'Nacional', currency: 'BRL', mainMeal: 105.04 },
  { key: 'north_america', label: 'América do Norte', currency: 'USD', mainMeal: 25.70 },
  { key: 'mexico', label: 'México', currency: 'USD', mainMeal: 23.00 },
  { key: 'south_america_caribbean', label: 'América do Sul e Caribe', currency: 'USD', mainMeal: 21.00 },
  { key: 'argentina', label: 'Argentina', currency: 'USD', mainMeal: 22.05 },
  { key: 'chile', label: 'Chile', currency: 'USD', mainMeal: 25.15 },
  { key: 'england', label: 'Inglaterra', currency: 'GBP', mainMeal: 24.00 },
  { key: 'europe', label: 'Europa', currency: 'EUR', mainMeal: 23.00 },
  { key: 'africa', label: 'África', currency: 'USD', mainMeal: 24.70 },
  { key: 'other_international', label: 'Demais países', currency: 'USD', mainMeal: 21.05 },
];

const CABIN_RATES: SalaryActRates = {
  dayKm: 0.057349,
  nightKm: 0.114698,
  reserveHour: 48.75,
  standbyHour: 16.25,
  excessHour: 48.75,
};

const PILOT_RATES: Record<string, SalaryActRates> = {
  first_officer: {
    dayKm: 0.140262,
    nightKm: 0.285240,
    reserveHour: 119.22,
    standbyHour: 39.74,
    excessHour: 119.22,
  },
  commander: {
    dayKm: 0.211605,
    nightKm: 0.423250,
    reserveHour: 179.86,
    standbyHour: 59.95,
    excessHour: 179.86,
  },
  embraer_first_officer: {
    dayKm: 0.064521,
    nightKm: 0.129042,
    reserveHour: 54.84,
    standbyHour: 18.28,
    excessHour: 54.84,
  },
  embraer_commander: {
    dayKm: 0.158704,
    nightKm: 0.317408,
    reserveHour: 134.90,
    standbyHour: 44.96,
    excessHour: 134.90,
  },
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

function pilotSalaryProfile(functionLabel: string): { label: string; rates: SalaryActRates; manual: boolean } {
  const value = functionLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const embraer = value.includes('embraer');
  if (value.includes('comandante')) {
    return {
      label: embraer ? 'Comandante Embraer' : 'Comandante',
      rates: embraer ? PILOT_RATES.embraer_commander : PILOT_RATES.commander,
      manual: false,
    };
  }
  if (value.includes('copiloto') || value.includes('primeiro oficial')) {
    return {
      label: embraer ? 'Copiloto Embraer' : 'Copiloto',
      rates: embraer ? PILOT_RATES.embraer_first_officer : PILOT_RATES.first_officer,
      manual: false,
    };
  }
  return { label: 'Piloto(a) - função pendente', rates: EMPTY_SALARY_RATES, manual: true };
}

export function resolveActFinancialRules(
  roster: CrewRoster,
  roleSelection: CrewRoleSelection = 'auto'
): ActFinancialProfile {
  const legal = getLegalProfile(roster, roleSelection);
  if (legal.role === 'cabin') {
    return {
      version: ACT_FINANCIAL_RULES_VERSION,
      roleLabel: legal.roleLabel,
      functionLabel: legal.functionLabel,
      profileLabel: 'Comissário(a) - ACT 2025/2027',
      legalReference: 'ACT Aeronautas Comissários 2025/2027 - cláusulas 2.4.1, 2.4.2, 3.2.7 e 3.2.8',
      salary: CABIN_RATES,
      perDiem: ACT_PER_DIEM_RATES,
      breakfastPercent: 0.25,
      requiresManualFunction: false,
    };
  }

  const pilot = pilotSalaryProfile(legal.functionLabel);
  return {
    version: ACT_FINANCIAL_RULES_VERSION,
    roleLabel: legal.roleLabel,
    functionLabel: pilot.label,
    profileLabel: pilot.label + ' - ACT 2025/2027',
    legalReference: 'ACT Aeronautas Pilotos 2025/2027 - cláusulas 2.4.1, 2.4.2, 3.2.7 e 3.2.8',
    salary: pilot.rates,
    perDiem: ACT_PER_DIEM_RATES,
    breakfastPercent: 0.25,
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
