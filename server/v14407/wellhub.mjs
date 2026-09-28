import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CATALOG_PATH = path.join(ROOT, 'client/src/lib/wellhubVerifiedCatalog.ts');
const OFFICIAL_HOST = 'wellhub.com';
const OFFICIAL_CACHE_TTL_MS = 12 * 60 * 60_000;
const officialPageCache = new Map();

export const WELLHUB_PLAN_ORDER = [
  'digital', 'starter', 'basic', 'basic-plus', 'silver', 'silver-plus',
  'gold', 'gold-plus', 'platinum', 'diamond', 'diamond-plus',
];

const PLAN_LABELS = {
  digital: 'Digital', starter: 'Starter', basic: 'Basic', 'basic-plus': 'Basic+',
  silver: 'Silver', 'silver-plus': 'Silver+', gold: 'Gold', 'gold-plus': 'Gold+',
  platinum: 'Platinum', diamond: 'Diamond', 'diamond-plus': 'Diamond+',
};

const ACTIVITY_ALIASES = [
  ['musculacao', 'Treino de força'], ['musculação', 'Treino de força'], ['treino de forca', 'Treino de força'], ['treino de força', 'Treino de força'],
  ['bodybuilding', 'Fisiculturismo'], ['fisiculturismo', 'Fisiculturismo'],
  ['hiit', 'HIIT'], ['pilates', 'Pilates'], ['yoga', 'Yoga'], ['zumba', 'Zumba'], ['jump', 'Jump'], ['step', 'Step'], ['pump', 'Pump'],
  ['funcional', 'Treino funcional'], ['circuito funcional', 'Circuitos funcionais'], ['circuitos funcionais', 'Circuitos funcionais'],
  ['spinning', 'Power Bike'], ['bike', 'Power Bike'], ['cycling', 'Power Bike'], ['power bike', 'Power Bike'],
  ['danca', 'Dança'], ['dança', 'Dança'], ['fit dance', 'Fitness dance'], ['fitness dance', 'Fitness dance'], ['danca de salao', 'Dança de salão'], ['dança de salão', 'Dança de salão'],
  ['luta', 'Fight'], ['fight', 'Fight'], ['artes marciais', 'Artes marciais'], ['boxe', 'Boxe'], ['jiu jitsu', 'Jiu-jitsu'], ['jiu-jitsu', 'Jiu-jitsu'], ['muay thai', 'Muay Thai'],
  ['cardio', 'Cardio'], ['abdominal', 'Abdominal'], ['abd', 'Abdominal'], ['gap', 'GAP'], ['regeneracao', 'Regeneração'], ['regeneração', 'Regeneração'],
  ['treino hibrido', 'Treino Híbrido'], ['treino híbrido', 'Treino Híbrido'], ['personal', 'Personal trainer'], ['alongamento', 'Alongamento'],
  ['natacao', 'Natação'], ['natação', 'Natação'], ['crossfit', 'CrossFit'], ['corrida', 'Corrida'],
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function stringField(block, name) {
  const match = block.match(new RegExp(`\\b${name}:\\s*'((?:\\\\'|[^'])*)'`));
  return match ? match[1].replace(/\\'/g, "'") : '';
}

function numberField(block, name) {
  const match = block.match(new RegExp(`\\b${name}:\\s*([0-9.]+)`));
  return match ? Number(match[1]) : undefined;
}

function boolField(block, name) {
  const match = block.match(new RegExp(`\\b${name}:\\s*(true|false)`));
  return match ? match[1] === 'true' : undefined;
}

function arrayField(block, name) {
  const match = block.match(new RegExp(`\\b${name}:\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'((?:\\'|[^'])*)'/g)].map((item) => item[1].replace(/\\'/g, "'"));
}

export function loadVerifiedWellhubPartners(catalogPath = CATALOG_PATH) {
  const source = fs.readFileSync(catalogPath, 'utf8');
  const start = source.indexOf('export const WELLHUB_VERIFIED_PARTNERS');
  if (start < 0) throw new Error('Catálogo Wellhub verificado ausente.');
  const listStart = source.indexOf('[', start);
  const listEnd = source.indexOf('];', listStart);
  if (listStart < 0 || listEnd < 0) throw new Error('Catálogo Wellhub verificado inválido.');
  const body = source.slice(listStart + 1, listEnd);
  const blocks = body.split(/\n\s*\{\n/).slice(1).map((part) => `{\n${part}`).map((part) => part.replace(/,?\n\s*\},?\s*$/, '\n}'));
  const partners = blocks.map((block) => ({
    id: stringField(block, 'id'), name: stringField(block, 'name'), chain: stringField(block, 'chain'),
    city: stringField(block, 'city'), state: stringField(block, 'state'), country: stringField(block, 'country') || 'BR',
    address: stringField(block, 'address'), minimumPlan: stringField(block, 'minimumPlan'), rating: numberField(block, 'rating'),
    reviewCount: numberField(block, 'reviewCount'), openingHours: arrayField(block, 'openingHours'), is24Hours: boolField(block, 'is24Hours') || false,
    accessNote: stringField(block, 'accessNote'), source: stringField(block, 'source'), sourceUrl: stringField(block, 'sourceUrl'), verifiedAt: stringField(block, 'verifiedAt') || '2026-08-25',
  })).filter((partner) => partner.id && partner.name && partner.sourceUrl && partner.source === 'wellhub-public-directory');
  if (!partners.length) throw new Error('Nenhuma unidade Wellhub verificada foi carregada.');
  return partners;
}

export function isWellhubPlanServer(value) {
  return WELLHUB_PLAN_ORDER.includes(String(value || '').trim().toLowerCase());
}

export function wellhubPlanLabelServer(value) {
  return PLAN_LABELS[String(value || '').trim().toLowerCase()] || String(value || '—');
}

export function wellhubPlanAllows(userPlan, minimumPlan) {
  const userRank = WELLHUB_PLAN_ORDER.indexOf(String(userPlan || '').toLowerCase());
  const minimumRank = WELLHUB_PLAN_ORDER.indexOf(String(minimumPlan || '').toLowerCase());
  return userRank >= 0 && minimumRank >= 0 && userRank >= minimumRank;
}

export function detectWellhubPlanFromText(text = '') {
  const normalized = normalize(text).replace(/\s*\+\s*/g, '+');
  const aliases = [
    ['diamond+', 'diamond-plus'], ['diamond plus', 'diamond-plus'], ['diamond', 'diamond'],
    ['platinum', 'platinum'], ['gold+', 'gold-plus'], ['gold plus', 'gold-plus'], ['gold', 'gold'],
    ['silver+', 'silver-plus'], ['silver plus', 'silver-plus'], ['silver', 'silver'],
    ['basic+', 'basic-plus'], ['basic plus', 'basic-plus'], ['basic', 'basic'], ['starter', 'starter'], ['digital', 'digital'],
  ];
  for (const [alias, plan] of aliases) if (normalized.includes(normalize(alias).replace(/\s*\+\s*/g, '+'))) return plan;
  return '';
}

export function detectWellhubActivityFromText(text = '') {
  const raw = String(text || '').trim();
  const explicit = raw.match(/(?:modalidade|atividade|aula|treino)\s*(?:que\s+quero|preferida|desejada|é|e|:|-)?\s*["“”']?([^,.;!?\n]{2,60})/i);
  if (explicit) {
    let candidate = explicit[1].trim().replace(/["“”']+$/g, '');
    candidate = candidate.replace(/\b(?:perto|proximo|próximo|em|no|na|hoje|amanha|amanhã|agora)\b[\s\S]*$/i, '').trim();
    if (candidate && !/^(hoje|agora|perto)$/i.test(candidate)) {
      const canonical = activityCanonical(candidate);
      return canonical || candidate;
    }
  }
  const normalizedText = normalize(raw);
  for (const [alias, canonical] of ACTIVITY_ALIASES) {
    if (normalizedText.includes(normalize(alias))) return canonical;
  }
  return '';
}

function activityCanonical(value = '') {
  const normalizedValue = normalize(value);
  const exact = ACTIVITY_ALIASES.find(([alias]) => normalize(alias) === normalizedValue);
  return exact?.[1] || '';
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(?:div|p|li|h\d|section|article|span)>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú')
    .replace(/&ccedil;/gi, 'ç').replace(/&atilde;/gi, 'ã').replace(/&otilde;/gi, 'õ')
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function officialActivitiesFromText(text = '') {
  const normalizedText = normalize(text);
  const found = [];
  const seen = new Set();
  for (const [alias, canonical] of ACTIVITY_ALIASES) {
    if (!normalizedText.includes(normalize(alias))) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    found.push(canonical);
  }
  return found;
}

async function fetchOfficialPartnerPage(partner, { timeoutMs = 5500 } = {}) {
  const cached = officialPageCache.get(partner.id);
  if (cached && Date.now() - cached.cachedAt < OFFICIAL_CACHE_TTL_MS) return cached;
  let parsed;
  try {
    const url = new URL(partner.sourceUrl);
    if (!url.hostname.endsWith(OFFICIAL_HOST)) throw new Error('Fonte Wellhub não oficial.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { accept: 'text/html', 'user-agent': 'CrewCheck/1.0 verified-partner-reader' }, signal: controller.signal });
      if (!response.ok) throw new Error(`Wellhub HTTP ${response.status}`);
      const text = decodeHtml(await response.text());
      parsed = { ok: true, text, activities: officialActivitiesFromText(text), checkedAt: new Date().toISOString(), cachedAt: Date.now() };
    } finally { clearTimeout(timer); }
  } catch (error) {
    parsed = { ok: false, text: '', activities: [], checkedAt: new Date().toISOString(), cachedAt: Date.now(), message: error instanceof Error ? error.message : 'Fonte oficial indisponível.' };
  }
  officialPageCache.set(partner.id, parsed);
  return parsed;
}

function activityMatchesOfficialPage(activity, detail) {
  if (!activity) return true;
  if (!detail?.ok || !detail.text) return false;
  const requested = normalize(activityCanonical(activity) || activity);
  if (!requested) return true;
  if (normalize(detail.text).includes(requested)) return true;
  const aliases = ACTIVITY_ALIASES.filter(([, canonical]) => normalize(canonical) === requested).map(([alias]) => normalize(alias));
  return aliases.some((alias) => normalize(detail.text).includes(alias));
}

function locationScore(partner, locationText = '') {
  const wanted = normalize(locationText);
  if (!wanted) return 0;
  const city = normalize(partner.city);
  const state = normalize(partner.state);
  const haystack = normalize([partner.name, partner.chain, partner.city, partner.state, partner.address].join(' '));
  let score = 0;
  if (city && wanted.includes(city)) score += 100;
  if (state && wanted.split(' ').includes(state)) score += 20;
  for (const token of wanted.split(' ').filter((item) => item.length >= 4)) if (haystack.includes(token)) score += 3;
  return score;
}

function queryMatches(partner, query = '') {
  const words = normalize(query).split(' ').filter((word) => word.length > 1);
  if (!words.length) return true;
  const haystack = normalize([partner.name, partner.chain, partner.city, partner.state, partner.address].join(' '));
  return words.every((word) => haystack.includes(word));
}

export async function searchVerifiedWellhub({ plan = 'basic', query = '', activity = '', locationText = '', limit = 20, live = true } = {}) {
  const normalizedPlan = isWellhubPlanServer(plan) ? String(plan) : 'basic';
  let candidates = loadVerifiedWellhubPartners()
    .filter((partner) => wellhubPlanAllows(normalizedPlan, partner.minimumPlan))
    .filter((partner) => queryMatches(partner, query))
    .sort((a, b) => locationScore(b, locationText) - locationScore(a, locationText) || Number(b.rating || 0) - Number(a.rating || 0));

  if (!activity) return candidates.slice(0, Math.max(1, Number(limit) || 20)).map((partner) => ({ ...partner, activities: [], liveVerified: false }));
  if (!live) return [];

  const enriched = await Promise.all(candidates.slice(0, 40).map(async (partner) => {
    const detail = await fetchOfficialPartnerPage(partner);
    if (!activityMatchesOfficialPage(activity, detail)) return null;
    return { ...partner, activities: detail.activities, liveVerified: Boolean(detail.ok), liveCheckedAt: detail.checkedAt, liveMessage: detail.message || '' };
  }));
  return enriched.filter(Boolean).slice(0, Math.max(1, Number(limit) || 20));
}

const DAY_INDEX = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
function dayToken(value = '') { return normalize(value).slice(0, 3); }
function dayIncluded(expression = '', weekday) {
  const normalizedExpression = normalize(expression);
  const range = normalizedExpression.match(/^(dom|seg|ter|qua|qui|sex|sab)\s*-\s*(dom|seg|ter|qua|qui|sex|sab)$/);
  if (range) {
    const from = DAY_INDEX[range[1]];
    const to = DAY_INDEX[range[2]];
    if (from <= to) return weekday >= from && weekday <= to;
    return weekday >= from || weekday <= to;
  }
  return normalizedExpression.split(/[,&/]+/).map(dayToken).some((token) => DAY_INDEX[token] === weekday);
}
function hhmmToMinutes(value = '') {
  const match = String(value).match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
export function openingIntervalsForWeekday(partner, weekday) {
  if (partner?.is24Hours) return [[0, 1440]];
  const intervals = [];
  for (const line of partner?.openingHours || []) {
    const match = String(line).match(/^([^0-9]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    if (!match || !dayIncluded(match[1].trim(), weekday)) continue;
    const start = hhmmToMinutes(match[2]);
    let end = hhmmToMinutes(match[3]);
    if (start === null || end === null) continue;
    if (end <= start) end += 1440;
    intervals.push([start, end]);
  }
  return intervals;
}

function zonedParts(date, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, weekday: weekdayMap[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}
function plusOneDayParts(parts) {
  const base = new Date(`${parts.iso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return { iso: base.toISOString().slice(0, 10), weekday: (parts.weekday + 1) % 7, minutes: 0 };
}
function formatMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export async function buildWellhubRoutineSuggestion({ plan = 'basic', activity = '', locationText = '', nextAt, now = new Date(), durationMinutes = 45, bufferMinutes = 120 } = {}) {
  const nextDate = nextAt ? new Date(nextAt) : null;
  if (!nextDate || Number.isNaN(nextDate.getTime()) || nextDate <= now) return { ok: false, message: 'Sem próxima programação futura suficiente para encaixar academia.' };
  const hoursUntil = (nextDate.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil < 4) return { ok: false, message: 'A próxima programação está muito próxima; o CrewCheck não sugeriu deslocamento para academia.' };

  const partners = await searchVerifiedWellhub({ plan, activity, locationText, limit: 12, live: Boolean(activity) });
  if (!partners.length) return { ok: false, message: activity ? `Não encontrei unidade verificada compatível com ${activity} no catálogo oficial atual.` : 'Não encontrei unidade Wellhub verificada compatível com seu plano no catálogo atual.' };

  const today = zonedParts(now);
  const next = zonedParts(nextDate);
  const days = [today];
  if (next.iso !== today.iso) days.push(plusOneDayParts(today));
  const desired = Math.max(30, Math.min(120, Number(durationMinutes) || 45));
  const buffer = Math.max(90, Number(bufferMinutes) || 120);

  for (const day of days) {
    const sameAsToday = day.iso === today.iso;
    const sameAsNext = day.iso === next.iso;
    const availableStart = sameAsToday ? today.minutes : 0;
    const deadline = sameAsNext ? next.minutes - buffer : 1440;
    if (deadline - availableStart < desired) continue;
    for (const partner of partners) {
      for (const [openStart, openEndRaw] of openingIntervalsForWeekday(partner, day.weekday)) {
        const openEnd = Math.min(openEndRaw, 1440);
        const start = Math.max(openStart, availableStart + (sameAsToday ? 20 : 0));
        const end = Math.min(openEnd, deadline);
        if (end - start < desired) continue;
        return {
          ok: true,
          plan,
          activity,
          gym: partner,
          date: day.iso,
          startTime: formatMinutes(start),
          endTime: formatMinutes(start + desired),
          durationMinutes: desired,
          bufferMinutes: buffer,
          nextAt: nextDate.toISOString(),
          message: `Janela operacional encontrada entre ${formatMinutes(start)} e ${formatMinutes(start + desired)}, preservando ${buffer} min antes da próxima programação.`,
          caution: 'Horários vêm da fonte oficial verificada e podem mudar em feriados ou situações excepcionais. Confirme a página da unidade antes de sair.',
        };
      }
    }
  }
  return { ok: false, message: 'Nenhuma unidade verificada tem uma janela compatível com os horários publicados antes da próxima programação.' };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export async function handleWellhubSearchRoute(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const plan = String(url.searchParams.get('plan') || 'basic');
    const query = String(url.searchParams.get('query') || '');
    const activity = String(url.searchParams.get('activity') || '');
    const locationText = String(url.searchParams.get('location') || '');
    const limit = Math.min(60, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    const partners = await searchVerifiedWellhub({ plan, query, activity, locationText, limit });
    return sendJson(res, 200, { ok: true, plan: isWellhubPlanServer(plan) ? plan : 'basic', activity, query, total: partners.length, partners, source: 'wellhub-public-directory', mapsUsedForEligibility: false });
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : 'Busca Wellhub indisponível.' });
  }
}

export async function handleWellhubRoutineRoute(req, res, url) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  try {
    const result = await buildWellhubRoutineSuggestion({
      plan: String(url.searchParams.get('plan') || 'basic'),
      activity: String(url.searchParams.get('activity') || ''),
      locationText: String(url.searchParams.get('location') || ''),
      nextAt: String(url.searchParams.get('nextAt') || ''),
      durationMinutes: Number(url.searchParams.get('duration') || 45),
      bufferMinutes: Number(url.searchParams.get('buffer') || 120),
    });
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : 'Rotina Wellhub indisponível.' });
  }
}
