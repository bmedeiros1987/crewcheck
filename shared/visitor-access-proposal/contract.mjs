// OFF proposal only: not imported by production routes or permission serializers.
// Inputs below are trusted server snapshots, never browser assertions of authority.
export const FINANCIAL_CATEGORIES = Object.freeze(['monthlySalary', 'dailyAllowances', 'periodSummary']);
export function normalizeHandle(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim().replace(/^@/, '');
  return /^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(raw) ? raw.toLowerCase() : null;
}
export function handlePreview(input) {
  const handle = normalizeHandle(input);
  return { handle, formatValid: handle !== null, availability: 'unverified', suggestions: handle ? [handle, `${handle.slice(0,21)}_cc`] : [] };
}
export function closedVisitorDraft(visitorId = '') {
  return { visitorId, financial: { enabled: false, categories: [], periodStart: '', periodEnd: '' }, emergencyContact: false, expiresAt: null };
}
export function financialDraftValid(draft) {
  const f = draft?.financial;
  const realDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  return Boolean(typeof draft?.visitorId === 'string' && draft.visitorId && f?.enabled === true && Array.isArray(f.categories) && f.categories.length && new Set(f.categories).size === f.categories.length && f.categories.every(c => FINANCIAL_CATEGORIES.includes(c)) && f.categories.some(c => c !== 'periodSummary') && realDate(f.periodStart) && realDate(f.periodEnd) && f.periodStart <= f.periodEnd);
}
export function canReadFinancialProjection({ enabled = false, identity, grant, currentRevision, ownerEntitled = false, request, now } = {}) {
  const at = Date.parse(now), expiry = Date.parse(grant?.expiresAt);
  return Boolean(enabled === true && identity?.authenticated === true && identity?.role === 'visitor' && identity?.audience === 'crewcheck-visitor' && typeof identity.visitorId === 'string' && identity.visitorId && typeof identity.ownerId === 'string' && identity.ownerId && grant?.visitorId === identity.visitorId && grant?.ownerId === identity.ownerId && grant?.status === 'active' && grant?.revokedAt === null && typeof grant?.revision === 'string' && grant.revision && grant.revision === currentRevision && ownerEntitled === true && Number.isFinite(at) && Number.isFinite(expiry) && expiry > at && financialDraftValid(grant) && request?.method === 'GET' && financialDraftValid({visitorId: identity.visitorId, financial: {enabled:true, categories:request.categories,periodStart:request.periodStart,periodEnd:request.periodEnd}}) && request.categories.every(c=>grant.financial.categories.includes(c)) && request.periodStart>=grant.financial.periodStart && request.periodEnd<=grant.financial.periodEnd);
}
// Metadata only: no amounts, salary, category values, emails, token or medical data.
export function auditEnvelope({event, grantId, revision, at} = {}) {
  if (!['grant','change','revoke','expire','read','deny','emergency-designation'].includes(event) || ![grantId,revision,at].every(v=>typeof v==='string'&&v.length>0)) throw Error('INVALID_AUDIT_EVENT');
  return {event, grantId, revision, at};
}
