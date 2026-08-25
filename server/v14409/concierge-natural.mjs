import { conciergeHumanizeReplyV14408 } from '../v14408/concierge-human.mjs';

const MAX_SPOKEN_CHARS = 460;
const OFFICIAL_NOTICE = 'Se houver divergência, vale a escala oficial.';

function plain(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function envNumber(environment, names, fallback) {
  for (const name of names) {
    const raw = environment?.[name];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function classify(text = '') {
  const value = plain(text);
  if (/\b(cancelad|atras|irregular|violacao|violação|limite|fadiga|emergencia|emergência|hospital|alerta)\b/.test(value)) return 'alert';
  if (/\b(apresentacao|apresentação|escala|programacao|programação|voo|portao|portão|saida|saída|chegada|partida|retorno|jornada|repouso|sobreaviso|reserva)\b/.test(value)) return 'operational';
  return 'conversation';
}

function isRawWeather(query = '', reply = '') {
  const queryText = plain(query);
  if (/^\/(?:metar|taf|atis)\b.*\braw\b/.test(queryText)) return true;
  const rows = String(reply || '').trim().split(/\r?\n/).filter(Boolean);
  return rows.length <= 3 && rows.some((row) => /^(?:METAR|TAF|ATIS)\s+[A-Z]{4}\b/.test(row.trim()));
}

function cleanupLine(line = '') {
  return String(line || '')
    .replace(/^\s*(?:Apresentação|Próxima programação|Programação|Resumo da escala)\s*:?\s*$/i, '')
    .replace(/^Você se apresenta às\s+([^\s]+)\s+em\s+(.+)\.$/i, 'Sua apresentação é às $1 em $2.')
    .replace(/^Término publicado:\s*(.+)$/i, 'O término publicado é $1')
    .replace(/^Chegada prevista às\s+(.+)\.$/i, 'A chegada prevista é às $1.')
    .replace(/^Depois dessa programação:\s*$/i, 'Depois vem:')
    .replace(/^Não encontrei uma programação para consultar a apresentação\./i, 'Não achei uma programação confirmada para essa apresentação.')
    .replace(/^Não identifiquei qual detalhe você quer continuar\./i, 'Não entendi qual detalhe você quer continuar.')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function answerPriority(line = '', query = '') {
  const value = plain(line);
  const q = plain(query);
  if (/apresentacao|apresentação/.test(q) && /apresentacao e|apresentação é|se apresenta/.test(value)) return 100;
  if (/portao|portão/.test(q) && /portao|portão/.test(value)) return 100;
  if (/saida|saída|hora de sair/.test(q) && /saia|saida|saída/.test(value)) return 100;
  if (/chegada|quando chego/.test(q) && /chegada/.test(value)) return 100;
  if (/retorno|volto/.test(q) && /retorno|chegada/.test(value)) return 95;
  if (/proximo|próximo|depois/.test(q) && /la\s?\d{2,5}|jj\s?\d{2,5}|proxim|próxim|depois/.test(value)) return 90;
  if (/academia|wellhub|hotel|farmacia|farmácia|restaurante/.test(q) && /km|minuto|aberto|plano|wellhub|hotel|academia|farmacia|farmácia|restaurante/.test(value)) return 85;
  return 0;
}

function moveAnswerFirst(lines = [], query = '') {
  if (lines.length < 2) return lines;
  let bestIndex = -1;
  let bestScore = 0;
  lines.forEach((line, index) => {
    const score = answerPriority(line, query);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex <= 0) return lines;
  return [lines[bestIndex], ...lines.slice(0, bestIndex), ...lines.slice(bestIndex + 1)];
}

function dedupeNotice(lines = []) {
  let noticeSeen = false;
  return lines.filter((line) => {
    const normalized = plain(line);
    const isNotice = normalized === plain(OFFICIAL_NOTICE)
      || normalized.includes('confirme sempre a escala oficial')
      || normalized.includes('vale a escala oficial');
    if (!isNotice) return true;
    if (noticeSeen) return false;
    noticeSeen = true;
    return true;
  });
}

function removeCannedSuggestions(lines = []) {
  return lines.filter((line) => !/^(?:Se quiser, eu|Posso continuar|Posso cruzar|Posso calcular|Posso mostrar)/i.test(String(line || '').trim()));
}

function naturalParagraphs(lines = []) {
  const compact = [];
  for (const line of lines) {
    const value = String(line || '').trim();
    if (!value) continue;
    if (/^(?:Fonte oficial|Fonte verificada|Snapshot verificado)/i.test(value)) {
      compact.push(value);
      continue;
    }
    if (/^[A-Z0-9]{2,8}(?:\s*·\s*|\s+→\s+|\s+para\s+)/.test(value) || /\b(?:LA|JJ|G3|AD)\s?\d{2,5}\b/.test(value)) {
      compact.push(value);
      continue;
    }
    compact.push(value);
  }
  return compact.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function conciergeNaturalReplyV14409(reply = '', query = '') {
  const original = String(reply || '').trim();
  if (!original) return '';
  if (isRawWeather(query, original)) return original;

  const base = conciergeHumanizeReplyV14408(original, query, { suggest: false });
  let lines = base.split(/\r?\n/)
    .map(cleanupLine)
    .filter(Boolean);

  lines = removeCannedSuggestions(lines);
  lines = dedupeNotice(lines);
  lines = moveAnswerFirst(lines, query);

  let result = naturalParagraphs(lines)
    .replace(/\bVocê se apresenta às\b/gi, 'Sua apresentação é às')
    .replace(/\bNão encontrei\b/gi, 'Não achei')
    .replace(/\bPara continuar, informe\b/gi, 'Me diga')
    .replace(/\s+\.\s*/g, '. ')
    .trim();

  if (classify(query) === 'operational' && !plain(result).includes(plain(OFFICIAL_NOTICE))) {
    result = `${result}\n\n${OFFICIAL_NOTICE}`.trim();
  }
  return result;
}

function voiceFacts(text = '') {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const kept = [];
  for (const line of lines) {
    if (/^(?:Fonte oficial|Fonte verificada|Snapshot verificado)/i.test(line)) continue;
    if (/^Se houver divergência, vale a escala oficial\.?$/i.test(line)) continue;
    kept.push(line);
    if (kept.length >= 4) break;
  }
  return kept;
}

function shortenAtSentence(text = '', limit = MAX_SPOKEN_CHARS) {
  const value = String(text || '').trim();
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit);
  const candidates = [clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '), clipped.lastIndexOf('; ')];
  const boundary = Math.max(...candidates);
  const head = boundary >= 180 ? clipped.slice(0, boundary + 1) : clipped;
  return `${head.trim()} O restante ficou no texto.`;
}

export function conciergeVoiceScriptV14409(reply = '', query = '') {
  const natural = conciergeNaturalReplyV14409(reply, query);
  if (!natural) return '';
  if (isRawWeather(query, natural)) return natural;

  const facts = voiceFacts(natural);
  let value = facts.join('. ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/→|➡️?/g, ' para ')
    .replace(/\b24h\b/gi, 'vinte e quatro horas')
    .replace(/\b(Basic|Silver|Gold|Diamond)\+/g, '$1 Plus')
    .replace(/R\$\s*(\d+(?:[.,]\d+)?)/g, '$1 reais')
    .replace(/\(([^)]{1,40})\)/g, ', $1,')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/,\s*,/g, ',')
    .trim();

  if (classify(query) === 'operational' && !/escala oficial/i.test(value)) {
    value = `${value} Se a escala mudar, vale a oficial.`;
  }
  return shortenAtSentence(value);
}

export function conciergeVoiceSettingsV14409(text = '', environment = process.env) {
  const mode = classify(text);
  const defaults = mode === 'alert'
    ? { stability: 0.57, similarity_boost: 0.80, style: 0.00, speed: 0.95 }
    : mode === 'operational'
      ? { stability: 0.47, similarity_boost: 0.79, style: 0.03, speed: 0.97 }
      : { stability: 0.40, similarity_boost: 0.76, style: 0.08, speed: 0.99 };

  return {
    stability: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_STABILITY', 'CREWCHECK_ELEVENLABS_TTS_STABILITY', 'ELEVENLABS_STABILITY', 'ELEVENLABS_TTS_STABILITY'], defaults.stability), 0, 1),
    similarity_boost: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_SIMILARITY_BOOST', 'CREWCHECK_ELEVENLABS_TTS_SIMILARITY_BOOST', 'ELEVENLABS_SIMILARITY_BOOST', 'ELEVENLABS_TTS_SIMILARITY_BOOST'], defaults.similarity_boost), 0, 1),
    style: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_STYLE', 'CREWCHECK_ELEVENLABS_TTS_STYLE', 'ELEVENLABS_STYLE', 'ELEVENLABS_TTS_STYLE'], defaults.style), 0, 1),
    use_speaker_boost: String(environment?.CREWCHECK_ELEVENLABS_SPEAKER_BOOST ?? environment?.CREWCHECK_ELEVENLABS_TTS_SPEAKER_BOOST ?? environment?.ELEVENLABS_SPEAKER_BOOST ?? environment?.ELEVENLABS_TTS_SPEAKER_BOOST ?? 'true').toLowerCase() !== 'false',
    speed: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_SPEED', 'CREWCHECK_ELEVENLABS_TTS_SPEED', 'ELEVENLABS_SPEED', 'ELEVENLABS_TTS_SPEED'], defaults.speed), 0.7, 1.2),
  };
}

export function conciergeVoiceProfileV14409(text = '') {
  return classify(text);
}

export const CONCIERGE_MAX_SPOKEN_CHARS_V14409 = MAX_SPOKEN_CHARS;
