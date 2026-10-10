import assert from 'node:assert/strict';
import { parseCanonicalWhatsAppPdf, importWhatsAppPdf } from '../server/concierge/whatsapp-pdf.mjs';
const lines = [
  'Roster Report 01-Oct-2026 to 31-Oct-2026 FICTIONAL | 000000 | X | BSB | CCM',
  '07-Oct-2026 Wed LA3264/071026/JJCC320-P 11:30 LA3264 OP BSB 12:25 GRU 14:10 01:45',
];
const content = 'BT /F1 10 Tf 40 760 Td ' + lines.map((line, i) => `${i ? '0 -20 Td ' : ''}(${line.replace(/[\\()]/g, '\\$&')}) Tj`).join('\n') + ' ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
];
let pdf = '%PDF-1.4\n', offsets = [0];
objects.forEach((value, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${value}\nendobj\n`; });
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const parsed = await parseCanonicalWhatsAppPdf({ filename: 'fictional-roster.pdf', dataBase64: Buffer.from(pdf).toString('base64') });
assert.ok(parsed.roster.days.length > 0);
assert.equal(Number(parsed.roster.month), 10); assert.equal(Number(parsed.roster.year), 2026);
assert.ok(parsed.roster.days.some(day => day.legs?.some(leg => leg.origin === 'BSB' && leg.destination === 'GRU')));
let committed = false;
const imported = await importWhatsAppPdf({ id: 'canonical-fixture', from: '5511000000001', phoneNumberId: '200', type: 'document', document: { id: '100', mime_type: 'application/pdf' } }, {
  environment: { CREWCHECK_WHATSAPP_PDF_ENABLED: 'true' }, receiver: () => '200',
  findLink: async () => ({ email: 'fictional@fixture.invalid', linked_at: '2026-10-07T00:00:00Z', consent_concierge: 1 }),
  download: async () => ({ bytes: Buffer.from(pdf), filename: 'fictional-roster.pdf', digest: 'synthetic-fixture-digest' }),
  commit: async input => {
    assert.equal(input.link.email, 'fictional@fixture.invalid');
    assert.ok(input.parsed.roster.days.some(day => day.legs?.some(leg => leg.origin === 'BSB' && leg.destination === 'GRU')));
    committed = true; return { ok: true };
  },
});
assert.equal(imported.ok, true); assert.equal(committed, true);
await assert.rejects(parseCanonicalWhatsAppPdf({ filename: 'invalid.pdf', dataBase64: Buffer.from('%PDF-not-a-document').toString('base64') }), /PARSER_FAILED/);
console.log('PASS actual canonical parser via bounded worker reads a generated fictional PDF and rejects malformed content; no user files or network calls');
