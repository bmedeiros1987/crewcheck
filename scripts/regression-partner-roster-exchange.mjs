import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.CREWCHECK_PARTNER_ROSTER_ENCRYPTION_KEY = 'regression-only-roster-encryption-key';
process.env.CREWCHECK_PARTNER_ROSTER_MAX_PDF_BYTES = String(8 * 1024 * 1024);
process.env.RENDER_GIT_COMMIT = '1234567890abcdef1234567890abcdef12345678';

const {
  decodePartnerRosterPdf,
  decryptPartnerRosterPayload,
  encryptPartnerRosterPayload,
  normalizeRosterLinkToken,
  partnerRosterMaxPdfBytes,
  partnerRosterParserVersion,
} = await import('../server/v1413/partnerRosterExchange.mjs');

const pdf = Buffer.from('%PDF-1.4\n% CrewCheck partner regression\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');
const base64 = pdf.toString('base64');
const dataUri = `data:application/pdf;base64,${base64}`;
assert.deepEqual(decodePartnerRosterPdf(base64), pdf);
assert.deepEqual(decodePartnerRosterPdf(dataUri), pdf);
assert.equal(decodePartnerRosterPdf('***not-base64***').length, 0);

const encrypted = encryptPartnerRosterPayload(pdf);
assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
assert.equal(encrypted.includes(pdf.toString('utf8')), false);
assert.deepEqual(decryptPartnerRosterPayload(encrypted), pdf);

const pieces = encrypted.split('.');
const first = pieces[3][0];
const tamperedData = `${first === 'A' ? 'B' : 'A'}${pieces[3].slice(1)}`;
assert.throws(() => decryptPartnerRosterPayload([pieces[0], pieces[1], pieces[2], tamperedData].join('.')));

const link = `rlnk_${'A'.repeat(43)}`;
assert.equal(normalizeRosterLinkToken(link), link);
assert.equal(normalizeRosterLinkToken('rlnk_short'), '');
assert.equal(normalizeRosterLinkToken('../rlnk_' + 'A'.repeat(43)), '');

assert.equal(partnerRosterMaxPdfBytes(), 8 * 1024 * 1024);
process.env.CREWCHECK_PARTNER_ROSTER_MAX_PDF_BYTES = '100';
assert.equal(partnerRosterMaxPdfBytes(), 512_000);
process.env.CREWCHECK_PARTNER_ROSTER_MAX_PDF_BYTES = String(100 * 1024 * 1024);
assert.equal(partnerRosterMaxPdfBytes(), 20 * 1024 * 1024);
assert.equal(partnerRosterParserVersion(), 'server-roster-parser-v3@1234567890ab');

const implementation = fs.readFileSync(new URL('../server/v1413/partnerRosterExchange.mjs', import.meta.url), 'utf8');
for (const required of [
  "authenticatePartnerApi(req, db, 'rosters:write')",
  'raw_ciphertext',
  'authorization_reference',
  'crewcheck_partner_roster_parse_attempts',
  "parseStatus = 'identity_mismatch'",
  "parseStatus = 'identity_unverified'",
  'IDEMPOTENCY_CONFLICT',
  'CREWCHECK_PARTNER_ROSTER_IMPORT_ENABLED',
]) {
  assert.equal(implementation.includes(required), true, `missing contract marker: ${required}`);
}
assert.equal(/INSERT\s+INTO\s+crewcheck_platform_rosters/i.test(implementation), false, 'partner ingest must not silently activate/overwrite a user roster');
assert.equal(/password|cookie|latam_token|session_token/i.test(implementation), false, 'partner ingest must not require airline/session credentials');

const migration = fs.readFileSync(new URL('../migrations/20260826_019_partner_roster_exchange_v1.sql', import.meta.url), 'utf8');
for (const table of ['crewcheck_partner_roster_links', 'crewcheck_partner_roster_imports', 'crewcheck_partner_roster_parse_attempts']) {
  assert.equal(migration.includes(table), true, `migration missing ${table}`);
}
assert.equal(/UNIQUE KEY uq_partner_roster_external \(api_key_id,external_id\)/.test(migration), true);
assert.equal(/UNIQUE KEY uq_partner_roster_owner_file \(owner_email,file_sha256\)/.test(migration), true);

console.log('partner-roster-exchange regression: PASS');
