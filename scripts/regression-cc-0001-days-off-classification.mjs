import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[CC-0001] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[CC-0001] ${message}`);
}

async function loadClassificationModule() {
  const source = read('client/src/lib/scheduleActivityClassification.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
    },
    fileName: 'scheduleActivityClassification.ts',
    reportDiagnostics: true,
  });
  expect(
    (output.diagnostics || []).length === 0,
    `Falha ao transpilar classificação: ${(output.diagnostics || []).map((item) => item.messageText).join(' | ')}`,
  );
  const encoded = Buffer.from(output.outputText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const classification = await loadClassificationModule();
const rosterCodes = read('client/src/lib/rosterCodes.ts');

// Fonte semântica já existente no produto: DR é Folga Pedida; OFF é Extensão de Repouso.
expect(
  /code:\s*'DR'[\s\S]{0,140}description:\s*'Folga Pedida'[\s\S]{0,80}category:\s*'DAY_OFF'/.test(rosterCodes),
  'Glossário operacional deixou de definir DR como Folga Pedida / DAY_OFF.',
);
expect(
  /code:\s*'OFF'[\s\S]{0,160}description:\s*'Extensão de Repouso'[\s\S]{0,100}category:\s*'DAY_MARKER'/.test(rosterCodes),
  'Glossário operacional deixou de definir OFF como Extensão de Repouso.',
);

const fixtures = [
  { code: 'DO', expected: 'FOLGA' },
  { code: 'DOF', expected: 'FOLGA' },
  { code: 'DOP', expected: 'FOLGA' },
  { code: 'DR', expected: 'FOLGA' },
  { code: 'OFF', expected: 'REPOUSO' },
  { code: 'ASB', expected: 'PROGRAMACAO', start: '13:30', end: '18:25' },
  { code: 'HSB', expected: 'PROGRAMACAO', start: '08:00', end: '14:00' },
];

for (const fixture of fixtures) {
  const activity = {
    kind: fixture.code === 'ASB' || fixture.code === 'HSB' ? 'duty' : 'duty',
    title: fixture.code,
    pairingCode: fixture.code,
    presentation: fixture.start,
    arrival: fixture.end,
    day: {
      type: fixture.code,
      pairingCode: fixture.code,
      dutyReport: fixture.start,
      dutyDebrief: fixture.end,
      legs: [],
    },
    canonical: {
      kind: fixture.code === 'ASB' || fixture.code === 'HSB' ? 'duty' : 'rest',
      publishedDay: {
        type: fixture.code,
        pairingCode: fixture.code,
        dutyReport: fixture.start,
        dutyDebrief: fixture.end,
        legs: [],
      },
    },
  };
  const actual = classification.classifyScheduleActivity(activity);
  expect(actual === fixture.expected, `${fixture.code}: esperado ${fixture.expected}; recebido ${actual}.`);
}

const restSample = fixtures.slice(0, 5).map((fixture) => ({
  kind: 'duty',
  title: fixture.code,
  pairingCode: fixture.code,
  day: { type: fixture.code, pairingCode: fixture.code, legs: [] },
  canonical: { kind: 'rest', publishedDay: { type: fixture.code, pairingCode: fixture.code, legs: [] } },
}));
const counts = classification.countScheduleCategories(restSample);
expect(counts.daysOff === 4, `Folgas esperadas: 4; recebido: ${counts.daysOff}.`);
expect(counts.recoveryRest === 1, `Repousos esperados: 1; recebido: ${counts.recoveryRest}.`);
expect(counts.rest === 5, `Total amplo de folga/repouso esperado: 5; recebido: ${counts.rest}.`);

console.log('[CC-0001] OK — DR conta como Folga Pedida; OFF como Extensão de Repouso; ASB/HSB permanecem programação.');
