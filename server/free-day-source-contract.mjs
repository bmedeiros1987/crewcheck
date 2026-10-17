// Pure minimum source contract. No account access, queue or transport.
import crypto from 'node:crypto';
export const SOURCE_SCOPE = 'free-day-voluntary-review-v1';
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const only = (x, fields) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k => fields.includes(k));
const date = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '') && Number.isFinite(Date.parse(x + 'T12:00Z')) && new Date(x + 'T12:00Z').toISOString().slice(0,10) === x;
export const sourceKey = user => 'notification-free-day-sources:' + hash([user.email,user.id]);
export function validateReceipt(input, identityDigest) {
  if (!only(input,['identityDigest','period','documentHash','starts']) || input.identityDigest !== identityDigest) fail(409,'SOURCE_IDENTITY_PENDING');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period || '') || !/^[a-f0-9]{64}$/.test(input.documentHash || '') || !Array.isArray(input.starts) || !input.starts.length || input.starts.length > 370) fail(400,'SOURCE_METADATA_REQUIRED');
  const starts = input.starts.map(s => {
    if (!only(s,['date','clock','offset','literal']) || !date(s.date) || !s.date.startsWith(input.period + '-')) fail(400,'SOURCE_DATE_PENDING');
    const valid = s.literal === true && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.clock || '') && Number.isInteger(s.offset) && Math.abs(s.offset) <= 840;
    return { date:s.date,clock:valid?s.clock:null,offset:valid?s.offset:null,literal:valid };
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if (new Set(starts.map(s=>s.date)).size !== starts.length) fail(400,'DUPLICATE_SOURCE_DATE');
  const minimal = { identityDigest,period:input.period,documentHash:input.documentHash,starts };
  return {...minimal,version:hash(minimal),origin:'voluntary-upload-declared',officialVerified:false};
}
export function compareSources(before,after,sequenceDate) {
  if (before.period !== after.period || before.identityDigest !== after.identityDigest) fail(409,'IDENTITY_OR_PERIOD_PENDING');
  if (before.documentHash === after.documentHash || before.version === after.version) return {state:'pending',reason:'DISTINCT_VERSIONS_REQUIRED',delayMinutes:null};
  const boundary = receipt => {
    const index = receipt.starts.findIndex(s=>s.date===sequenceDate);
    return index >= 0 && (index===0 || Date.parse(sequenceDate)-Date.parse(receipt.starts[index-1].date)!==86400000) ? receipt.starts[index] : null;
  };
  const old=boundary(before), current=boundary(after);
  if (!old || !current) return {state:'pending',reason:'SEQUENCE_CORRESPONDENCE_PENDING',delayMinutes:null};
  if (!old.literal || !current.literal) return {state:'pending',reason:'LITERAL_START_PENDING',delayMinutes:null};
  const instant = s=>Date.parse(s.date+'T'+s.clock+':00Z')-s.offset*60000;
  const delayMinutes=(instant(current)-instant(old))/60000;
  return {state:delayMinutes>240?'simulated-delay':'no-delay-above-four-hours',reason:null,delayMinutes};
}
