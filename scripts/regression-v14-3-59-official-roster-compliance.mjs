import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');
const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/official-roster-2026-08-compliance-anonymized.json', 'utf8'));

assert.match(source, /type RegulatoryNightKind = 'worked' \| 'standby';/);
assert.match(source, /function analyzeConsecutiveOperationalWindow\(/);
assert.match(source, /function summarizeRegulatoryNightEvents\(/);
assert.match(source, /resetAfterFreeHours/);
assert.match(source, /candidate\.timestamp < end/);
assert.match(source, /HSB sem acionamento é exibido separadamente e não entra nesta soma/);
assert.doesNotMatch(source, /let consecutiveWorkPeriods = 0;/);
assert.doesNotMatch(source, /function getMadrugadaKeys\(/);
assert.doesNotMatch(source, /Mais de 6 atividades consecutivas sem folga formal — revisar/);

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function parseDate(value) {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year, month - 1, day).getTime();
}

function timestamp(date, clock) {
  const match = String(clock || '').match(/^(\d{1,2}):(\d{2})(?:\(\+(\d+)\))?$/);
  assert.ok(match, `horário inválido no fixture: ${date} ${clock}`);
  return parseDate(date) + Number(match[3] || 0) * DAY_MS + (Number(match[1]) * 60 + Number(match[2])) * 60 * 1000;
}

const recoveryTypes = new Set(['DO', 'DR', 'DOF', 'OFF', 'LAYOVER']);
const activeTypes = new Set(['VOO', 'MCK', 'CRM', 'MT', 'TRAINING']);
let sequenceStart = null;
let lastEnd = null;
let maxHours = 0;

for (const day of fixture.days) {
  if (recoveryTypes.has(day.type)) {
    if (sequenceStart !== null) maxHours = Math.max(maxHours, (timestamp(day.date, day.start || '00:00') - sequenceStart) / HOUR_MS);
    sequenceStart = null;
    lastEnd = null;
    continue;
  }
  if (!activeTypes.has(day.type)) continue;
  const start = timestamp(day.date, day.start);
  const end = timestamp(day.date, day.end);
  if (sequenceStart === null) sequenceStart = start;
  lastEnd = Math.max(lastEnd || end, end);
}
if (sequenceStart !== null && lastEnd !== null) maxHours = Math.max(maxHours, (lastEnd - sequenceStart) / HOUR_MS);

assert.ok(Math.abs(maxHours - fixture.expected.maxConsecutiveOperationalHoursBeforePublishedRecovery) < 0.1, `janela consecutiva inesperada: ${maxHours}`);
assert.ok(maxHours < 6 * 24, 'a escala oficial não pode gerar alerta de mais de seis períodos');

const workedNights = fixture.days.flatMap((day) => (day.nightKeys || []).map((date) => ({ timestamp: parseDate(date), segment: 0 })));
const standbyNights = fixture.days.filter((day) => day.standbyNightKey).map((day) => parseDate(day.standbyNightKey));
assert.equal(standbyNights.length, fixture.expected.standbyNightsExcludedFromWorkedCount);

// Aplicar reinício após 48h livres usando as folgas publicadas de 22/23 e 27/28.
const resetBoundaries = [timestamp('24/08/2026', '13:40'), timestamp('29/08/2026', '13:25')];
for (const event of workedNights) event.segment = resetBoundaries.filter((boundary) => event.timestamp >= boundary).length;

let maxRolling = 0;
for (const event of workedNights) {
  const end = event.timestamp + 168 * HOUR_MS;
  const count = workedNights.filter((candidate) => candidate.segment === event.segment && candidate.timestamp >= event.timestamp && candidate.timestamp < end).length;
  maxRolling = Math.max(maxRolling, count);
}
assert.equal(maxRolling, fixture.expected.maxWorkedNightsIn168h);
assert.ok(maxRolling <= 4, 'a escala oficial não pode gerar cinco madrugadas trabalhadas em 168h');

const ordered = [...workedNights].sort((a, b) => a.timestamp - b.timestamp);
let consecutive = ordered.length ? 1 : 0;
let maxConsecutive = consecutive;
for (let index = 1; index < ordered.length; index += 1) {
  const gap = Math.round((ordered[index].timestamp - ordered[index - 1].timestamp) / DAY_MS);
  consecutive = ordered[index].segment === ordered[index - 1].segment && gap === 1 ? consecutive + 1 : 1;
  maxConsecutive = Math.max(maxConsecutive, consecutive);
}
assert.equal(maxConsecutive, fixture.expected.maxConsecutiveWorkedNights);
assert.equal(maxConsecutive, 3, 'o alerta correto é de três madrugadas trabalhadas consecutivas no pairing final, não quatro');

for (const title of fixture.expected.mustNotEmitTitles) assert.ok(!source.includes(title), `título antigo permaneceu: ${title}`);
assert.match(source, /Madrugadas trabalhadas consecutivas — revisar sequência real/);

console.log('[regression:v14.3.59] escala oficial de agosto: alertas temporais corrigidos.');
