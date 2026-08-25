const COMPACT_ROSTER_NOTICE = 'Se houver divergência, vale a escala oficial.';
const MAX_VOICE_CHARS = 720;

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
    const value = Number(environment?.[name]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isOperationalQuery(query = '') {
  const normalized = plain(query);
  return /^(?:\/(?:hoje|amanha|proximo|escala|saida|diarias|conformidade|regulamentacao)\b)/.test(normalized)
    || /\b(escala|programacao|apresentacao|horario|hora de sair|proximo voo|proxima atividade|jornada|repouso|descanso|rbac|act|irregularidade|voo|portao|retorno para a base)\b/.test(normalized);
}

function isRawWeather(query = '', reply = '') {
  const normalized = plain(query);
  if (/^\/(?:metar|taf|atis)\b.*\braw\b/.test(normalized)) return true;
  const lines = String(reply || '').split(/\r?\n/).filter(Boolean);
  return lines.length <= 3 && lines.some((line) => /^(?:METAR|TAF|ATIS)\s+[A-Z]{4}\b/.test(line.trim()));
}

function isLongRosterNotice(line = '') {
  const normalized = plain(line);
  return normalized.includes('confirme sempre a escala oficial e as comunicacoes da empresa')
    || normalized === 'confirme sempre a escala oficial antes da programacao.'
    || normalized === 'confirme sempre a escala oficial antes da programacao'
    || normalized === plain(COMPACT_ROSTER_NOTICE);
}

function cleanDisplayLine(line = '') {
  return String(line || '')
    .replace(/^\s*Nota leve:\s*/i, '')
    .replace(/^\s*Resposta operacional(?: contextual)?(?: gerada)?[.:]?\s*/i, '')
    .replace(/^\s*Contexto usado:\s*/i, '')
    .replace(/^\s*Qualidade da consulta:[^\n]*$/i, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function conversationalReplacement(value = '') {
  return String(value || '')
    .replace(/Ainda não tenho uma escala ativa\. Envie o PDF oficial ou sincronize a escala pelo app\./gi, 'Ainda não encontrei uma escala ativa aqui. Envie o PDF oficial ou sincronize a escala pelo app e eu continuo daqui.')
    .replace(/Não identifiquei qual detalhe você quer continuar\. Diga apenas o dado:/gi, 'Não peguei qual detalhe você quer. Pode responder só com:')
    .replace(/Não encontrei uma programação para consultar a apresentação\./gi, 'Não achei uma programação confirmada para consultar a apresentação.')
    .replace(/Não encontrei outra programação depois dessa no período publicado\./gi, 'Depois dessa, não achei outra programação no período publicado.')
    .replace(/nenhuma programação publicada foi encontrada na escala ativa\./gi, 'não encontrei programação publicada na escala ativa.')
    .replace(/ElevenLabs aguardando configuração\./gi, 'O áudio está temporariamente indisponível.');
}

function dedupeLines(lines = []) {
  const seen = new Set();
  return lines.filter((line) => {
    const key = plain(line).replace(/[.!?]+$/g, '');
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function followUpFor(query = '', reply = '') {
  const normalized = plain(query);
  const response = plain(reply);
  if (!normalized || /^\//.test(String(query || '').trim()) || /\?\s*$/.test(String(reply || '').trim())) return '';
  if (/\b(academia|wellhub|gympass|treino)\b/.test(normalized) && !/proxima apresentacao|próxima apresentação/.test(response)) {
    return 'Posso cruzar academia, seu plano e a janela antes da próxima apresentação.';
  }
  if (/\b(hotel|pernoite|onde vou dormir)\b/.test(normalized)) {
    return 'Se quiser, eu também procuro academia, farmácia ou restaurante perto do pernoite.';
  }
  if (/\b(portao|status do voo|radar)\b/.test(normalized)) {
    return 'Posso continuar nesse mesmo voo se você perguntar só “e a chegada?” ou “e o portão?”.';
  }
  if (/\b(escala|programacao|apresentacao|proximo voo|amanha|hoje|quando volto)\b/.test(normalized)) {
    return 'Se quiser, eu continuo daí e calculo a saída ou mostro o que vem depois.';
  }
  return '';
}

export function conciergeHumanizeReplyV14408(reply = '', query = '', options = {}) {
  const original = String(reply || '').trim();
  if (!original) return '';
  if (isRawWeather(query, original)) return original;

  let rosterNotice = false;
  const lines = original.split(/\r?\n/).map((line) => {
    if (isLongRosterNotice(line)) {
      rosterNotice = true;
      return '';
    }
    return cleanDisplayLine(line);
  });

  let result = dedupeLines(lines)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*\n(?=[,.!?])/g, '\n')
    .trim();

  result = conversationalReplacement(result);
  const needsNotice = rosterNotice || isOperationalQuery(query);
  if (needsNotice && !plain(result).includes(plain(COMPACT_ROSTER_NOTICE))) {
    result = `${result}\n\n${COMPACT_ROSTER_NOTICE}`.trim();
  }

  if (options.suggest !== false) {
    const followUp = followUpFor(query, result);
    if (followUp && !plain(result).includes(plain(followUp))) result = `${result}\n\n${followUp}`;
  }
  return result;
}

function trimVoiceAtSentence(value = '', limit = MAX_VOICE_CHARS) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const boundary = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '));
  return `${(boundary >= 220 ? clipped.slice(0, boundary + 1) : clipped).trim()} O restante está no texto.`;
}

export function conciergeVoiceScriptV14408(reply = '', query = '') {
  let value = conciergeHumanizeReplyV14408(reply, query, { suggest: false })
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/^\s*(?:Fonte oficial|Fonte verificada|Snapshot verificado)[^\n]*$/gim, '')
    .replace(new RegExp(`\\n?${COMPACT_ROSTER_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), isOperationalQuery(query) ? '\nSe a escala mudar, vale a oficial.' : '')
    .replace(/\b(Basic|Silver|Gold|Diamond)\+/g, '$1 Plus')
    .replace(/\b24h\b/gi, 'vinte e quatro horas')
    .replace(/[•▪◦]/g, '. ')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim();
  value = trimVoiceAtSentence(value);
  return value;
}

export function conciergeElevenLabsVoiceSettingsV14408(environment = process.env) {
  return {
    stability: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_STABILITY', 'ELEVENLABS_STABILITY', 'ELEVENLABS_TTS_STABILITY'], 0.52), 0, 1),
    similarity_boost: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_SIMILARITY_BOOST', 'ELEVENLABS_SIMILARITY_BOOST', 'ELEVENLABS_TTS_SIMILARITY_BOOST'], 0.76), 0, 1),
    style: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_STYLE', 'ELEVENLABS_STYLE', 'ELEVENLABS_TTS_STYLE'], 0), 0, 1),
    use_speaker_boost: String(environment?.CREWCHECK_ELEVENLABS_SPEAKER_BOOST ?? environment?.ELEVENLABS_SPEAKER_BOOST ?? environment?.ELEVENLABS_TTS_SPEAKER_BOOST ?? 'true').toLowerCase() !== 'false',
    speed: clamp(envNumber(environment, ['CREWCHECK_ELEVENLABS_SPEED', 'ELEVENLABS_SPEED', 'ELEVENLABS_TTS_SPEED'], 0.98), 0.7, 1.2),
  };
}

export const CONCIERGE_COMPACT_ROSTER_NOTICE_V14408 = COMPACT_ROSTER_NOTICE;
export const CONCIERGE_MAX_VOICE_CHARS_V14408 = MAX_VOICE_CHARS;
