import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateOfficialRosterFixture } from './lib/official-roster-corpus-validator.mjs';

const fixturesDir = path.resolve('scripts/fixtures');
const fixturePattern = /^official-roster-.*-anonymized\.json$/;
const files = fs.readdirSync(fixturesDir).filter((name) => fixturePattern.test(name)).sort();

assert.ok(files.length > 0, 'nenhuma fixture oficial anonimizada encontrada');

const seenPeriods = new Map();
const summary = [];

for (const file of files) {
  const fullPath = path.join(fixturesDir, file);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const fixture = JSON.parse(raw);
  const validation = validateOfficialRosterFixture({ fixture, raw, fileName: file });
  assert.equal(validation.errors.length, 0, validation.errors.join('\n- '));
  const dateCount = validation.stats.operationalDateMarkers;

  const periodStart = fixture.period?.start ?? fixture.days?.[0]?.date ?? 'indefinido';
  const periodEnd = fixture.period?.end ?? fixture.days?.at(-1)?.date ?? 'indefinido';
  const signature = `${periodStart}|${periodEnd}|${raw.length}`;
  const sameSignature = seenPeriods.get(signature) ?? [];
  sameSignature.push(file);
  seenPeriods.set(signature, sameSignature);

  summary.push({ file, periodStart, periodEnd, dateCount, layer: validation.stats.layer });
}

for (const [signature, duplicateFiles] of seenPeriods) {
  if (duplicateFiles.length > 1) {
    console.warn(`assinatura estrutural repetida (${signature}): ${duplicateFiles.join(', ')}`);
  }
}

console.log(`Corpus oficial: ${summary.length} fixture(s) validada(s)`);
for (const item of summary) {
  console.log(`- ${item.file}: ${item.periodStart} → ${item.periodEnd} (${item.dateCount} datas; ${item.layer})`);
}
