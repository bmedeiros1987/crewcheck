import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[P0/#303/pernoite] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function expect(condition, message) {
  if (!condition) throw new Error(`[P0/#303/pernoite] ${message}`);
}
async function loadClassification() {
  const source = read('client/src/lib/scheduleActivityClassification.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true },
    fileName: 'scheduleActivityClassification.ts',
    reportDiagnostics: true,
  });
  expect((output.diagnostics || []).length === 0, 'Classificação não transpila.');
  return import(`data:text/javascript;base64,${Buffer.from(output.outputText, 'utf8').toString('base64')}`);
}

const classification = await loadClassification();
const realOvernights = Array.from({ length: 8 }, (_, index) => ({
  id: `overnight-${index + 1}`,
  kind: 'stay',
  title: 'Pernoite',
  day: { type: 'PERNOITE_CONTINUIDADE', pairingCode: 'PERNOITE ENTRE JORNADAS', legs: [] },
  canonical: { kind: 'stay', publishedDay: { type: 'PERNOITE_CONTINUIDADE', pairingCode: 'PERNOITE ENTRE JORNADAS', legs: [] } },
}));
const baseRests = Array.from({ length: 2 }, (_, index) => ({
  id: `base-rest-${index + 1}`,
  kind: 'stay',
  title: 'Descanso na base',
  day: {
    type: 'DESCANSO_BASE_CONTINUIDADE',
    pairingCode: 'DESCANSO BASE ENTRE JORNADAS',
    rawText: 'Descanso na base inferido por continuidade física em BSB. Não é folga publicada.',
    legs: [],
  },
  canonical: {
    kind: 'stay',
    publishedDay: {
      type: 'DESCANSO_BASE_CONTINUIDADE',
      pairingCode: 'DESCANSO BASE ENTRE JORNADAS',
      legs: [],
    },
  },
}));

const counts = classification.countScheduleCategories([...realOvernights, ...baseRests]);
expect(counts.overnights === 8, `Pernoites reais esperados: 8; recebido: ${counts.overnights}.`);
expect(counts.recoveryRest === 2, `Descansos na base esperados: 2; recebido: ${counts.recoveryRest}.`);
expect(counts.rest === 2, `Total de folga/repouso do fixture esperado: 2; recebido: ${counts.rest}.`);
for (const event of baseRests) {
  expect(classification.classifyScheduleActivity(event) === 'REPOUSO', 'DESCANSO_BASE_CONTINUIDADE deve ser REPOUSO mesmo quando canonical.kind=stay.');
}
for (const event of realOvernights) {
  expect(classification.classifyScheduleActivity(event) === 'PERNOITE', 'PERNOITE_CONTINUIDADE fora de base deve permanecer PERNOITE.');
}

const rosterView = read('client/src/components/v1391/RosterLaunchView.tsx');
expect(rosterView.includes("import { classifyScheduleActivity } from '@/lib/scheduleActivityClassification';"), 'Visão mensal não usa classificação compartilhada.');
expect(rosterView.includes('const scheduleCategory = classifyScheduleActivity(event);'), 'workMode ainda deriva stay/rest por regex local.');
expect(rosterView.includes("scheduleCategory === 'FOLGA' || scheduleCategory === 'REPOUSO'"), 'Folga/repouso não mapeados para modo rest.');
expect(rosterView.includes("scheduleCategory === 'PERNOITE'"), 'Pernoite não mapeado para modo stay.');
expect(!rosterView.includes('/PERNOITE|ESTADIA|DESCANSO_BASE_CONTINUIDADE/.test(code)'), 'Regex legado ainda mistura descanso base com pernoite.');

const continuity = read('client/src/lib/rosterContinuity.ts');
expect(continuity.includes("const type = atBase ? 'DESCANSO_BASE_CONTINUIDADE' : 'PERNOITE_CONTINUIDADE';"), 'Motor de continuidade deve continuar distinguindo base e fora de base.');
expect(continuity.includes('Não é folga publicada.'), 'Descanso de continuidade deve continuar explicitamente não sendo folga publicada.');

const patch = read('scripts/v14387a/apply.mjs');
for (const protectedPath of ['client/src/lib/rosterContinuity.ts','client/src/lib/canonicalRoster.ts','client/src/lib/pdfParser.ts','client/src/lib/aimsParser.ts','client/src/lib/complianceEngine.ts','client/src/lib/financialRules.ts']) {
  expect(!patch.includes(`const ${protectedPath}`) && !patch.includes(`'${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[P0/#303/pernoite] OK — 8 pernoites + 2 descansos na base permanecem 8 pernoites e 2 repousos na UI.');
