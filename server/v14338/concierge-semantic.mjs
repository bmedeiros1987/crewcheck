const CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;
const TIME_ZONE = 'America/Sao_Paulo';

const MONTHS = Object.freeze({
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
});
const WEEKDAYS = Object.freeze({
  domingo: 0, dom: 0, segunda: 1, 'segunda-feira': 1, seg: 1,
  terca: 2, terça: 2, 'terca-feira': 2, 'terça-feira': 2, ter: 2,
  quarta: 3, 'quarta-feira': 3, qua: 3, quinta: 4, 'quinta-feira': 4, qui: 4,
  sexta: 5, 'sexta-feira': 5, sex: 5, sabado: 6, sábado: 6, sab: 6,
});
const AIRPORT_ALIASES = Object.freeze({
  brasilia: 'BSB', brasília: 'BSB', guarulhos: 'GRU', congonhas: 'CGH', viracopos: 'VCP', campinas: 'VCP',
  galeao: 'GIG', galeão: 'GIG', 'santos dumont': 'SDU', curitiba: 'CWB', salvador: 'SSA', recife: 'REC',
  fortaleza: 'FOR', 'porto alegre': 'POA', 'sao luis': 'SLZ', 'são luís': 'SLZ', confins: 'CNF',
  palmas: 'PMW', 'ribeirao preto': 'RAO', 'ribeirão preto': 'RAO', miami: 'MIA', lisboa: 'LIS',
  madrid: 'MAD', madri: 'MAD', barcelona: 'BCN', londres: 'LHR', heathrow: 'LHR', paris: 'CDG',
  roma: 'FCO', frankfurt: 'FRA', dubai: 'DXB', 'nova york': 'JFK', toquio: 'HND', tóquio: 'HND',
});

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date).reduce((acc, item) => { acc[item.type] = item.value; return acc; }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: weekdayMap[parts.weekday] ?? 0 };
}
function dateKeyFromParts(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function addLocalDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}
function validDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function normalizeConciergeNaturalTextV14338(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"'`´]/g, '')
    .replace(/[^a-z0-9/\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isConciergeContextFreshV14338(context = null, now = new Date()) {
  const updated = Date.parse(String(context?.updatedAt || ''));
  return Number.isFinite(updated) && now.getTime() - updated >= 0 && now.getTime() - updated <= CONTEXT_TTL_MS;
}

export function parseConciergeNaturalDateV14338(text = '', now = new Date()) {
  const normalized = normalizeConciergeNaturalTextV14338(text);
  const today = localParts(now);
  if (/\bdepois de amanha\b/.test(normalized)) return dateKeyFromParts(...Object.values(addLocalDays(today, 2)).slice(0, 3));
  if (/\bamanha\b/.test(normalized)) return dateKeyFromParts(...Object.values(addLocalDays(today, 1)).slice(0, 3));
  if (/\bhoje\b/.test(normalized)) return dateKeyFromParts(today.year, today.month, today.day);
  if (/\bontem\b/.test(normalized)) return dateKeyFromParts(...Object.values(addLocalDays(today, -1)).slice(0, 3));

  const numeric = normalized.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : today.year;
    if (year < 100) year += 2000;
    if (!numeric[3] && (month < today.month || (month === today.month && day < today.day))) year += 1;
    if (validDateParts(year, month, day)) return dateKeyFromParts(year, month, day);
  }

  const written = normalized.match(/\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?\b/);
  if (written) {
    const day = Number(written[1]);
    const month = MONTHS[written[2]];
    let year = written[3] ? Number(written[3]) : today.year;
    if (!written[3] && (month < today.month || (month === today.month && day < today.day))) year += 1;
    if (validDateParts(year, month, day)) return dateKeyFromParts(year, month, day);
  }

  const dayOnly = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let year = today.year;
    let month = today.month;
    if (day < today.day && !/\b(deste mes|desse mes|mes atual)\b/.test(normalized)) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    if (validDateParts(year, month, day)) return dateKeyFromParts(year, month, day);
  }

  for (const [label, target] of Object.entries(WEEKDAYS)) {
    if (!new RegExp(`\\b${label.replace('-', '[ -]?')}\\b`).test(normalized)) continue;
    let delta = (target - today.weekday + 7) % 7;
    if (delta === 0 && /\bproxim[oa]\b/.test(normalized)) delta = 7;
    const parts = addLocalDays(today, delta);
    return dateKeyFromParts(parts.year, parts.month, parts.day);
  }
  return '';
}

function extractFlight(text, normalized, context) {
  const direct = String(text || '').toUpperCase().match(/\b(?:LA|JJ|LAN|TAM)\s*[- ]?(\d{3,4})\b/);
  if (direct) {
    const prefix = direct[0].replace(/\s|-/g, '').replace(/^LAN/, 'LA').replace(/^TAM/, 'JJ').replace(/\d+$/, '');
    return `${prefix}${direct[1]}`;
  }
  const bare = normalized.match(/\b(\d{3,4})\b/);
  if (bare && /\b(voo|portao|terminal|radar|status|atras|cancel|embarque|chegada|partida)\b/.test(normalized)) return `LA${bare[1]}`;
  if (/\b(esse voo|este voo|dele|desse voo|o mesmo voo|e o portao|e o status|e a chegada)\b/.test(normalized)) return String(context?.flight || '');
  return '';
}
function extractAirport(text, normalized, context) {
  const explicit = String(text || '').toUpperCase().match(/\b[A-Z]{4}\b|\b[A-Z]{3}\b/);
  if (explicit && !['METAR', 'TAF', 'ATIS'].includes(explicit[0])) return explicit[0];
  for (const [label, code] of Object.entries(AIRPORT_ALIASES)) if (normalized.includes(label.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return code;
  if (/\b(destino|la|ali|esse aeroporto|nesse aeroporto)\b/.test(normalized)) return String(context?.airport || '');
  return '';
}
function looksLikeFollowUp(normalized, contextFresh) {
  return contextFresh && (normalized.length <= 42 || /\b(e |tambem|agora|depois|dele|desse|esse|isso|la|ali|o mesmo)\b/.test(normalized));
}

export function interpretConciergeNaturalTextV14338(text = '', previousContext = null, now = new Date()) {
  const originalText = String(text || '').trim();
  const normalized = normalizeConciergeNaturalTextV14338(originalText);
  const contextFresh = isConciergeContextFreshV14338(previousContext, now);
  const context = contextFresh ? previousContext : {};
  const dateKey = parseConciergeNaturalDateV14338(originalText, now);
  const flight = extractFlight(originalText, normalized, context);
  const airport = extractAirport(originalText, normalized, context);
  const followUp = looksLikeFollowUp(normalized, contextFresh);
  const explicitCommand = /^\//.test(originalText);
  let intent = 'unknown';
  let rewrite = originalText;
  let confidence = explicitCommand ? 1 : 0.35;

  if (explicitCommand) intent = 'explicit_command';
  else if (!normalized || /^(ajuda|me ajuda|o que voce faz|o que posso perguntar|como funciona)$/.test(normalized)) { intent = 'help'; rewrite = '/ajuda'; confidence = 0.95; }
  else if (/\b(portao|terminal|radar|status do voo|voo atras|atrasou|cancelado|embarque|ultima chamada|partida|chegada do voo)\b/.test(normalized) || (followUp && /\b(e o status|e o portao|e a chegada|e a partida)\b/.test(normalized))) { intent = 'radar'; rewrite = `/radar${flight ? ` ${flight}` : ''}`; confidence = 0.94; }
  else if (/\b(metar|taf|atis|meteorologia|tempo no aeroporto|clima no aeroporto|condicoes meteorologicas|tempo na origem|tempo no destino)\b/.test(normalized)) { intent = 'weather'; rewrite = `/metar${airport ? ` ${airport}` : ''} decodificado`; confidence = 0.92; }
  else if (/\b(que horas|quando|hora).*(sair|saio)|\b(saida inteligente|rota para o aeroporto|transito para o aeroporto|ir para o aeroporto)\b/.test(normalized)) { intent = 'departure'; rewrite = '/saida'; confidence = 0.94; }
  else if (/\b(que horas|quando|qual horario).*(apresent|report)|\bhora da apresentacao\b|\bminha apresentacao\b/.test(normalized)) { intent = 'presentation'; rewrite = ''; confidence = 0.96; }
  else if (/\b(quando|que dia|que horas).*(volto|retorno|chego).*(base|casa)|\bquando volto\b|\bretorno para a base\b/.test(normalized)) { intent = 'return_base'; rewrite = ''; confidence = 0.96; }
  else if (/\b(depois desse|depois dele|e depois|qual vem depois|proxima depois)\b/.test(normalized) && contextFresh) { intent = 'next_after_context'; rewrite = ''; confidence = 0.91; }
  else if (/\b(onde vou dormir|onde fico|qual hotel|hotel do pernoite|estou hospedado|pernoite)\b/.test(normalized)) { intent = /\bqual hotel|hotel\b/.test(normalized) ? 'hotel' : 'stay'; rewrite = intent === 'hotel' ? '/hoteis' : '/pernoite'; confidence = 0.92; }
  else if (/\b(hospital|pronto atendimento|pronto socorro|upa|emergencia medica)\b/.test(normalized)) { intent = 'hospital'; rewrite = '/hospitais'; confidence = 0.95; }
  else if (/\b(farmacia|drogaria|remedio perto)\b/.test(normalized)) { intent = 'pharmacy'; rewrite = '/farmacias'; confidence = 0.95; }
  else if (/\b(academia|wellhub|gympass|smart fit|onde treinar|treino perto)\b/.test(normalized)) { intent = 'gym'; rewrite = '/academias'; confidence = 0.94; }
  else if (/\b(rbac|act|regulamentacao|irregularidade|limite de jornada|ate que horas posso|repouso minimo|estouro de jornada)\b/.test(normalized)) { intent = 'compliance'; rewrite = '/conformidade'; confidence = 0.95; }
  else if (/\b(diaria|diarias|quantos pernoites|valor de diaria|recebo de diaria)\b/.test(normalized)) { intent = 'perdiem'; rewrite = '/diarias'; confidence = 0.93; }
  else if (/\b(posso treinar|devo dormir|hora de dormir|recuperacao|como organizar meu dia|rotina|descansar agora)\b/.test(normalized)) { intent = 'routine'; rewrite = '/rotina'; confidence = 0.9; }
  else if (/\b(resumo da escala|minha escala inteira|visao geral da escala|quantos voos tenho)\b/.test(normalized)) { intent = 'summary'; rewrite = '/escala'; confidence = 0.93; }
  else if (/\b(proximo voo|proxima programacao|proxima atividade|o que vem agora|o que tenho agora|qual e o proximo)\b/.test(normalized)) { intent = 'next'; rewrite = '/proximo'; confidence = 0.95; }
  else if (dateKey && /\b(o que tenho|qual minha|programacao|escala|voo|trabalho|folga|atividade|vou fazer|tenho nesse dia)\b/.test(normalized)) { intent = 'schedule_date'; rewrite = ''; confidence = 0.96; }
  else if (/\b(o que tenho hoje|programacao de hoje|escala de hoje)\b/.test(normalized)) { intent = 'schedule_date'; rewrite = '/hoje'; confidence = 0.95; }
  else if (/\b(o que tenho amanha|programacao de amanha|escala de amanha)\b/.test(normalized)) { intent = 'schedule_date'; rewrite = '/amanha'; confidence = 0.95; }
  else if (followUp && dateKey && ['schedule_date', 'next', 'summary'].includes(String(context?.lastIntent || ''))) { intent = 'schedule_date'; rewrite = ''; confidence = 0.84; }
  else if (followUp && String(context?.lastIntent || '') === 'radar' && /\b(e agora|alguma mudanca|mudou|atualiza|atualizar)\b/.test(normalized)) { intent = 'radar'; rewrite = `/radar${flight || context.flight ? ` ${flight || context.flight}` : ''}`; confidence = 0.84; }

  return {
    version: '14.3.38', originalText, normalized, intent, rewrite, confidence, dateKey,
    flight: flight || (followUp ? String(context?.flight || '') : ''),
    airport: airport || (followUp ? String(context?.airport || '') : ''),
    followUp, usesContext: followUp && contextFresh, contextFresh,
  };
}

export function buildConciergeContextV14338(interpretation = {}, previousContext = null, now = new Date(), extra = {}) {
  const previous = isConciergeContextFreshV14338(previousContext, now) ? previousContext : {};
  return {
    version: '14.3.38',
    lastIntent: String(interpretation.intent || previous.lastIntent || '').slice(0, 40),
    dateKey: String(interpretation.dateKey || extra.dateKey || previous.dateKey || '').slice(0, 10),
    flight: String(interpretation.flight || extra.flight || previous.flight || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    airport: String(interpretation.airport || extra.airport || previous.airport || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4),
    recordKey: String(extra.recordKey || previous.recordKey || '').slice(0, 80),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS).toISOString(),
    turns: Math.min(99, Number(previous.turns || 0) + 1),
  };
}

export const CONCIERGE_SEMANTIC_INTENTS_V14338 = Object.freeze([
  'help','schedule_date','next','next_after_context','summary','radar','weather','departure','presentation',
  'return_base','stay','hotel','gym','hospital','pharmacy','routine','perdiem','compliance','explicit_command','unknown',
]);
