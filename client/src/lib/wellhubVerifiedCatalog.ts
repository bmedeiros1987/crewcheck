export type WellhubPlan =
  | 'digital'
  | 'starter'
  | 'basic'
  | 'basic-plus'
  | 'silver'
  | 'silver-plus'
  | 'gold'
  | 'gold-plus'
  | 'platinum'
  | 'diamond'
  | 'diamond-plus';

export type WellhubVerifiedPartner = {
  id: string;
  name: string;
  chain: string;
  city: string;
  state: string;
  country: 'BR';
  address: string;
  minimumPlan: WellhubPlan;
  rating?: number;
  reviewCount?: number;
  openingHours: string[];
  is24Hours?: boolean;
  accessNote?: string;
  source: 'wellhub-public-directory';
  sourceUrl: string;
  verifiedAt: string;
};

export const WELLHUB_PLAN_OPTIONS: Array<{ value: WellhubPlan; label: string }> = [
  { value: 'digital', label: 'Digital' },
  { value: 'starter', label: 'Starter' },
  { value: 'basic', label: 'Basic' },
  { value: 'basic-plus', label: 'Basic+' },
  { value: 'silver', label: 'Silver' },
  { value: 'silver-plus', label: 'Silver+' },
  { value: 'gold', label: 'Gold' },
  { value: 'gold-plus', label: 'Gold+' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'diamond-plus', label: 'Diamond+' },
];

const PLAN_RANK = new Map<WellhubPlan, number>(WELLHUB_PLAN_OPTIONS.map((item, index) => [item.value, index]));
const VERIFIED_AT = '2026-08-25';

