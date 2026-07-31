import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const fixturesDir = path.resolve('scripts/fixtures');
const fixturePattern = /^official-roster-.*-anonymized\.json$/;
const files = fs.readdirSync(fixturesDir).filter((name) => fixturePattern.test(name)).sort();

assert.ok(files.length > 0, 'nenhuma fixture oficial anonimizada encontrada');

const forbiddenPatterns = [
  /BRUNO\s+SARAIVA/i,
  /DE\s+MEDEIROS/i,
  /\b\d{8}\b/,
  /AIRCOM_SQS/i,
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\+?55\s*\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/,
  /\bLA\d{3,4}\b/i,
];

const validDate = /^\d{2}\/\d{2}\/\d{4}$/;
const seenPeriods = new Map();
const summary = [];

function walk(value, visitor, keyPath = '$') {
  visitor(value, keyPath);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${keyPath}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => walk(item, visitor, `${keyPath}.${key}`));
  }
}

for (const file of files) {
  const fullPath = path.join(fixturesDir, file);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const fixture = JSON.parse(raw);

  assert.ok(fixture && typeof fixture === 'object' && !Array.isArray(fixture), `${file}: raiz deve ser objeto`);
  assert.match(String(fixture.source ?? ''), /anonym/i, `${file}: source deve declarar anonimização`);

  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(raw), false, `${file}: possível dado sensível ou voo real: ${pattern}`);
  }

  let dateCount = 0;
  walk(fixture, (value, keyPath) => {
    if (typeof value !== 'string') return;
    if (/date|start|end|started|finished/i.test(keyPath) && validDate.test(value)) dateCount += 1;
  });
  assert.ok(dateCount > 0, `${file}: nenhuma data operacional reconhecida`);

  const periodStart = fixture.period?.start ?? fixture.days?.[0]?.date ?? 'indefinido';
  const periodEnd = fixture.period?.end ?? fixture.days?.at(-1)?.date ?? 'indefinido';
  const signature = `${periodStart}|${periodEnd}|${raw.length}`;
  const sameSignature = seenPeriods.get(signature) ?? [];
  sameSignature.push(file);
  seenPeriods.set(signature, sameSignature);

  summary.push({ file, periodStart, periodEnd, dateCount });
}

for (const [signature, duplicateFiles] of seenPeriods) {
  if (duplicateFiles.length > 1) {
    console.warn(`assinatura estrutural repetida (${signature}): ${duplicateFiles.join(', ')}`);
  }
}

console.log(`Corpus oficial: ${summary.length} fixture(s) validada(s)`);
for (const item of summary) {
  console.log(`- ${item.file}: ${item.periodStart} → ${item.periodEnd} (${item.dateCount} datas)`);
}
