export const CONCIERGE_OFFICIAL_ROSTER_NOTICE_V14354 = 'Confirme sempre a escala oficial e as comunicações da empresa. Em caso de divergência, a fonte oficial prevalece.';

const UNIT_WORDS = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
};
const TENS_WORDS = {
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
};
const BASIC_NUMBER_WORD = 'zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezassete|dezessete|dezoito|dezenove';
const TENS_NUMBER_WORD = 'vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa';
const PT_NUMBER_EXPRESSION = `(?:${BASIC_NUMBER_WORD}|(?:${TENS_NUMBER_WORD})(?:\\s+e\\s+(?:um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove))?)`;

function plain(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function parseConciergePtNumberV14354(value = '') {
  const normalized = plain(value).replace(/-/g, ' ').replace(/\s+/g, ' ');
  if (Object.hasOwn(UNIT_WORDS, normalized)) return UNIT_WORDS[normalized];
  if (Object.hasOwn(TENS_WORDS, normalized)) return TENS_WORDS[normalized];
  const match = normalized.match(/^(\S+)\s+e\s+(\S+)$/);
  if (!match || !Object.hasOwn(TENS_WORDS, match[1]) || !Object.hasOwn(UNIT_WORDS, match[2])) return null;
  const unit = UNIT_WORDS[match[2]];
  return unit >= 1 && unit <= 9 ? TENS_WORDS[match[1]] + unit : null;
}

function compactCount(number, unit = '') {
  const normalizedUnit = plain(unit);
  if (normalizedUnit.startsWith('minuto')) return `${number} min`;
  if (normalizedUnit.startsWith('hora')) return `${number} h`;
  if (normalizedUnit.startsWith('dia')) return `${number} ${number === 1 ? 'dia' : 'dias'}`;
  if (normalizedUnit.startsWith('voo')) return `${number} ${number === 1 ? 'voo' : 'voos'}`;
  if (normalizedUnit.startsWith('etapa')) return `${number} ${number === 1 ? 'etapa' : 'etapas'}`;
  if (normalizedUnit.startsWith('alerta')) return `${number} ${number === 1 ? 'alerta' : 'alertas'}`;
  if (normalizedUnit.startsWith('fonte')) return `${number} ${number === 1 ? 'fonte' : 'fontes'}`;
  if (normalizedUnit.startsWith('ponto')) return `${number} ${number === 1 ? 'ponto' : 'pontos'}`;
  return `${number} ${unit}`.trim();
}

function normalizeSpokenClocks(value) {
  let next = value
    .replace(/(^|[\s(])(?:a|as|às)\s+meio[- ]?dia\b/giu, '$1às 12:00')
    .replace(/(^|[\s(])(?:a|as|às)\s+meia[- ]?noite\b/giu, '$1às 00:00');

  const hourMinute = new RegExp(`(^|[\\s(])(?:a|as|às)\\s+(${PT_NUMBER_EXPRESSION})\\s+e\\s+(${PT_NUMBER_EXPRESSION})\\b`, 'gimu');
  next = next.replace(hourMinute, (match, leading, hourWord, minuteWord) => {
    const hour = parseConciergePtNumberV14354(hourWord);
    const minute = parseConciergePtNumberV14354(minuteWord);
    if (hour === null || minute === null || hour > 23 || minute > 59) return match;
    return `${leading}às ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  });

  const exactHour = new RegExp(`(^|[\\s(])(?:a|as|às)\\s+(${PT_NUMBER_EXPRESSION})\\s+horas?\\b`, 'gimu');
  next = next.replace(exactHour, (match, leading, hourWord) => {
    const hour = parseConciergePtNumberV14354(hourWord);
    return hour !== null && hour <= 23 ? `${leading}às ${String(hour).padStart(2, '0')}:00` : match;
  });

  return next
    .replace(/(^|[\s(])(?:a|as)\s+(\d{1,2}):(\d{2})\b/gimu, (_, leading, hour, minute) => `${leading}às ${String(Number(hour)).padStart(2, '0')}:${minute}`)
    .replace(/(^|[\s(])(?:a|as)\s+(\d{1,2})\s*h(?:oras?)?\b/gimu, (_, leading, hour) => `${leading}às ${String(Number(hour)).padStart(2, '0')}:00`);
}

function normalizeCallsignDigits(value) {
  const digitWords = '(?:zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove)';
  const pattern = new RegExp(`\\b(LA|JJ|G3|AD|AZU|LAN|TAM)\\s+(${digitWords}(?:\\s+${digitWords}){1,5})\\b`, 'giu');
  return value.replace(pattern, (match, prefix, digitsText) => {
    const digits = String(digitsText).split(/\s+/).map((word) => parseConciergePtNumberV14354(word));
    return digits.every((digit) => digit !== null && digit >= 0 && digit <= 9) ? `${String(prefix).toUpperCase()}${digits.join('')}` : match;
  });
}

export function conciergeFormatTextV14354(value = '') {
  let next = normalizeCallsignDigits(normalizeSpokenClocks(String(value || '')));
  const countWords = new RegExp(`\\b(${PT_NUMBER_EXPRESSION})\\s+(minutos?|horas?|dias?|voos?|etapas?|alertas?|fontes?|pontos?)\\b`, 'giu');
  next = next.replace(countWords, (match, numberWord, unit) => {
    const number = parseConciergePtNumberV14354(numberWord);
    return number === null ? match : compactCount(number, unit);
  });
  next = next
    .replace(/\b(\d+)\s+minutos?\b/giu, '$1 min')
    .replace(/\b(\d+)\s+horas?\b/giu, '$1 h')
    .replace(/\b1\s+dias\b/giu, '1 dia')
    .replace(/\b1\s+voos\b/giu, '1 voo')
    .replace(/\b1\s+etapas\b/giu, '1 etapa')
    .replace(/\b1\s+alertas\b/giu, '1 alerta')
    .replace(/\b1\s+fontes\b/giu, '1 fonte')
    .replace(/\b1\s+pontos\b/giu, '1 ponto');

  const lines = next
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .filter((line) => !/^Qualidade da consulta:/i.test(line.trim()));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function conciergeNeedsOfficialRosterNoticeV14354(query = '') {
  const normalized = plain(query);
  if (!normalized) return false;
  return /^(?:\/(?:hoje|amanha|proximo|escala|saida|diarias|conformidade|regulamentacao)\b)/.test(normalized)
    || /\b(escala|programacao|apresentacao|horario|hora de sair|proximo voo|proxima atividade|jornada|repouso|descanso|rbac|act|irregularidade)\b/.test(normalized);
}

export function conciergeFinalizeReplyV14354(reply = '', query = '') {
  const formatted = conciergeFormatTextV14354(reply);
  if (!formatted || !conciergeNeedsOfficialRosterNoticeV14354(query)) return formatted;
  if (/escala oficial|fonte oficial prevalece/i.test(formatted)) return formatted;
  return `${formatted}\n\n${CONCIERGE_OFFICIAL_ROSTER_NOTICE_V14354}`;
}
