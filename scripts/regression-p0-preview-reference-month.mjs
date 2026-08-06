import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[P0/#303/period] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function expect(condition, message) {
  if (!condition) throw new Error(`[P0/#303/period] ${message}`);
}
async function loadHelper() {
  const source = read('client/src/lib/rosterReferencePeriod.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true },
    fileName: 'rosterReferencePeriod.ts',
    reportDiagnostics: true,
  });
  expect((output.diagnostics || []).length === 0, 'Helper de período não transpila.');
  return import(`data:text/javascript;base64,${Buffer.from(output.outputText, 'utf8').toString('base64')}`);
}

const period = await loadHelper();
const roster = { month: 8, year: 2026 };
const augustDays = Array.from({ length: 31 }, (_, index) => ({ date: `${String(index + 1).padStart(2, '0')}/08/2026`, month: 8, year: 2026 }));
const septemberCarryDays = Array.from({ length: 4 }, (_, index) => ({ date: `${String(index + 1).padStart(2, '0')}/09/2026`, month: 9, year: 2026 }));
const augustFlights = Array.from({ length: 38 }, (_, index) => ({ date: new Date(2026, 7, 1 + (index % 31), 10, 0), canonical: { startDateTime: `2026-08-${String(1 + (index % 31)).padStart(2, '0')}T10:00:00` } }));
const septemberCarryFlights = Array.from({ length: 8 }, (_, index) => ({ date: new Date(2026, 8, 1 + index, 10, 0), canonical: { startDateTime: `2026-09-${String(1 + index).padStart(2, '0')}T10:00:00` } }));

const allDays = [...augustDays, ...septemberCarryDays];
const allFlights = [...augustFlights, ...septemberCarryFlights];
expect(allDays.length === 35, 'Fixture precisa reproduzir preview bruto de 35 dias.');
expect(allFlights.length === 46, 'Fixture precisa reproduzir preview bruto de 46 voos.');
expect(period.filterDaysToRosterReferencePeriod(allDays, roster).length === 31, 'Preview de agosto deve exibir 31 dias, preservando carry-out fora da métrica mensal.');
expect(period.filterEventsToRosterReferencePeriod(allFlights, roster).length === 38, 'Preview de agosto deve exibir 38 voos, preservando voos de setembro no bundle canônico.');

const carryIn = { date: new Date(2026, 6, 31, 23, 30), canonical: { startDateTime: '2026-07-31T23:30:00' } };
expect(period.filterEventsToRosterReferencePeriod([carryIn, ...augustFlights], roster).length === 38, 'Carry-in de julho não pode inflar a métrica mensal de agosto.');

const home = read('client/src/pages/Home.tsx');
expect(home.includes("from '@/lib/rosterReferencePeriod';"), 'Preview não importa o filtro de período.');
expect(home.includes('const normalizedPreviewRoster = normalizeRosterDays(roster);'), 'Preview não normaliza antes do recorte mensal.');
expect(home.includes('filterEventsToRosterReferencePeriod(buildLegs(roster), normalizedPreviewRoster)'), 'Eventos do preview ainda incluem meses de continuidade.');
expect(home.includes('filterDaysToRosterReferencePeriod(normalizedPreviewRoster.days, normalizedPreviewRoster)'), 'Dias do preview ainda incluem meses de continuidade.');
expect(!home.includes('const previewRosterCounts = rosterCounters(roster);'), 'Preview não deve resumir o bundle multimensal inteiro sob um único mês.');

const canonical = read('client/src/lib/canonicalRoster.ts');
expect(canonical.includes('preserveFollowingDays: 45'), 'Carry-out do mês seguinte deve continuar preservado no bundle canônico.');
const patch = read('scripts/v14387b/apply.mjs');
for (const protectedPath of ['client/src/lib/canonicalRoster.ts','client/src/lib/rosterContinuity.ts','client/src/lib/pdfParser.ts','client/src/lib/aimsParser.ts','client/src/lib/complianceEngine.ts','client/src/lib/financialRules.ts']) {
  expect(!patch.includes(`'${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[P0/#303/period] OK — bundle 35 dias/46 voos continua multimensal, mas preview Agosto/2026 resume apenas 31 dias/38 voos.');
