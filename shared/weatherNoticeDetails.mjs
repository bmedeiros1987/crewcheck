// Presentation only: never an observation validator, severity policy or delta.
// Callers retain admission, account/occurrence scope, consent and delivery policy.
const WEATHER = Object.freeze({
  TS: 'trovoada', TSRA: 'trovoada com chuva', '+TSRA': 'trovoada com chuva forte', '-TSRA': 'trovoada com chuva leve',
  VCTS: 'trovoada nas proximidades', VCTSRA: 'trovoada com chuva nas proximidades',
  RA: 'chuva', '+RA': 'chuva forte', '-RA': 'chuva leve',
  FG: 'nevoeiro', BR: 'névoa úmida', FZRA: 'chuva congelante', FZDZ: 'chuvisco congelante', FZFG: 'nevoeiro congelante',
  SN: 'neve', SHSN: 'pancadas de neve', BLSN: 'neve soprada', GR: 'granizo', VA: 'cinzas vulcânicas',
  SQ: 'rajadas súbitas', FC: 'nuvem funil/tromba', '+FC': 'tornado/tromba', WS: 'cortante de vento',
});

function observationDate(value, header) {
  let stamp = NaN;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) stamp = number < 100_000_000_000 ? number * 1000 : number;
  } else if (typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    stamp = Date.parse(value);
  }
  const date = new Date(stamp);
  return Number.isFinite(date.getTime()) && date.getUTCDate() === Number(header[3])
    && date.getUTCHours() === Number(header[4]) && date.getUTCMinutes() === Number(header[5]) ? date : null;
}

/** A compact, bounded summary of supported current METAR/SPECI body facts.
 * Unknown/absent fields are omitted, never coerced to zero. No previous report,
 * clock, locale, retrieval timestamp or monitoring.hazards enters this formatter.
 */
export function formatWeatherNoticeDetails({ raw, observedAt, station } = {}) {
  if (typeof raw !== 'string' || raw.length > 4096) return 'Detalhes observados indisponíveis';
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, ' ').replace(/=$/, '');
  const header = normalized.match(/^(?:(METAR|SPECI)(?: COR)? )?([A-Z]{4}) (\d{2})(\d{2})(\d{2})Z(?: |$)/);
  if (!header || Number(header[3]) < 1 || Number(header[3]) > 31 || Number(header[4]) > 23 || Number(header[5]) > 59
    || (station !== undefined && (typeof station !== 'string' || station.toUpperCase() !== header[2]))) return 'Detalhes observados indisponíveis';
  const tokens = normalized.slice(header[0].length).split(' ');
  // Forecast/trend/remarks/recent-weather are not current observed conditions.
  const boundary = tokens.findIndex(token => /^(?:RMK|NOSIG|BECMG|TEMPO|TREND|TAF|PROB\d{2}|FM\d{4,6}|TL\d{4}|AT\d{4})$/.test(token));
  const body = boundary < 0 ? tokens : tokens.slice(0, boundary);
  const facts = [];
  const windToken = body.find(token => /^(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?KT$/.test(token));
  const wind = windToken?.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/);
  if (wind && (wind[1] === 'VRB' || Number(wind[1]) <= 360)) {
    if (windToken === '00000KT') facts.push('Vento calmo (0 kt)');
    else if (Number(wind[2]) > 0 && wind[1] !== '000') {
      facts.push(`Vento ${wind[1] === 'VRB' ? 'variável' : `${wind[1]}°`}: ${Number(wind[2])} kt`);
      if (wind[3] !== undefined && Number(wind[3]) > 0) facts.push(`rajadas ${Number(wind[3])} kt`);
    }
  }
  const weather = [...new Set(body.flatMap(token => WEATHER[token] ? [WEATHER[token]] : []))].slice(0, 3);
  facts.push(...weather);
  const visibility = body.find(token => /^\d{4}$/.test(token));
  if (body.includes('CAVOK') || visibility === '9999') facts.push('visibilidade ≥10 km');
  else if (visibility === '0000') facts.push('visibilidade <50 m');
  else if (visibility) facts.push(`visibilidade ${Number(visibility)} m`);
  const ceilings = body.flatMap(token => { const match = token.match(/^(?:BKN|OVC)(\d{3})(?:CB|TCU)?$/); return match ? [Number(match[1]) * 100] : []; });
  const unknownCeiling = body.some(token => /^(?:BKN|OVC)(?:000|\/\/\/)(?:CB|TCU)?$/.test(token));
  if (ceilings.length && !unknownCeiling) facts.push(`teto ${Math.min(...ceilings)} pés`);
  if (body.some(token => /^(?:FEW|SCT|BKN|OVC)\d{3}CB$/.test(token))) facts.push('cumulonimbus');
  const product = `${header[1] || 'METAR'}${/^(?:METAR|SPECI) COR /.test(normalized) || body.includes('COR') ? ' COR' : ''}`;
  const date = observationDate(observedAt, header);
  const day = date ? `${header[3]}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}` : `dia ${header[3]}`;
  facts.push(`${product} ${day} ${header[4]}:${header[5]} UTC`);
  return facts.join(' · ');
}
