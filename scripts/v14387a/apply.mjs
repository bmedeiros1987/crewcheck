import fs from 'node:fs';

const VERSION = '14.3.87a';
const classificationFile = 'client/src/lib/scheduleActivityClassification.ts';
const rosterFile = 'client/src/components/v1391/RosterLaunchView.tsx';

for (const file of [classificationFile, rosterFile]) {
  if (!fs.existsSync(file)) throw new Error(`[v14387a] arquivo ausente: ${file}`);
}

let classification = fs.readFileSync(classificationFile, 'utf8');
// #303: a âncora era `'DR',` — o primeiro item do conjunto de repouso. DR saiu de
// lá porque é Day Off Requested (folga pedida), como rosterCodes.ts sempre
// declarou, e o primeiro item passou a ser `'REST',`. O contrato deste aplicador é
// literal, então ele é atualizado junto com o conjunto, e não depois.
const restAnchor = `const RECOVERY_REST_CODES = new Set([\n  'REST',`;
const restReplacement = `const RECOVERY_REST_CODES = new Set([\n  'DESCANSO_BASE_CONTINUIDADE',\n  'REST',`;
if (!classification.includes("'DESCANSO_BASE_CONTINUIDADE'")) {
  if (!classification.includes(restAnchor)) throw new Error('[v14387a] âncora de repouso não encontrada.');
  classification = classification.replace(restAnchor, restReplacement);
}
if (!classification.includes("'DESCANSO_BASE_CONTINUIDADE'")) throw new Error('[v14387a] descanso base não classificado como repouso.');
fs.writeFileSync(classificationFile, classification, 'utf8');

let roster = fs.readFileSync(rosterFile, 'utf8');
const importAnchor = `import '@/components/v1397/roster-premium.css';`;
const importLine = `import { classifyScheduleActivity } from '@/lib/scheduleActivityClassification';`;
if (!roster.includes(importLine)) {
  if (!roster.includes(importAnchor)) throw new Error('[v14387a] âncora de import da visão mensal não encontrada.');
  roster = roster.replace(importAnchor, `${importAnchor}\n${importLine}`);
}

const workModeOld = `function workMode(event: RosterEvent): ProgramMode {\n  const code = eventCode(event);\n  if (event.kind === 'stay' || /PERNOITE|ESTADIA|DESCANSO_BASE_CONTINUIDADE/.test(code)) return 'stay';\n  if (event.canonical?.kind === 'rest') return 'rest';`;
const workModeNew = `function workMode(event: RosterEvent): ProgramMode {\n  const code = eventCode(event);\n  const scheduleCategory = classifyScheduleActivity(event);\n  if (scheduleCategory === 'FOLGA' || scheduleCategory === 'REPOUSO') return 'rest';\n  if (scheduleCategory === 'PERNOITE') return 'stay';`;
if (!roster.includes('const scheduleCategory = classifyScheduleActivity(event);')) {
  if (!roster.includes(workModeOld)) throw new Error('[v14387a] workMode legado não encontrado.');
  roster = roster.replace(workModeOld, workModeNew);
}

if (!roster.includes(importLine)) throw new Error('[v14387a] classificação compartilhada não importada.');
if (!roster.includes("scheduleCategory === 'FOLGA' || scheduleCategory === 'REPOUSO'")) throw new Error('[v14387a] descanso/folga não alinhados.');
if (!roster.includes("scheduleCategory === 'PERNOITE'")) throw new Error('[v14387a] pernoite não alinhado.');
if (/PERNOITE\|ESTADIA\|DESCANSO_BASE_CONTINUIDADE/.test(roster)) throw new Error('[v14387a] visão mensal ainda mistura descanso base com pernoite.');

fs.writeFileSync(rosterFile, roster, 'utf8');
console.log(`[v14387a] CrewCheck ${VERSION}: descanso de continuidade na base não é contado nem rotulado como pernoite.`);