// Snapshot inicial composto exclusivamente por páginas públicas oficiais do Wellhub.
// Não use Google Maps, nome da rede ou proximidade para inferir parceria ou plano.
export const WELLHUB_VERIFIED_PARTNERS: WellhubVerifiedPartner[] = [
  {
    id: 'gavioes-vila-augusta-guarulhos',
    name: 'Academia Gaviões 24h - Vila Augusta',
    chain: 'Academia Gaviões',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Av. Guarulhos, 1335 - Vila Augusta, Guarulhos - SP, 07025-000, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.77,
    reviewCount: 838,
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/academia-gavioes-24h-vila-augusta-vila-augusta/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'gavioes-vila-galvao-guarulhos',
    name: 'Academia Gaviões - Vila Galvão',
    chain: 'Academia Gaviões',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Av. Emílio Ribas, 3143 - Vila Galvao, Guarulhos - SP, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.85,
    reviewCount: 2793,
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/academia-gavioes-vila-galvao-vila-galvao-guarulhos/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'gavioes-cumbica-guarulhos',
    name: 'Academia Gaviões 24h - Cumbica',
    chain: 'Academia Gaviões',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Rua Porto Velho, 825 - Jardim Cumbica, Guarulhos - SP, 07240-060, Brasil',
    minimumPlan: 'basic-plus',
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/academia-gavioes-24h-cumbica-jardim-cumbica/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'gavioes-pimentas-guarulhos',
    name: 'Academia Gaviões 24h - Pimentas',
    chain: 'Academia Gaviões',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Estr. Pres. Juscelino K. de Oliveira, 1932 - Jardim Albertina, Guarulhos - SP, 07252-000, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.89,
    reviewCount: 3375,
    openingHours: ['Seg-Ter 00:00-23:59', 'Qua-Dom encerramento entre 23:57 e 23:58 conforme diretório'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/academia-gavioes-24h-pimentas-agua-chata/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'gavioes-aeroporto-sao-paulo',
    name: 'Academia Gaviões - Aeroporto',
    chain: 'Academia Gaviões',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'Av. Dr. Lino de Moraes Leme, 1138 - Vila Alexandria, São Paulo - SP, 04360-000, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.8,
    reviewCount: 4609,
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/academia-gavioes-aeroporto-sao-paulo/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'panobianco-guarulhos-macedo',
    name: 'Panobianco - Guarulhos',
    chain: 'Panobianco',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'R. Claudino Barbosa, 266 - Macedo, Guarulhos - SP, 07113-040, Brasil',
    minimumPlan: 'basic',
    rating: 4.82,
    reviewCount: 911,
    openingHours: ['Seg-Qui 05:00-23:00', 'Sex 05:00-22:00', 'Sáb-Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/panobianco-guarulhos-macedo-guarulhos/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'panobianco-registro-centro',
    name: 'Panobianco Registro',
    chain: 'Panobianco',
    city: 'Registro',
    state: 'SP',
    country: 'BR',
    address: 'R. Tamekishi Takano, 127 - Centro, Registro - SP, 11900-000, Brasil',
    minimumPlan: 'basic',
    openingHours: ['Seg-Sex 05:00-23:00', 'Sáb 08:00-17:00', 'Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/panobianco-registro-centro/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'panobianco-lajeado-sao-paulo',
    name: 'Panobianco - Lajeado',
    chain: 'Panobianco',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'R. Prof. Cosme Deodato Tadeu, 477 - Guaianases, São Paulo - SP, 08450-435, Brasil',
    minimumPlan: 'basic',
    rating: 4.88,
    reviewCount: 447,
    openingHours: ['Seg-Sex 05:00-23:59', 'Sáb 08:00-18:00', 'Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/panobianco-lajeado-guaianases/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'panobianco-glicerio-campinas',
    name: 'Panobianco - Glicério',
    chain: 'Panobianco',
    city: 'Campinas',
    state: 'SP',
    country: 'BR',
    address: 'Av. Francisco Glicério, 964 - Centro, Campinas - SP, 13012-100, Brasil',
    minimumPlan: 'basic',
    rating: 4.67,
    reviewCount: 1196,
    openingHours: ['Seg-Sex 06:00-22:00', 'Sáb-Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/5WnPVYZZfGIVB5fuLtyh0OoCyRp4GZ94dq37Iv4rue_QYl2fmxCE_3iwF0WxTsuJ/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-guarulhos-macedo',
    name: 'SkyFit Academia - Guarulhos',
    chain: 'SkyFit',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Av. Paulo Faccini, 1939 - Macedo, Guarulhos - SP, 07111-000, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.76,
    reviewCount: 2058,
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/skyfit-academia-guarulhos-guarulhos/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-ponte-grande-guarulhos',
    name: 'SkyFit Academia - Ponte Grande GRU',
    chain: 'SkyFit',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'Av. Guarulhos, 4351 - Pte. Grande, Guarulhos - SP, 07031-001, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.73,
    reviewCount: 445,
    openingHours: ['Seg-Sex 05:00-23:00', 'Sáb 08:00-16:00', 'Dom 09:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/skyfit-academia-ponte-grande-gru-ponte-grande/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-aeroporto-gru',
    name: 'SKYFIT ACADEMIA AEROPORTO GRU',
    chain: 'SkyFit',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'R. Interna do Aeroporto Internacional de Guarulhos, 1103 - Aeroporto, Guarulhos - SP, 07190-100, Brasil',
    minimumPlan: 'silver-plus',
    rating: 4.95,
    reviewCount: 113,
    openingHours: ['Seg-Dom 00:00-23:59'],
    is24Hours: true,
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/skyfit-academia-aeroporto-gru-aeroporto/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-vila-augusta-guarulhos',
    name: 'SkyFit Academia - Vila Augusta',
    chain: 'SkyFit',
    city: 'Guarulhos',
    state: 'SP',
    country: 'BR',
    address: 'R. Prof. Ferreira Paulino, 357 - Vila Augusta, Guarulhos - SP, 07025-020, Brasil',
    minimumPlan: 'basic-plus',
    openingHours: ['Seg-Sex 05:00-23:00', 'Sáb 08:00-17:00', 'Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/skyfit-academia-vila-augusta/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-se-sao-paulo',
    name: 'SKYFIT ACADEMIA - SÉ',
    chain: 'SkyFit',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'Praça da Sé, 250 - Sé, São Paulo - SP, 01001-001, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.85,
    reviewCount: 1140,
    openingHours: ['Seg-Sex 05:30-22:00', 'Sáb 09:00-17:00', 'Dom 09:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/skyfit-academia-se-se/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'skyfit-cisper-sao-paulo',
    name: 'Skyfit Cisper',
    chain: 'SkyFit',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'Av. Olavo Egídio de Souza Aranha, 663 - Parque Cisper, São Paulo - SP, 03822-000, Brasil',
    minimumPlan: 'basic-plus',
    rating: 4.85,
    reviewCount: 1398,
    openingHours: ['Seg-Sex 05:00-23:00', 'Sáb 08:00-17:00', 'Dom 08:00-14:00'],
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/365a271d-2b86-4d4d-be7e-dcd2e8cc95a1/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'bodytech-brooklin-guararapes',
    name: 'Bodytech - Brooklin Guararapes',
    chain: 'Bodytech',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'R. Guararapes, 201 - Brooklin, São Paulo - SP, Brasil',
    minimumPlan: 'gold-plus',
    rating: 4.77,
    reviewCount: 916,
    openingHours: ['Seg-Sex 05:30-22:00', 'Sáb 08:00-15:00', 'Dom 10:00-14:00'],
    accessNote: 'Algumas atividades podem exigir plano superior. Consulte a unidade na fonte oficial.',
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/bodytech-brooklin-guararapes-brooklin-sao-paulo/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'bodytech-morumbi-market-place',
    name: 'Bodytech - Morumbi Market Place',
    chain: 'Bodytech',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'Av. Dr. Chucri Zaidan, 902 - Vila Cordeiro, São Paulo - SP, 04795-100, Brasil',
    minimumPlan: 'silver',
    openingHours: ['Seg-Sex 06:00-22:00', 'Sáb-Dom 09:00-15:00'],
    accessNote: 'A entrada na unidade consta a partir do Silver; atividades específicas podem exigir plano superior.',
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/bodytech-morumbi-market-place/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'bodytech-pinheiros-eldorado',
    name: 'Bodytech - Pinheiros Eldorado',
    chain: 'Bodytech',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'Av. Rebouças, 3970 - Pinheiros, São Paulo - SP, 05402-600, Brasil',
    minimumPlan: 'silver',
    openingHours: ['Seg-Sex 06:00-22:00', 'Sáb-Dom 09:00-17:00'],
    accessNote: 'A entrada na unidade consta a partir do Silver; atividades específicas podem exigir plano superior.',
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/-rhg7kswayQMdVHKFV09ISYcR6zJRy1IdjYfF98UftsyK8fEHSEkXZpNb7JsziEC/',
    verifiedAt: VERIFIED_AT,
  },
  {
    id: 'bodytech-jardins-consolacao',
    name: 'Bodytech - Jardins Consolação',
    chain: 'Bodytech',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    address: 'R. da Consolação, 2960 - Cerqueira César, São Paulo - SP, 01416-000, Brasil',
    minimumPlan: 'silver',
    openingHours: ['Seg-Sex 06:00-22:00', 'Sáb-Dom 09:00-15:00'],
    accessNote: 'A entrada na unidade consta a partir do Silver; atividades específicas podem exigir plano superior.',
    source: 'wellhub-public-directory',
    sourceUrl: 'https://wellhub.com/pt-br/search/partners/941b6ce6-9491-4fdd-b1e0-d241768b43bd/',
    verifiedAt: VERIFIED_AT,
  },
];

function normalize(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isWellhubPlan(value: unknown): value is WellhubPlan {
  return PLAN_RANK.has(String(value || '') as WellhubPlan);
}

export function wellhubPlanLabel(plan: WellhubPlan): string {
  return WELLHUB_PLAN_OPTIONS.find((item) => item.value === plan)?.label || plan;
}

export function isWellhubPartnerEligible(minimumPlan: WellhubPlan, userPlan: WellhubPlan): boolean {
  return (PLAN_RANK.get(userPlan) ?? -1) >= (PLAN_RANK.get(minimumPlan) ?? Number.MAX_SAFE_INTEGER);
}

function localityScore(partner: WellhubVerifiedPartner, locationText: string): number {
  const location = normalize(locationText);
  if (!location) return 0;
  const city = normalize(partner.city);
  const state = normalize(partner.state);
  const address = normalize(partner.address);
  let score = 0;
  if (city && location.includes(city)) score += 100;
  if (state && new RegExp(`(^| )${state}( |$)`).test(location)) score += 10;
  const neighborhoodTokens = address.split(' ').filter((token) => token.length >= 5);
  if (neighborhoodTokens.some((token) => location.includes(token))) score += 5;
  return score;
}

export function searchVerifiedWellhubPartners(options: {
  userPlan: WellhubPlan;
  query?: string;
  locationText?: string;
  limit?: number;
}): WellhubVerifiedPartner[] {
  const query = normalize(options.query);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 50)));
  return WELLHUB_VERIFIED_PARTNERS
    .filter((partner) => isWellhubPartnerEligible(partner.minimumPlan, options.userPlan))
    .filter((partner) => {
      if (!query) return true;
      const haystack = normalize([partner.name, partner.chain, partner.city, partner.state, partner.address].join(' '));
      return query.split(' ').filter(Boolean).every((token) => haystack.includes(token));
    })
    .sort((a, b) => localityScore(b, options.locationText || '') - localityScore(a, options.locationText || '')
      || Number(b.is24Hours === true) - Number(a.is24Hours === true)
      || Number(b.rating || 0) - Number(a.rating || 0)
      || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, limit);
}

export function verifiedWellhubPartnerFromPlaceId(placeId: unknown): WellhubVerifiedPartner | null {
  const id = String(placeId || '').replace(/^wellhub:/, '');
  return WELLHUB_VERIFIED_PARTNERS.find((partner) => partner.id === id) || null;
}
