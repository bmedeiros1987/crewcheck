import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-530-finance-journey-'));

try {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: {
        entry: path.resolve('client/src/lib/financialJourneyGrouping.ts'),
        formats: ['es'],
        fileName: () => 'financial-journey.mjs',
      },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });

  const helper = await import(`${pathToFileURL(path.join(outDir, 'financial-journey.mjs')).href}?v=${Date.now()}`);

  const sameDayA1 = { id: 'a1', canonical: { journeyId: 'J-A' } };
  const sameDayA2 = { id: 'a2', canonical: { journeyId: 'J-A' } };
  const sameDayB1 = { id: 'b1', canonical: { journeyId: 'J-B' } };
  assert.equal(helper.financialJourneyGroupKey(sameDayA1), helper.financialJourneyGroupKey(sameDayA2),
    'duas pernas da mesma jornada devem permanecer no mesmo grupo financeiro');
  assert.notEqual(helper.financialJourneyGroupKey(sameDayA1), helper.financialJourneyGroupKey(sameDayB1),
    'duas jornadas distintas no mesmo dia civil não podem ser fundidas');

  const beforeMidnight = { id: 'night-1', canonical: { journeyId: 'J-NIGHT' } };
  const afterMidnight = { id: 'night-2', canonical: { journeyId: 'J-NIGHT' } };
  assert.equal(helper.financialJourneyGroupKey(beforeMidnight), helper.financialJourneyGroupKey(afterMidnight),
    'mesma jornada canônica atravessando meia-noite deve permanecer um grupo');

  const missingA = { id: 'missing-a', canonical: {} };
  const missingB = { id: 'missing-b', canonical: {} };
  assert.notEqual(helper.financialJourneyGroupKey(missingA), helper.financialJourneyGroupKey(missingB),
    'ausência de journeyId deve falhar conservadoramente por evento, nunca por dia civil');

  const rows = [
    { iso: '2026-08-31', convertedBRL: 100, currency: 'BRL' },
    { iso: '2026-09-01', convertedBRL: 200, currency: 'BRL' },
    { iso: '2026-09-15', convertedBRL: 300, currency: 'BRL' },
    { iso: '2026-10-01', convertedBRL: 400, currency: 'BRL' },
  ];
  const september = helper.rowsForNominalFinancialCompetence(rows, { year: 2026, month: 9 });
  assert.deepEqual(september.map((row) => row.iso), ['2026-09-01', '2026-09-15'],
    'carry-in/carry-out de competências adjacentes não podem inflar Setembro');
  assert.equal(helper.convertedTotalForNominalFinancialCompetence(rows, { year: 2026, month: 9 }), 500,
    'total convertido nominal deve refletir somente a competência ativa');
  assert.deepEqual(helper.rowsForNominalFinancialCompetence(rows, { year: 0, month: 0 }), [],
    'competência inválida deve falhar fechada, sem somar todo o histórico');

  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /financialJourneyGroupKey/);
  assert.match(home, /const processedFlightJourneys = new Set<string>\(\)/);
  assert.match(home, /financialJourneyGroupKey\(candidate\) === journeyKey/);
  assert.doesNotMatch(home, /processedFlightDays/);
  assert.doesNotMatch(home, /candidate\.day === event\.day/);
  assert.match(home, /const monthlyRows = rowsForNominalFinancialCompetence\(rows, roster\)/);
  assert.match(home, /const convertedTotalBRL = monthlyRows\.reduce/);
  assert.match(home, /monthlyRows,\s*\n\s*monthly: convertedTotalBRL/);

  console.log('[p0-530-finance-canonical] PASS — journeyId governa agrupamento e total mensal respeita competência nominal.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
