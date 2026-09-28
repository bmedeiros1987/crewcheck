import fs from 'node:fs';

const VERSION = '14.3.87b';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14387b] Home.tsx ausente.');
if (!fs.existsSync('client/src/lib/rosterReferencePeriod.ts')) throw new Error('[v14387b] helper de período ausente.');
let source = fs.readFileSync(file, 'utf8');

const importAnchor = "import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';";
const importLine = "import { filterDaysToRosterReferencePeriod, filterEventsToRosterReferencePeriod } from '@/lib/rosterReferencePeriod';";
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('[v14387b] âncora canonicalRoster não encontrada.');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const oldBlock = `function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {\n  const events = buildLegs(roster);\n  const previewRosterCounts = rosterCounters(roster);\n  const scheduleCounts = countScheduleCategories(events);\n  const flights = scheduleCounts.flights;\n  const days = previewRosterCounts.days;`;
const newBlock = `function importGuardianSummary(roster: CrewRoster, sourceFileName: string): ImportGuardianDecision {\n  const normalizedPreviewRoster = normalizeRosterDays(roster);\n  const events = filterEventsToRosterReferencePeriod(buildLegs(roster), normalizedPreviewRoster);\n  const previewDays = filterDaysToRosterReferencePeriod(normalizedPreviewRoster.days, normalizedPreviewRoster);\n  const scheduleCounts = countScheduleCategories(events);\n  const flights = scheduleCounts.flights;\n  const days = previewDays.length;`;
if (!source.includes('const normalizedPreviewRoster = normalizeRosterDays(roster);')) {
  if (!source.includes(oldBlock)) throw new Error('[v14387b] bloco de preview v14.3.87 não encontrado.');
  source = source.replace(oldBlock, newBlock);
}

for (const required of [
  importLine,
  'const normalizedPreviewRoster = normalizeRosterDays(roster);',
  'filterEventsToRosterReferencePeriod(buildLegs(roster), normalizedPreviewRoster)',
  'filterDaysToRosterReferencePeriod(normalizedPreviewRoster.days, normalizedPreviewRoster)',
  'const days = previewDays.length;',
]) {
  if (!source.includes(required)) throw new Error(`[v14387b] contrato não aplicado: ${required}`);
}
if (source.includes('const previewRosterCounts = rosterCounters(roster);')) throw new Error('[v14387b] preview ainda resume o bundle multimensal inteiro.');

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14387b] CrewCheck ${VERSION}: resumo de importação limita dias/voos/atividades ao mês de referência exibido.`);
