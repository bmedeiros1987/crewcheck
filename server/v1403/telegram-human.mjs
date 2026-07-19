export const DEFAULT_CONCIERGE_NAME = 'Bruno Saraiva';

const AIRPORT_NAMES = {
  BSB: 'aeroporto de Brasília', GRU: 'aeroporto de Guarulhos', CGH: 'aeroporto de Congonhas',
  GIG: 'aeroporto do Galeão', SDU: 'aeroporto Santos Dumont', CNF: 'aeroporto de Confins',
  VCP: 'aeroporto de Viracopos', CWB: 'aeroporto de Curitiba', POA: 'aeroporto de Porto Alegre',
  REC: 'aeroporto do Recife', FOR: 'aeroporto de Fortaleza', SSA: 'aeroporto de Salvador',
  SLZ: 'aeroporto de São Luís', BEL: 'aeroporto de Belém', MAO: 'aeroporto de Manaus',
  NAT: 'aeroporto de Natal', MCZ: 'aeroporto de Maceió', AJU: 'aeroporto de Aracaju',
  FLN: 'aeroporto de Florianópolis', GYN: 'aeroporto de Goiânia', PMW: 'aeroporto de Palmas',
  CGB: 'aeroporto de Cuiabá', CGR: 'aeroporto de Campo Grande', VIX: 'aeroporto de Vitória',
  RIO: 'Rio de Janeiro', SAO: 'São Paulo', RBR: 'aeroporto de Rio Branco', PVH: 'aeroporto de Porto Velho',
  BVB: 'aeroporto de Boa Vista', MCP: 'aeroporto de Macapá', THE: 'aeroporto de Teresina',
  JPA: 'aeroporto de João Pessoa', IOS: 'aeroporto de Ilhéus', RAO: 'aeroporto de Ribeirão Preto',
  IGU: 'aeroporto de Foz do Iguaçu', NVT: 'aeroporto de Navegantes', LDB: 'aeroporto de Londrina',
};

const ROLE_LABELS = [
  [/\b(CCM|CHEFE|CHEFIA|CHEFE DE CABINE)\b/i, 'chefe'],
  [/\b(CMTE|COMANDANTE|CP)\b/i, 'comandante'],
  [/\b(FO|COPILOTO|COPILOTA|PRIMEIRO OFICIAL)\b/i, 'copiloto'],
  [/\b(PILOTO|PILOTA)\b/i, 'piloto'],
  [/\b(COMISSARIO|COMISSÁRIO|COMISSARIA|COMISSÁRIA|TRIPULANTE)\b/i, 'tripulante'],
];

const DIGIT_WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];

export function cleanDisplayName(value = '', fallback = 'Tripulante') {
  const cleaned = String(value || '').replace(/[<>\n\r]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 48);
  return cleaned || fallback;
}

export function roleLabel(value = '') {
  const source = String(value || '');
  return ROLE_LABELS.find(([pattern]) => pattern.test(source))?.[1] || '';
}

export function isPremiumConcierge(snapshot = {}, profile = {}) {
  const values = [
    snapshot?.premiumAccess,
    snapshot?.preferences?.premiumAccess,
    snapshot?.subscriptionPlan,
    snapshot?.preferences?.subscriptionPlan,
    snapshot?.subscriptionStatus,
    profile?.premiumAccess,
    profile?.subscriptionPlan,
    profile?.subscriptionStatus,
  ];
  if (values.some((value) => value === true)) return true;
  return values.some((value) => /premium|pro|active|trial/i.test(String(value || '')));
}

export function preferredUserName(profile = {}, snapshot = {}) {
  return cleanDisplayName(
    snapshot?.preferences?.preferredName || snapshot?.roster?.crewName || snapshot?.name || profile?.name,
    'Tripulante',
  );
}

export function preferredConciergeName(snapshot = {}) {
  return cleanDisplayName(snapshot?.preferences?.conciergeName, DEFAULT_CONCIERGE_NAME);
}

export function premiumGreeting(profile = {}, snapshot = {}) {
  const role = roleLabel(
    snapshot?.preferences?.userRole || snapshot?.roster?.rank || snapshot?.roster?.role || profile?.rank || profile?.role,
  );
  const name = preferredUserName(profile, snapshot);
  return `Fala, ${role ? `${role} ` : ''}${name}.`;
}

export function airportName(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  return AIRPORT_NAMES[normalized] || normalized || 'aeroporto de origem';
}

export function spokenTime(value = '', fallback = 'horário a confirmar') {
  const match = String(value || '').match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return minute ? `${hour} horas e ${minute} minutos` : `${hour} horas`;
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
  return `${company ? `${company}, ` : ''}voo ${sequence}`;
}

export function trafficLevel(route = {}) {
  const minutes = Math.max(1, Number(route?.minutes || 0));
  const distance = Math.max(1, Number(route?.distanceKm || 0));
  const averageSpeed = distance / (minutes / 60);
  if (averageSpeed < 20 || minutes > Math.max(55, distance * 2.2)) return 'pesado';
  if (averageSpeed < 34 || minutes > Math.max(35, distance * 1.55)) return 'moderado';
  return 'leve';
}

function legSentence(leg = {}, index = 0, radar = null) {
  const flight = spokenFlightNumber(leg.flightNumber || `etapa ${index + 1}`);
  const departure = spokenTime(leg.departureTime);
  const arrival = spokenTime(leg.arrivalTime);
  const origin = airportName(leg.origin);
  const destination = airportName(leg.destination);
  const gate = radar?.gate || leg.gate;
  return `${index === 0 ? 'Primeiro' : `Depois, na perna ${index + 1}`}, ${flight}, saindo do ${origin.replace(/^aeroporto d[eo] /, '')} às ${departure}, com chegada em ${destination.replace(/^aeroporto d[eo] /, '')} às ${arrival}${gate ? `, pelo portão ${gate}` : ''}.`;
}

