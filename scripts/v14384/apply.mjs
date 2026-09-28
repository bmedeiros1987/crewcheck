import fs from 'node:fs';

const VERSION = '14.3.84';
const file = 'client/src/lib/complianceEngine.ts';

if (!fs.existsSync(file)) throw new Error('[v14384] complianceEngine.ts ausente.');
if (!fs.existsSync('client/src/lib/embeddedFormalDaysOff.ts')) throw new Error('[v14384] helper de folga formal embutida ausente.');

let source = fs.readFileSync(file, 'utf8');

const importAnchor = "import { getRosterCodeDefinition } from './rosterCodes';";
const importLine = "import { countMissingEmbeddedFormalDoIntervals } from './embeddedFormalDaysOff';";
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('[v14384] âncora de import do compliance não encontrada.');
  source = source.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const sortedAnchor = '  const sortedDays = sortDays(roster.days);';
const missingCountLine = '  const missingEmbeddedFormalDaysOff = countMissingEmbeddedFormalDoIntervals(sortedDays);';
if (!source.includes(missingCountLine)) {
  if (!source.includes(sortedAnchor)) throw new Error('[v14384] sortedDays não encontrado.');
  source = source.replace(sortedAnchor, `${sortedAnchor}\n${missingCountLine}`);
}

const totalsAnchor = '  metrics.weekendPairs = calculateWeekendPairs(sortedDays);';
const totalsAdjustment = `  // CC-0001/#225: um DO formal de ~24h pode começar depois de uma jornada no\n  // mesmo dia civil. A UI já o enxerga no texto publicado, mas a contagem mensal\n  // antiga só incrementava quando o RosterDay inteiro era classificado como folga.\n  // Somamos apenas DOs embutidos ausentes, deduplicados contra DO explícito da data.\n  if (missingEmbeddedFormalDaysOff > 0) {\n    metrics.totalDaysOff += missingEmbeddedFormalDaysOff;\n    metrics.daysOff += missingEmbeddedFormalDaysOff;\n    metrics.restDays += missingEmbeddedFormalDaysOff;\n  }\n\n`;
if (!source.includes('metrics.totalDaysOff += missingEmbeddedFormalDaysOff;')) {
  if (!source.includes(totalsAnchor)) throw new Error('[v14384] âncora de totais mensais não encontrada.');
  source = source.replace(totalsAnchor, `${totalsAdjustment}${totalsAnchor}`);
}

if (!source.includes(importLine)) throw new Error('[v14384] import do helper não aplicado.');
if (!source.includes(missingCountLine)) throw new Error('[v14384] contagem de DO embutido não aplicada.');
if (!source.includes('metrics.totalDaysOff += missingEmbeddedFormalDaysOff;')) throw new Error('[v14384] totalDaysOff não recebeu ajuste do CC-0001.');

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14384] CrewCheck ${VERSION}: DO formal iniciado após jornada no mesmo dia entra uma única vez na contagem mensal.`);
