// Pure source-time proof only. No provider calls, local-zone parsing or clock inference.
// REDEMET's official example pairs validade_inicial YYYY-MM-DD HH:mm:ss with
// the raw UTC group, separately from recebimento. This narrow normalization is
// inferred from that example plus DECEA's UTC decoding guide, not a general
// promise that arbitrary zoneless provider timestamps are UTC.
// https://ajuda.decea.mil.br/base-de-conhecimento/api-redemet-mensagem-metar/
// https://ajuda.decea.mil.br/base-de-conhecimento/como-decodificar-o-metar-e-o-speci/
const epoch = value => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function calendar(year, month, day) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function explicitEpoch(value) {
  if (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value), ms = number < 100_000_000_000 ? number * 1000 : number;
    return epoch(ms) ? ms : null;
  }
  if (typeof value !== 'string' || !iso.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number), ms = Date.parse(value);
  const clock = value.slice(11).match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?/);
  return calendar(year, month, day) && Number(clock[1]) <= 23 && Number(clock[2]) <= 59 && Number(clock[3] || 0) <= 59 && epoch(ms) ? ms : null;
}
export function weatherObservationSourceTime({ provider, source, raw } = {}) {
  let observedAt = null;
  if (provider === 'redemet' && source?.field === 'validade_inicial' && typeof source.value === 'string') {
    const match = source.value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
    if (!calendar(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
    observedAt = date.getTime();
  } else if (provider === 'aviationweather' && source?.field === 'obsTime') {
    observedAt = explicitEpoch(source.value);
  }
  if (!epoch(observedAt)) return null;
  const report = typeof raw === 'string' ? raw.trim().toUpperCase().replace(/\s+/g, ' ') : '';
  const group = report.match(/^(?:(?:METAR|SPECI)(?: COR)? )?[A-Z]{4} (\d{2})(\d{2})(\d{2})Z(?: |$)/);
  if (!group) return null;
  const date = new Date(observedAt);
  return date.getUTCDate() === Number(group[1]) && date.getUTCHours() === Number(group[2]) && date.getUTCMinutes() === Number(group[3]) ? observedAt : null;
}