export function buildProgramSummary({ profile = {}, snapshot = {}, record = null, label = '', presentationTime = '', radar = null } = {}) {
  if (!record) return `${premiumGreeting(profile, snapshot)} Não encontrei uma programação confirmada para esse período.`;
  const legs = Array.isArray(record.legs) ? record.legs : [];
  const presentation = spokenTime(presentationTime || record.startTime);
  const end = spokenTime(record.endTime);
  const finalDestination = legs.at(-1)?.destination;
  const greeting = premiumGreeting(profile, snapshot);
  if (!legs.length) {
    const activity = String(record.code || 'atividade').toLowerCase();
    return `${greeting} ${label ? `${label}, ` : ''}você tem ${activity}. A apresentação é às ${presentation}, com término previsto às ${end}.`;
  }
  const count = legs.length;
  const opening = `${greeting} ${label ? `${label}, ` : ''}você tem ${count} perna${count === 1 ? '' : 's'}. A apresentação é às ${presentation}, e a chave termina em ${airportName(finalDestination).replace(/^aeroporto d[eo] /, '')} às ${end}.`;
  const details = legs.slice(0, 4).map((leg, index) => legSentence(leg, index, index === 0 ? radar : null));
  const remaining = count > 4 ? `As outras ${count - 4} pernas ficam detalhadas no card da escala.` : '';
  return [opening, ...details, remaining].filter(Boolean).join('\n');
}

export function buildBlankDaySummary({ profile = {}, snapshot = {}, day = null, label = 'Hoje' } = {}) {
  const greeting = premiumGreeting(profile, snapshot);
  const end = day?.restEnd || day?.offEnd || day?.folgaEnd || day?.dutyDebrief || day?.endTime || day?.dutyEnd;
  const code = String(day?.pairingCode || day?.type || '').toUpperCase();
  if (end && /DO|DOF|OFF|FOLGA|DR|DOP/.test(code)) {
    return `${greeting} ${label.toLowerCase()}, sua folga termina às ${spokenTime(end)}. Depois desse horário, confirme a próxima programação publicada.`;
  }
  return `${greeting} ${label.toLowerCase()}, seu dia está em branco na escala. Confirme com a escala antes de assumir que é folga.`;
}

export function buildDepartureSummary({ profile = {}, snapshot = {}, record = null, route = null, leaveTime = '', origin = '', radar = null, presentationTime = '' } = {}) {
  const greeting = premiumGreeting(profile, snapshot);
  if (!record) return `${greeting} Não encontrei uma programação presencial que exija deslocamento agora.`;
  if (!route) return `${greeting} A apresentação é às ${spokenTime(presentationTime)} em ${airportName(origin)}. Envie sua localização para eu calcular o trânsito e o horário de sair.`;
  const traffic = trafficLevel(route);
  const firstLeg = record.legs?.[0];
  const gate = radar?.gate || firstLeg?.gate;
  const flightPart = firstLeg
    ? ` Depois você segue no ${spokenFlightNumber(firstLeg.flightNumber)}, às ${spokenTime(firstLeg.departureTime)}${gate ? `, pelo portão ${gate}` : ''}.`
    : '';
  return `${greeting} saia às ${spokenTime(leaveTime)}. O trânsito está ${traffic}, e o trajeto até ${airportName(origin)} deve levar cerca de ${spokenDuration(route.minutes)}.${flightPart}`;
}

export function buildConciergeSettingsReply(profile = {}, snapshot = {}) {
  const premium = isPremiumConcierge(snapshot, profile);
  return [
    `${premiumGreeting(profile, snapshot)} Estas são as suas configurações do concierge:`,
    `• Como eu chamo você: ${preferredUserName(profile, snapshot)}`,
    `• Nome do concierge: ${preferredConciergeName(snapshot)}`,
    `• Respostas de voz: naturais, objetivas e somente para informações operacionais curtas`,
    '',
    'Para mudar seu nome, escreva: me chama de Seu Nome.',
    premium
      ? 'Para mudar o nome do concierge, escreva: nome do concierge Seu Nome.'
      : `O nome do concierge começa como ${DEFAULT_CONCIERGE_NAME}. A personalização desse nome é um recurso Premium.`,
    'Essas alterações são feitas somente por texto.',
  ].join('\n');
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

export function premiumVoicePolicy(replyText = '', transcript = '', maxCharacters = 650) {
  const reply = String(replyText || '').trim();
  const request = String(transcript || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normalized = reply.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!reply) return { allowed: false, reason: 'empty-reply' };
  if (/configurac|me chama de|nome do concierge|como gostaria de ser chamado|preferencia/i.test(`${request} ${normalized}`)) return { allowed: false, reason: 'settings-text-only' };
  if (/hospitais?|farmacias?|academias?|restaurantes?|mercados?|perto de mim|envie sua localizacao|compartilhe sua localizacao/i.test(`${request} ${normalized}`)) return { allowed: false, reason: 'location-or-directory-text-only' };
  const usefulBlankDay = /seu dia esta em branco|sua folga termina/.test(normalized);
  if (!usefulBlankDay && /nao (?:entendi|consegui|encontrei|localizei|tenho)|nenhuma programacao|sem escala|envie o pdf|tente novamente|indisponivel/.test(normalized)) return { allowed: false, reason: 'no-useful-answer' };
  if (reply.length > maxCharacters || reply.split(/\n+/).filter(Boolean).length > 7) return { allowed: false, reason: 'long-reply' };
  return { allowed: true, reason: 'natural-operational-answer' };
}
