/** Screenshot candidates are untrusted, ephemeral suggestions, never provider facts.
 * No IO, ambient clock, inferred timezone, room, scheduler or sharing permission. */
export const STAY_SCREENSHOT_FIELDS = Object.freeze([
  'hotelName', 'apzTime', 'apzDate', 'apzTimeZone', 'transportProvider',
  'transportLocation', 'pickupDate', 'pickupTime', 'pickupTimeZone',
]);
const textual = new Set(['hotelName', 'transportProvider', 'transportLocation']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const normalized = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const emptyValues = () => Object.fromEntries(STAY_SCREENSHOT_FIELDS.map(key => [key, '']));
const groups = [['apzTime', 'apzDate', 'apzTimeZone'], ['transportProvider', 'transportLocation', 'pickupDate', 'pickupTime', 'pickupTimeZone']];
const grouped = new Set(groups.flat());
const forbidden = /\b(?:password|senha|bearer|cookie|token|authorization|reservation|reserva|booking|room|quarto)\s*[:=#]|data:|https?:\/\/|[<>]/iu;
const priorValue = value => typeof value === 'string' && value.length <= 180 && !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(value) && !forbidden.test(value) ? value : '';
// Current manual strings are not input candidates. Preserve them byte-for-byte
// unless their field is explicitly replaced; never sanitize unrelated draft data.
const currentValues = value => Object.fromEntries(STAY_SCREENSHOT_FIELDS.map(key => [key, own(value, key) && typeof value[key] === 'string' ? value[key] : '']));

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 2199) return false;
  const epoch = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value;
}
function validZone(value) {
  // Reject offsets, browser locale abbreviations and arbitrary aliases. UTC is explicit.
  if (value !== 'UTC' && !/^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}
function cleanValue(key, value) {
  if (typeof value !== 'string') return '';
  value = value.trim();
  if (!value || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(value)) return '';
  if (textual.has(key)) {
    if (value.length > (key === 'transportLocation' ? 180 : 120) || !/[\p{L}]/u.test(value)) return '';
    // Do not retain a line accidentally containing credentials, provider IDs or data URLs.
    if (forbidden.test(value)) return '';
    return value.replace(/ {2,}/g, ' ');
  }
  if (key.endsWith('Date')) return validDate(value) ? value : '';
  if (key.endsWith('TimeZone')) return validZone(value) ? value : '';
  if (key.endsWith('Time')) return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : '';
  return '';
}

/** Persist ONLY this return value, never the parser result or OCR text. Empty values
 * are omitted: choosing an absent/invalid suggestion must not clear manual data. */
export function sanitizeStayScreenshotValues(value) {
  const result = {};
  if (!object(value)) return result;
  for (const key of STAY_SCREENSHOT_FIELDS) {
    if (!own(value, key)) continue;
    const cleaned = cleanValue(key, value[key]);
    if (cleaned) result[key] = cleaned;
  }
  return result;
}

function dateCandidates(text) {
  const result = [];
  for (const match of text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) result.push(validDate(match[1]) ? match[1] : '');
  for (const match of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    const first = Number(match[1]), second = Number(match[2]);
    // Neither an English date order nor the user's/browser's locale is assumed.
    // A printed format marker or impossible US month makes DD/MM unambiguous.
    const explicitDMY = /\bdd\s*\/\s*mm\s*\/\s*(?:yyyy|aaaa)\b/i.test(text);
    const dayFirst = explicitDMY || first > 12;
    const value = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    result.push(dayFirst && second <= 12 && validDate(value) ? value : '');
  }
  return result;
}
function timeCandidates(text) {
  const source = text.normalize('NFKC');
  return [...source.matchAll(/\b(\d{1,2}):([0-9]{2})(?::[0-9]{2})?\b/g)].flatMap(match => {
    // Signed clocks are offsets/ranges, not presentation times. Do not parse
    // the numeric tail of UTC/GMT offsets (including Unicode minus/plus).
    const before = source.slice(0, match.index);
    if (/[+±\p{Dash_Punctuation}\u2212]\s*$/u.test(before)) {
      // A clock range is ambiguous, not a license to keep only its first end.
      if (/\d{1,2}:[0-9]{2}\s*[+±\p{Dash_Punctuation}\u2212]\s*$/u.test(before)) return [''];
      return [];
    }
    // Seconds and AM/PM require human review, not truncation or convention guessing.
    if (match[0].split(':').length !== 2 || /\b(?:am|pm)\b/i.test(source)) return [''];
    return [cleanValue('apzTime', `${match[1].padStart(2, '0')}:${match[2]}`)];
  });
}

function zoneCandidates(text) {
  const source = text.normalize('NFKC');
  return [...source.matchAll(/\b(?:UTC|[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)\b/g)]
    .map(match => {
      // UTC+03, UTC −3 and Unicode/full-width sign variants are offsets, not
      // standalone UTC. Never suggest the UTC substring of an offset token.
      const suffix = source.slice(match.index + match[0].length);
      if (match[0] === 'UTC' && /^(?:[\w/]|\s*[([]?\s*[+±\p{Dash_Punctuation}\u2212])/u.test(suffix)) return '';
      return cleanValue('apzTimeZone', match[0]);
    });
}

const hotelLabel = /^(?:hotel|hotel name|nome do hotel|hospedagem)$/;
const providerLabel = /^(?:transport|transportation|transport provider|transport company|transportation provider|transporte|transportadora|empresa de transporte|shuttle provider)$/;
const locationLabel = /^(?:pickup location|pick-up location|pickup point|pick-up point|local de pickup|local de embarque|local do transporte|ponto de encontro|meeting point)$/;
const apzLabel = /^(?:(?:data|date|hora|horario|time|fuso|timezone|time zone) (?:da |do |de )?)?(?:apz (?:no |do )?(?:hotel|hall)|(?:hotel|hall) apz|apresentacao (?:no |do )(?:hotel|hall)|hotel report(?:ing)?(?: time)?)(?: (?:date|data|time|hora|horario|timezone|time zone|fuso))?$/;
const pickupLabel = /^(?:(?:data|date|hora|horario|time|fuso|timezone|time zone) (?:da |do |de )?)?(?:pickup|pick-up|embarque do transporte)(?: (?:date|data|time|hora|horario|timezone|time zone|fuso))?$/;

/** Evidence strings exist ONLY to show a transient preview. Callers must drop this
 * complete object on cancel/apply, owner/occurrence changes and unmount. */
export function parseStayScreenshot(text, confidence) {
  const values = emptyValues(), evidence = {}, warnings = [], candidates = new Map(), reservations = new Set();
  const result = () => ({ source: 'screenshot', values, evidence, uncertain: STAY_SCREENSHOT_FIELDS.filter(key => !values[key]), warnings });
  if (typeof text !== 'string' || text.length > 32_000 || !Number.isFinite(confidence) || confidence < 70 || confidence > 100) {
    warnings.push('low-confidence-or-invalid-text'); return result();
  }
  const add = (key, value, line) => {
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push({ value: cleanValue(key, value), line });
  };
  let hotelCount = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 500) continue;
    const reservation = /^(?:reservation|reserva|booking)(?: id| number| numero| n[º°])?\s*[:#-]\s*(\S+)/i.exec(normalized(line));
    if (reservation) reservations.add(reservation[1]);
    // Delimited labels only. Do not guess from flight tables or naked dates/clocks.
    const parts = /^([^:]{2,70}?)\s*(?::|\s[-–—]\s)\s*(.+)$/.exec(line);
    if (!parts) continue;
    const label = normalized(parts[1]).replace(/\s+/g, ' ').trim(), body = parts[2].trim();
    if (hotelLabel.test(label)) { hotelCount++; add('hotelName', body, line); continue; }
    if (providerLabel.test(label)) { add('transportProvider', body, line); continue; }
    if (locationLabel.test(label)) { add('transportLocation', body, line); continue; }
    const prefix = apzLabel.test(label) ? 'apz' : pickupLabel.test(label) ? 'pickup' : '';
    if (!prefix) continue;
    // A mixed label/body cannot turn a departure/check-in/pickup into hotel APZ.
    if (prefix === 'apz' && /\b(?:pickup|pick-up|check.?in|flight|voo|departure|decolagem)\b/i.test(body)) {
      for (const suffix of ['Time', 'Date', 'TimeZone']) add(prefix + suffix, '', line);
      continue;
    }
    // Qualified labels constrain extraction. A timezone offset on a Fuso line
    // is never a clock; a Hora/Data field cannot silently supply another field.
    const kind = /\b(?:fuso|timezone|time zone)\b/.test(label) ? 'zone'
      : /\b(?:date|data)\b/.test(label) ? 'date'
      : /\b(?:time|hora|horario)\b/.test(label) ? 'time' : 'combined';
    if (kind === 'combined' || kind === 'date') for (const value of dateCandidates(body)) add(prefix + 'Date', value, line);
    if (kind === 'combined' || kind === 'time') for (const value of timeCandidates(body)) add(prefix + 'Time', value, line);
    if (kind === 'combined' || kind === 'zone') for (const value of zoneCandidates(body)) add(prefix + 'TimeZone', value, line);
  }
  // Even repeated identical hotel rows may be separate reservations: do not merge.
  if (reservations.size > 1 || hotelCount > 1) { warnings.push('multiple-bookings'); return result(); }
  // Distinct explicit values for one field may describe different reservations
  // or directions. There is no safe cross-line record association to choose one.
  if ([...candidates.values()].some(entries => new Set(entries.map(entry => entry.value).filter(Boolean)).size > 1)) {
    warnings.push('conflicting-records'); return result();
  }
  for (const [key, entries] of candidates) {
    const unique = new Set(entries.map(entry => entry.value));
    if (unique.size === 1 && !unique.has('')) {
      values[key] = entries[0].value;
      evidence[key] = entries[0].line;
    } else warnings.push(`review-${key}`);
  }
  return result();
}

/** Stored provenance is a tiny operational allowlist, never OCR evidence. */
export function sanitizeStayScreenshotImport(value) {
  if (!object(value) || value.version !== 1 || value.source !== 'screenshot' || value.reviewedByUser !== true || !object(value.fields)) return undefined;
  const fields = {};
  for (const key of STAY_SCREENSHOT_FIELDS) {
    const item = value.fields[key];
    if (!object(item)) continue;
    const imported = cleanValue(key, item.value), previous = priorValue(item.previous);
    if ((!imported && !(item.value === '' && grouped.has(key))) || typeof item.previous !== 'string' || previous !== item.previous) continue;
    fields[key] = { value: imported, previous };
  }
  return Object.keys(fields).length ? { version: 1, source: 'screenshot', reviewedByUser: true, fields } : undefined;
}

/** Call ONLY after explicit user confirmation. Pure draft update: no persistence. */
export function createStayScreenshotImport(current, selected, previousImport) {
  const values = currentValues(current);
  const selectedValues = sanitizeStayScreenshotValues(selected);
  const prior = sanitizeStayScreenshotImport(previousImport);
  const fields = { ...prior?.fields };
  const updates = {}, rejectedFields = [];
  const previousValue = key => prior?.fields[key] && values[key] === prior.fields[key].value ? prior.fields[key].previous : values[key];
  const canRestore = key => priorValue(previousValue(key)) === previousValue(key);
  if (selectedValues.hotelName) {
    if (canRestore('hotelName')) updates.hotelName = selectedValues.hotelName;
    else rejectedFields.push('hotelName');
  }
  // Group replacement is atomic. Incomplete source date/zone never borrows the
  // old occurrence's values. Entirely empty/invalid selections remain a no-op.
  for (const group of groups) if (group.some(key => own(selectedValues, key))) {
    // Do not overwrite old manual values we could not safely restore later.
    // Reject the entire group rather than silently keeping just its old zone.
    if (!group.every(canRestore)) { rejectedFields.push(...group); continue; }
    for (const key of group) updates[key] = selectedValues[key] || '';
  }
  for (const [key, value] of Object.entries(updates)) {
    const preceding = prior?.fields[key];
    const previous = preceding && values[key] === preceding.value ? preceding.previous : values[key];
    values[key] = value;
    fields[key] = { value, previous };
  }
  return { values, imported: sanitizeStayScreenshotImport({ version: 1, source: 'screenshot', reviewedByUser: true, fields }), rejectedFields };
}

/** Manual changes after import win. Revert only still-matching imported values;
 * return a new allowed draft map; the caller clears provenance on explicit save. */
export function removeStayScreenshotImport(current, imported) {
  const values = currentValues(current);
  const metadata = sanitizeStayScreenshotImport(imported);
  for (const [key, field] of Object.entries(metadata?.fields || {})) if (values[key] === field.value) values[key] = field.previous;
  return { values, imported: undefined };
}
