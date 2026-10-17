import { majorNumberToMinor } from './financialFx.mjs';
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
// A single reviewed Thursday must never be copied across several work weeks.
export function canonicalBrlCycleKeys(rows) {
 return [...new Set((rows||[]).filter(row=>row.currency==='BRL'&&day(row.iso)).map(row=>{const date=new Date(row.iso+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+4)%7));return date.toISOString().slice(0,10);}))];
}
export function canonicalBrlCycleThursday(rows) {
 const weeks=canonicalBrlCycleKeys(rows);if(weeks.length!==1)return null;
 const date=new Date(weeks[0]+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+8);return date.toISOString().slice(0,10);
}
export async function financialCaptureDigest(value) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
// Adapter of existing canonical rows, never an alternative tariff/calculation
// engine. Source is an explicit owner review of a local canonical snapshot,
// not independent certification of a document, bank payment or employer rule.
export async function canonicalAllowanceCapture({ ownerId, crewId, airline, rows, coveredDays, range, complete, review, flights = [] }) {
  if (!ownerId || !crewId || !airline || complete !== true || review?.ownerConfirmed !== true
    || !/^[A-Za-z0-9_.:-]{1,128}$/.test(review.reference || '') || !day(range?.start) || !day(range?.end) || range.start > range.end
    || !Array.isArray(rows) || !rows.length || rows.length > 200) throw Error('CANONICAL_CAPTURE_REVIEW_REQUIRED');
  if(review.brlConfirmed===true&&canonicalBrlCycleKeys(rows).length>1)throw Error('CANONICAL_CAPTURE_ONE_BRL_CYCLE_REQUIRED');
  if(review.brlConfirmed===true&&rows.some(row=>row.currency==='BRL')&&review.brlCycleDate!==canonicalBrlCycleThursday(rows))throw Error('CANONICAL_CAPTURE_BRL_CYCLE_DATE_MISMATCH');
  const covered = new Set(coveredDays);
  for (const cursor = new Date(range.start+'T12:00:00Z'); cursor.toISOString().slice(0,10) <= range.end; cursor.setUTCDate(cursor.getUTCDate()+1)) {
    if (!covered.has(cursor.toISOString().slice(0,10))) throw Error('CANONICAL_CAPTURE_COVERAGE_REQUIRED');
    if ((cursor-new Date(range.start+'T12:00:00Z'))/86400000 > 366) throw Error('CANONICAL_CAPTURE_RANGE_LIMIT');
  }
  const scopeId = await financialCaptureDigest(['canonical-allowance-v1', ownerId, crewId]);
  const items = [], keys = new Set();
  if (rows.some(row=>!row || typeof row.iso!=='string' || typeof row.label!=='string')) throw Error('CANONICAL_CAPTURE_INVALID_ROW');
  const orderedRows=[...rows].sort((a,b)=>a.iso.localeCompare(b.iso)||a.label.localeCompare(b.label));
  for (const row of orderedRows) {
    if (!day(row.iso) || row.iso < range.start || row.iso > range.end || typeof row.label !== 'string' || !row.source || !row.rateVersion
      || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) throw Error('CANONICAL_CAPTURE_INVALID_ROW');
    const amountMinor=majorNumberToMinor(row.value,row.currency);
    if(amountMinor===null)throw Error('CANONICAL_CAPTURE_INVALID_ROW');
    const key = await financialCaptureDigest([row.iso, row.label]);
    if (keys.has(key)) throw Error('CANONICAL_CAPTURE_DUPLICATE_ROW'); keys.add(key);
    const sourceId = await financialCaptureDigest([scopeId,key]);
    const policy = { ownerId, airline, id: 'owner-reviewed-allowance-v1', provenance: 'owner_report', reportReference: review.reference, effectiveFrom: range.start, effectiveTo: range.end };
    let schedule;
    if (row.currency === 'BRL' && review.brlConfirmed === true) schedule = { airline, policy: { ...policy, timing: 'brl_thursday_sp_bank_holiday' }, cycle: { kind: 'reviewed_allowance_payment_date', date: review.brlCycleDate, reference: review.reference } };
    if (row.currency !== 'BRL' && review.foreignConfirmed === true) {
      const flight = flights.find(flight => flight.id === (review.flightLinks?.[key] ?? review.flightLinks?.[JSON.stringify([row.iso,row.label])]));
      if (flight?.published === true && day(flight.localDate) && /^[A-Z]{3}$/.test(flight.airport)) schedule = { airline, policy: { ...policy, timing: 'foreign_allowance_flight_day', currencies: [row.currency] }, flightLink: { kind: 'published_allowance_flight_link', allowanceSourceId: sourceId, localDate: flight.localDate, timezone: flight.timezone || review.flightTimezone, airport: flight.airport, reference: await financialCaptureDigest(['canonical-flight',flight.id]) } };
    }
    items.push({ key, expectedRevision: 0, record: { category: 'allowance', currency: row.currency, amountMinor, periodStart: row.iso, periodEnd: row.iso, timezone: 'America/Sao_Paulo', aggregationLevel: 'item' }, ...(schedule ? { schedule } : {}) });
  }
  return { kind: 'reviewed_financial_forecast', ownerId, scopeId, reviewReference: review.reference, ruleVersion: 'canonical-allowance-capture-v1',
    fingerprint: await financialCaptureDigest([orderedRows.map(row=>[row.iso,row.label,row.currency,row.value,row.source,row.rateVersion]), review]), items };
}

export function canonicalCreditTiming({ category, creditMonth, policy, ownerId }) {
  if (category === 'payroll' && policy?.ownerId === ownerId && policy?.reviewed === true && policy?.kind === 'salary_by_day5'
    && policy.reference && day(creditMonth+'-01') && policy.timezone) {
    try { new Intl.DateTimeFormat('en',{timeZone:policy.timezone}); } catch { return { state:'pending',reason:'timezone_not_proven' }; }
    return { state:'deadline_only',latestDate:creditMonth+'-05',timezone:policy.timezone,exactDate:null,reference:policy.reference };
  }
  return { state:'pending',exactDate:null,reason:category==='payroll'?'salary_cycle_or_policy_not_proven':['vacation','thirteenth'].includes(category)?'employer_schedule_not_proven':'unsupported_category' };
}
