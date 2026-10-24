import { createHash } from 'node:crypto';
import { readOperationalBriefingPreview } from './concierge/operational-briefing-source.mjs';

export const WAKEUP_NEUTRAL_MESSAGE = 'Despertador CrewCheck: confira sua preparação no aplicativo.';
const prefix = 'CC_WAKE_V1:';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = {
  'pt-BR': { hello: 'Olá. Fique tranquilo e beba um copo d’água.', neutral: 'Confira sua programação no CrewCheck.', report: 'Apresentação', pending: 'Apresentação a confirmar.', flight: 'Voo', to: 'para', departure: 'saída', more: 'Demais trechos no app.' },
  'en-US': { hello: 'Hello. Take a breath and drink some water.', neutral: 'Check your schedule in CrewCheck.', report: 'Report', pending: 'Report time unconfirmed.', flight: 'Flight', to: 'to', departure: 'departure', more: 'Other sectors in the app.' },
  'es-ES': { hello: 'Hola. Mantén la calma y toma un vaso de agua.', neutral: 'Consulta tu programación en CrewCheck.', report: 'Presentación', pending: 'Presentación por confirmar.', flight: 'Vuelo', to: 'a', departure: 'salida', more: 'Otros tramos en la app.' },
};
export function wakeupLocale(value) {
  return Object.hasOwn(text, value) ? { locale: value, fallback: false } : { locale: 'en-US', fallback: true };
}
export function wakeupStandardVoice(locale) {
  return { 'pt-BR': 'pt-BR-Standard-C', 'en-US': 'en-US-Standard-C', 'es-ES': 'es-ES-Standard-F' }[wakeupLocale(locale).locale];
}
export function wakeupPrivateModelSupportsLocale(locale, environment = process.env) {
  if (locale === undefined) return true; // Existing non-wakeup callers unchanged.
  const model = String(environment.ELEVENLABS_TTS_MODEL || environment.ELEVENLABS_MODEL_ID || environment.CREWCHECK_ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2').trim();
  return model === 'eleven_multilingual_v2' && !wakeupLocale(locale).fallback;
}
function clock(value, locale, timeZone) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return '';
  try {
    const formatter = new Intl.DateTimeFormat(locale, { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' });
    return formatter.format(new Date(value));
  } catch { return ''; }
}
export function buildSpokenWakeup({ locale, timeZone, duty } = {}) {
  const language = wakeupLocale(locale), words = text[language.locale];
  const sentences = [words.hello];
  if (!duty || language.fallback) return { text: [...sentences, words.neutral].join(' '), ...language };
  const report = clock(duty.presentationAt, language.locale, timeZone);
  sentences.push(report ? `${words.report}: ${report}.` : words.pending);
  const first = duty.legs?.[0];
  const departure = clock(first?.departureAt, language.locale, timeZone);
  if (first && /^[A-Za-z0-9 -]{1,16}$/.test(first.flight || '') && /^[A-Z]{3,4}$/.test(first.origin || '') && /^[A-Z]{3,4}$/.test(first.destination || '') && departure) {
    const sentence = `${words.flight} ${first.flight}, ${first.origin} ${words.to} ${first.destination}, ${words.departure}: ${departure}.`;
    if ([...sentences, sentence].join(' ').length <= 240) sentences.push(sentence);
  }
  if (duty.legs?.length > 1 && [...sentences, words.more].join(' ').length <= 240) sentences.push(words.more);
  return { text: sentences.join(' '), ...language };
}
async function profile(db, account) {
  const [rows] = await db.query('SELECT p.public_id,p.locale,p.timezone,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? LIMIT 2', [account.email]);
  if (rows.length !== 1 || !rows[0].public_id || (account.id && rows[0].public_id !== account.id) || ![false, 0, '0'].includes(rows[0].must_change_password)) throw Error('WAKEUP_PROFILE_UNAVAILABLE');
  return rows[0];
}
async function source(db, account, now, readPreview) {
  const result = await readPreview({ ok: true, db, email: account.email, publicId: account.id }, { now: () => now, includeInternal: true });
  const { preview, authority } = result?.internal || {};
  if (result.status !== 200 || !preview?.duty || !authority || !Array.isArray(preview.duty.eventIds)) return null;
  return { duty: preview.duty, stamp: digest([authority.ownerScope, authority.rosterId, authority.fingerprint, authority.activeRevision, preview.duty]) };
}

// User explicitly opts into external narration for this authenticated alarm.
// Persist identifiers/digest only, never a client roster or a monthly narrative.
export async function createWakeupSpokenEnvelope({ db, account, eventId, now = Date.now(), readPreview = readOperationalBriefingPreview }) {
  if (typeof eventId !== 'string' || !eventId || eventId.length > 160) throw Error('WAKEUP_SOURCE_UNAVAILABLE');
  await profile(db, account);
  const current = await source(db, account, now, readPreview);
  if (!current?.duty.eventIds.includes(eventId)) throw Error('WAKEUP_SOURCE_UNAVAILABLE');
  return prefix + JSON.stringify({ v: 1, owner: account.id, event: digest(eventId), source: current.stamp, consent: true });
}
export function isReservedWakeupMessage(value) { return String(value || '').startsWith(prefix); }

// Called by the existing deliverJob after its binding/cancellation/CAS checks.
// A changed or unavailable roster produces only the neutral wakeup, never stale
// details. Missing/recreated/restricted owner blocks the complete attempt.
export async function prepareScheduledWakeup(job, { getPool, now = Date.now(), readPreview = readOperationalBriefingPreview }) {
  if (!String(job.job_key || '').startsWith('wakeup:')) return { ok: true, text: job.message };
  try {
    const db = await getPool();
    const currentProfile = await profile(db, { email: job.email });
    const account = { email: job.email, id: currentProfile.public_id };
    const options = { locale: currentProfile.locale, timeZone: currentProfile.timezone };
    if (!isReservedWakeupMessage(job.message)) return { ok: true, ...(job.message === WAKEUP_NEUTRAL_MESSAGE ? buildSpokenWakeup(options) : { text: job.message, ...wakeupLocale(options.locale) }) };
    const envelope = JSON.parse(job.message.slice(prefix.length));
    if (envelope.v !== 1 || envelope.owner !== account.id || envelope.consent !== true || !/^[a-f0-9]{64}$/.test(envelope.event) || !/^[a-f0-9]{64}$/.test(envelope.source)) throw Error('WAKEUP_OWNER_CHANGED');
    let current;
    try { current = await source(db, account, now, readPreview); } catch { current = null; }
    const verified = current && current.stamp === envelope.source && current.duty.eventIds.some(id => digest(id) === envelope.event);
    return { ok: true, ...buildSpokenWakeup({ ...options, ...(verified ? { duty: current.duty } : {}) }), sourceCurrent: Boolean(verified) };
  } catch { return { ok: false, configured: false, uncertain: true, delivered: null, provider: 'wakeup', code: 'WAKEUP_CONTEXT_UNAVAILABLE' }; }
}
