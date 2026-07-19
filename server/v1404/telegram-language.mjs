import {
  DEFAULT_CONCIERGE_NAME,
  airportName,
  buildBlankDaySummary,
  buildConciergeSettingsReply,
  cleanDisplayName,
  isPremiumConcierge,
  preferredConciergeName,
  preferredUserName,
  premiumGreeting,
  premiumVoicePolicy,
} from '../v1403/telegram-human.mjs';

export {
  DEFAULT_CONCIERGE_NAME,
  airportName,
  buildBlankDaySummary,
  buildConciergeSettingsReply,
  cleanDisplayName,
  isPremiumConcierge,
  preferredConciergeName,
  preferredUserName,
  premiumGreeting,
  premiumVoicePolicy,
};

const DIGIT_WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

function normalizeIntent(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[?!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(value, patterns = []) {
  return patterns.some((pattern) => pattern.test(value));
}

export function matchesTodayIntent(value = '') {
  const text = normalizeIntent(value);
  if (!/\bhoje\b/.test(text)) return false;
  return hasAny(text, [
    /\bo que (?:eu )?tenho(?: para)? hoje\b/,
    /\bque (?:eu )?tenho(?: para)? hoje\b/,
    /\bo que tem (?:para )?hoje\b/,
    /\bqual (?:e )?(?:a )?(?:minha )?(?:programacao|escala|atividade|jornada)(?: para)? hoje\b/,
    /\bcomo (?:esta|vai ser|fica) (?:o )?meu dia hoje\b/,
    /\bmeu dia (?:de )?hoje\b/,
    /\btenho (?:algum )?(?:voo|programacao|atividade|trabalho) hoje\b/,
    /\btem (?:algum )?(?:voo|programacao|atividade|trabalho) hoje\b/,
    /\bquais? (?:voos?|pernas?|atividades?) (?:eu )?tenho hoje\b/,
    /\bo que esta (?:programado|previsto|publicado) (?:para )?hoje\b/,
    /\bque horas (?:eu )?(?:me apresento|trabalho|voo) hoje\b/,
    /\bonde (?:eu )?vou hoje\b/,
    /\bprogramacao (?:de|para) hoje\b/,
    /\bescala (?:de|para) hoje\b/,
  ]);
}

export function matchesTomorrowIntent(value = '') {
  const text = normalizeIntent(value);
  if (!/\bamanha\b/.test(text)) return false;
  return hasAny(text, [
    /\bo que (?:eu )?tenho(?: para)? amanha\b/,
    /\bque (?:eu )?tenho(?: para)? amanha\b/,
    /\bo que tem (?:para )?amanha\b/,
    /\bqual (?:e )?(?:a )?(?:minha )?(?:programacao|escala|atividade|jornada)(?: para)? amanha\b/,
    /\bcomo (?:esta|vai ser|fica) (?:o )?meu dia amanha\b/,
    /\btenho (?:algum )?(?:voo|programacao|atividade|trabalho) amanha\b/,
    /\btem (?:algum )?(?:voo|programacao|atividade|trabalho) amanha\b/,
    /\bquais? (?:voos?|pernas?|atividades?) (?:eu )?tenho amanha\b/,
    /\bo que esta (?:programado|previsto|publicado) (?:para )?amanha\b/,
    /\bque horas (?:eu )?(?:me apresento|trabalho|voo) amanha\b/,
    /\bonde (?:eu )?vou amanha\b/,
    /\bprogramacao (?:de|para) amanha\b/,
    /\bescala (?:de|para) amanha\b/,
  ]);
}

export function matchesNextIntent(value = '') {
  const text = normalizeIntent(value);
  return hasAny(text, [
    /\bproxim[oa] (?:programacao|atividade|voo|jornada|apresentacao)\b/,
    /\bqual (?:e )?(?:o |a )?proxim[oa] (?:programacao|atividade|voo|jornada|apresentacao)\b/,
    /\bo que (?:eu )?tenho depois\b/,
    /\bo que vem (?:agora|depois|na sequencia)\b/,
    /\bqual (?:e )?(?:o )?proximo compromisso\b/,
    /\bquando (?:eu )?(?:trabalho|voo|me apresento) de novo\b/,
    /\bdepois dessa programacao\b/,
  ]);
}

export function matchesRosterSummaryIntent(value = '') {
  const text = normalizeIntent(value);
  return hasAny(text, [
    /\bresumo (?:da |de )?escala\b/,
    /\bcomo (?:esta|ficou) (?:a )?minha escala\b/,
    /\bo que (?:eu )?tenho (?:na|nesta|durante a) escala\b/,
    /\bo que (?:eu )?tenho (?:no|neste) mes\b/,
    /\bquantos? (?:voos?|pernas?|programacoes?) (?:eu )?tenho\b/,
    /\bminha escala (?:do|deste) mes\b/,
  ]);
}

export function matchesDepartureIntent(value = '') {
  const text = normalizeIntent(value);
  return hasAny(text, [
    /\bque horas (?:eu )?(?:devo |preciso )?sair(?: de casa)?\b/,
    /\bque hora (?:eu )?(?:devo |preciso )?sair(?: de casa)?\b/,
    /\bquando (?:eu )?(?:devo |preciso )?sair(?: de casa)?\b/,
    /\bqual (?:e )?(?:o )?horario (?:da minha )?saida\b/,
    /\bqual (?:e )?(?:a )?hora de sair\b/,
    /\bpreciso sair que horas\b/,
    /\bdevo sair que horas\b/,
    /\bsaida inteligente\b/,
    /\btrajeto (?:ate|para) (?:o )?aeroporto\b/,
    /\btempo (?:ate|para) (?:o )?aeroporto\b/,
  ]);
}

export function matchesRadarIntent(value = '') {
  const text = normalizeIntent(value);
  return hasAny(text, [
    /\bportao\b/,
    /\bgate\b/,
    /\bterminal\b/,
    /\bstatus (?:do |de )?(?:meu )?voo\b/,
    /\bonde (?:eu )?embarco\b/,
    /\bmeu voo (?:esta )?(?:atrasado|cancelado|confirmado|embarcan|no horario)\b/,
    /\bqual (?:e )?(?:o )?portao (?:do |de )?(?:meu )?voo\b/,
  ]);
}

export function spokenTime(value = '', fallback = 'horário a confirmar') {
  const match = String(value || '').match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  const hourText = `${hour} ${hour === 1 ? 'hora' : 'horas'}`;
  if (!minute) return hourText;
  return `${hourText} e ${minute} ${minute === 1 ? 'minuto' : 'minutos'}`;
}

export function spokenDuration(minutes = 0) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  if (total < 60) return `${total} minuto${total === 1 ? '' : 's'}`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest
    ? `${hours} hora${hours === 1 ? '' : 's'} e ${rest} minuto${rest === 1 ? '' : 's'}`
    : `${hours} hora${hours === 1 ? '' : 's'}`;
}

export function airlineName(flightNumber = '') {
  const raw = String(flightNumber || '').toUpperCase().replace(/\s+/g, '');
  if (/^(LA|LAN|JJ|TAM)/.test(raw)) return 'LATAM';
  if (/^G3/.test(raw)) return 'Gol';
  if (/^(AD|AZU)/.test(raw)) return 'Azul';
  return '';
}

export function spokenFlightNumber(flightNumber = '') {
  const raw = String(flightNumber || '').toUpperCase().replace(/\s+/g, '');
  const digits = raw.match(/\d{2,5}/)?.[0] || '';
  if (!digits) return raw || 'voo a confirmar';
  const company = airlineName(raw);
  const sequence = digits.split('').map((digit) => DIGIT_WORDS[Number(digit)] || digit).join(' ');
  return `voo ${sequence}${company ? ` da ${company}` : ''}`;
}

function shortAirportName(code = '') {
  return airportName(code)
    .replace(/^aeroporto\s+(?:d[aeo]\s+)?/i, '')
    .trim() || String(code || '').trim().toUpperCase() || 'origem';
}

export function originDeparturePhrase(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  const place = shortAirportName(code);
  return normalized === 'REC' || /^recife$/i.test(place) ? `do ${place}` : `de ${place}`;
}

function scheduleLead(label = '') {
  const normalized = normalizeIntent(label);
  if (normalized === 'hoje') return 'Hoje,';
  if (normalized === 'amanha') return 'Amanhã,';
  if (/sequencia|depois/.test(normalized)) return 'Na sequência,';
  if (/proxima programacao|proximo/.test(normalized)) return 'Na próxima programação,';
  return label ? `${String(label).replace(/[,.:;]+$/, '')},` : '';
}

function legSentence(leg = {}, index = 0, radar = null) {
  const flight = spokenFlightNumber(leg.flightNumber || `etapa ${index + 1}`);
  const departure = spokenTime(leg.departureTime);
  const arrival = spokenTime(leg.arrivalTime);
  const destination = shortAirportName(leg.destination);
  const gate = radar?.gate || leg.gate;
  const sequence = index === 0 ? 'Na primeira perna' : `Na perna ${index + 1}`;
  return `${sequence}, você segue no ${flight}, saindo ${originDeparturePhrase(leg.origin)} às ${departure} e chegando a ${destination} às ${arrival}${gate ? `, pelo portão ${gate}` : ''}.`;
}

export function buildProgramSummary({ profile = {}, snapshot = {}, record = null, label = '', presentationTime = '', radar = null, includeGreeting = true } = {}) {
  const greeting = includeGreeting ? `${premiumGreeting(profile, snapshot)} ` : '';
  if (!record) return `${greeting}Não encontrei uma programação confirmada para esse período.`.trim();
  const legs = Array.isArray(record.legs) ? record.legs : [];
  const presentation = spokenTime(presentationTime || record.startTime);
  const end = spokenTime(record.endTime);
  const lead = scheduleLead(label);
  if (!legs.length) {
    const activity = String(record.code || 'atividade').toLowerCase();
    return `${greeting}${lead ? `${lead} ` : ''}você tem ${activity}. Sua apresentação é às ${presentation}, com término previsto às ${end}.`.trim();
  }
  const count = legs.length;
  const finalDestination = shortAirportName(legs.at(-1)?.destination);
  const opening = `${greeting}${lead ? `${lead} ` : ''}você tem ${count} perna${count === 1 ? '' : 's'}. Sua apresentação é às ${presentation}, e a chave termina em ${finalDestination} às ${end}.`;
  const details = legs.slice(0, 4).map((leg, index) => legSentence(leg, index, index === 0 ? radar : null));
  const remaining = count > 4 ? `As outras ${count - 4} pernas ficam detalhadas no texto da escala.` : '';
  return [opening, ...details, remaining].filter(Boolean).join('\n');
}

export function trafficLevel(route = {}) {
  const minutes = Math.max(1, Number(route?.minutes || 0));
  const distance = Math.max(1, Number(route?.distanceKm || 0));
  const averageSpeed = distance / (minutes / 60);
  if (averageSpeed < 20 || minutes > Math.max(55, distance * 2.2)) return 'pesado';
  if (averageSpeed < 34 || minutes > Math.max(35, distance * 1.55)) return 'moderado';
  return 'leve';
}

export function calculateDepartureWindow(presentationDate, route = {}) {
  const base = presentationDate instanceof Date && Number.isFinite(presentationDate.getTime())
    ? presentationDate
    : new Date();
  const routeMinutes = Math.max(10, Math.round(Number(route?.minutes || 0)));
  const leadMinutes = Math.max(45, routeMinutes + 25);
  let leave = new Date(base.getTime() - leadMinutes * 60_000);
  if (!Number.isFinite(leave.getTime()) || leave.getTime() >= base.getTime()) {
    leave = new Date(base.getTime() - 45 * 60_000);
  }
  return { leave, leadMinutes, routeMinutes };
}

export function buildDepartureSummary({ profile = {}, snapshot = {}, record = null, route = null, leaveTime = '', origin = '', radar = null, presentationTime = '' } = {}) {
  const greeting = premiumGreeting(profile, snapshot);
  if (!record) return `${greeting} Não encontrei uma programação presencial que exija deslocamento agora.`;
  if (!route) return `${greeting} Sua apresentação é às ${spokenTime(presentationTime)} em ${airportName(origin)}. Envie sua localização para eu calcular o trânsito e um horário de saída anterior à apresentação.`;
  const traffic = trafficLevel(route);
  const firstLeg = record.legs?.[0];
  const gate = radar?.gate || firstLeg?.gate;
  const flightPart = firstLeg
    ? ` Depois, você segue no ${spokenFlightNumber(firstLeg.flightNumber)}, às ${spokenTime(firstLeg.departureTime)}${gate ? `, pelo portão ${gate}` : ''}.`
    : '';
  return `${greeting} Saia de casa às ${spokenTime(leaveTime)}. O trânsito está ${traffic}; o trajeto até ${airportName(origin)} deve levar cerca de ${spokenDuration(route.minutes)}.${flightPart}`;
}

export function premiumVoiceText(text = '') {
  let value = String(text || '')
    .replace(/[•▪◦]/g, '. ')
    .replace(/→|➡️?/g, ' para ')
    .replace(/·/g, ', ')
    .replace(/[“”"*_`#]/g, '')
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_match, hour, minute) => spokenTime(`${hour}:${minute}`))
    .replace(/\b(?:LA|LAN|JJ|TAM|G3|AD|AZU)\s?\d{2,5}\b/gi, (flight) => spokenFlightNumber(flight))
    .replace(/\b(BSB|GRU|CGH|GIG|SDU|CNF|VCP|CWB|POA|REC|FOR|SSA|SLZ|BEL|MAO|NAT|MCZ|AJU|FLN|GYN|PMW|CGB|CGR|VIX|RBR|PVH|BVB|MCP|THE|JPA|IOS|RAO|IGU|NVT|LDB)\b/g, (code) => airportName(code))
    .replace(/\bmin\b/gi, 'minutos')
    .replace(/\bkm\b/gi, 'quilômetros')
    .replace(/\n+/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim();
  if (value.length > 700) value = `${value.slice(0, 680).replace(/\s+\S*$/, '')}. Os demais detalhes ficam no texto.`;
  return value;
}
