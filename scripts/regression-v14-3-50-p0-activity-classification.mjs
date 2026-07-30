import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.50] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.50] ${message}`);
}

function versionAtLeast(actual, minimum) {
  const left = String(actual || '').split('.').map((value) => Number(value) || 0);
  const right = String(minimum || '').split('.').map((value) => Number(value) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true;
    if ((left[index] || 0) < (right[index] || 0)) return false;
  }
  return true;
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
  const diagnostics = output.diagnostics || [];
  expect(
    diagnostics.length === 0,
    `Falha ao transpilar classificação: ${diagnostics.map((item) => item.messageText).join(' | ')}`,
  );
  const encoded = Buffer.from(output.outputText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const classification = await loadClassificationModule();
const fixtures = [
  {
    name: 'voo',
    activity: { kind: 'flight', flightNumber: 'LA3219', canonical: { kind: 'flight' } },
    category: 'PROGRAMACAO',
    smartDeparture: true,
  },
  {
    name: 'treinamento presencial',
    activity: { kind: 'duty', title: 'MCK', canonical: { kind: 'duty' } },
    category: 'PROGRAMACAO',
    smartDeparture: true,
  },
  {
    name: 'sobreaviso sem acionamento',
    activity: { kind: 'duty', title: 'HSB', canonical: { kind: 'duty' } },
    category: 'PROGRAMACAO',
    smartDeparture: false,
  },
  {
    name: 'sobreaviso acionado',
    activity: { kind: 'duty', title: 'HSB acionado', activated: true, canonical: { kind: 'duty' } },
    category: 'PROGRAMACAO',
    smartDeparture: true,
  },
  {
    name: 'treinamento remoto',
    activity: { kind: 'duty', title: 'Treinamento EAD', canonical: { kind: 'duty' } },
    category: 'PROGRAMACAO',
    smartDeparture: false,
  },
  {
    name: 'folga',
    activity: { kind: 'duty', title: 'DO', canonical: { kind: 'rest' } },
    category: 'FOLGA',
    smartDeparture: false,
  },
  {
    name: 'descanso regulamentar',
    activity: { kind: 'duty', title: 'DR', canonical: { kind: 'rest' } },
    category: 'REPOUSO',
    smartDeparture: false,
  },
  {
    name: 'pernoite',
    activity: { kind: 'stay', title: 'Estadia diurna', canonical: { kind: 'stay' } },
    category: 'PERNOITE',
    smartDeparture: false,
  },
  {
    name: 'placeholder',
    activity: { kind: 'duty', title: 'Nenhuma programação futura', placeholder: true },
    category: 'DESCONHECIDA',
    smartDeparture: false,
  },
];

for (const fixture of fixtures) {
  expect(
    classification.classifyScheduleActivity(fixture.activity) === fixture.category,
    `${fixture.name}: categoria incorreta.`,
  );
  expect(
    classification.isSmartDepartureEligible(fixture.activity) === fixture.smartDeparture,
    `${fixture.name}: elegibilidade da Saída Inteligente incorreta.`,
  );
}

const positioningFlight = {
  kind: 'flight',
  flightNumber: 'LA3794',
  day: { pairingCode: 'LA3794', type: 'VOO', rawText: 'LA3794 BSB CWB DH' },
  canonical: { kind: 'flight' },
};
expect(
  classification.classifyScheduleActivity(positioningFlight) === 'PROGRAMACAO',
  'Voo em deslocamento DH não pode ser confundido com código de folga.',
);
expect(
  classification.isFlightScheduleActivity(positioningFlight),
  'Voo em deslocamento DH precisa permanecer voo.',
);

const counts = classification.countScheduleCategories(fixtures.map((fixture) => fixture.activity));
expect(counts.programming === 5, `Programações esperadas: 5; recebido: ${counts.programming}.`);
expect(counts.flights === 1, `Voos esperados: 1; recebido: ${counts.flights}.`);
expect(counts.nonFlightProgramming === 4, `Outras atividades esperadas: 4; recebido: ${counts.nonFlightProgramming}.`);
expect(counts.rest === 2, `Folgas/descansos esperados: 2; recebido: ${counts.rest}.`);
expect(counts.daysOff === 1, `Folgas esperadas: 1; recebido: ${counts.daysOff}.`);
expect(counts.recoveryRest === 1, `Descansos esperados: 1; recebido: ${counts.recoveryRest}.`);
expect(counts.overnights === 1, `Pernoites esperados: 1; recebido: ${counts.overnights}.`);
expect(counts.unknown === 1, `Desconhecidos esperados: 1; recebido: ${counts.unknown}.`);

const home = read('client/src/pages/Home.tsx');
const timeline = read('client/src/components/v14349/OperationalDayTimeline.tsx');
const applyChain = read('scripts/v139/apply.mjs');
const patch = read('scripts/v14350/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(
  home.includes("from '@/lib/scheduleActivityClassification';"),
  'Home não usa a classificação única.',
);
expect(
  home.includes('return isSmartDepartureEligible(event);'),
  'Saída Inteligente ainda usa regra duplicada.',
);
expect(
  home.includes('programming: scheduleCounts.programming'),
  'FlyDeck não usa a contagem única de programações.',
);
expect(
  home.includes('title="Programações"'),
  'KPI principal não separa Programações de Folga/Descanso.',
);
expect(
  home.includes('isRestScheduleActivity(e) ? <Moon/>'),
  'Folga e descanso não usam ícone próprio na Escala.',
);
expect(
  home.includes('rosterDayCountLabel(dayEvents)'),
  'Contagem diária ainda não usa semântica de Folga/Descanso.',
);

expect(
  timeline.includes("from '../../lib/scheduleActivityClassification';"),
  'Linha do Dia não usa a classificação única.',
);
expect(
  !timeline.includes('REST_DAY_PATTERN') && !timeline.includes('REST_RECOVERY_PATTERN'),
  'Linha do Dia ainda mantém regra local duplicada.',
);
expect(
  timeline.includes("category === 'FOLGA' || category === 'REPOUSO'"),
  'Linha do Dia não diferencia descanso de programação.',
);

expect(
  applyChain.includes("await import('../v14350/apply.mjs');"),
  'v14.3.50 não está na preparação canônica.',
);
expect(
  versionAtLeast(packageJson.version, '14.3.50'),
  `Versão mínima esperada 14.3.50; recebida ${packageJson.version}.`,
);
expect(
  Boolean(packageJson.scripts?.['regression:v14.3.50:p0-activity-classification']),
  'Script de regressão v14.3.50 não registrado.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(
    !patch.includes(`update('${protectedPath}'`),
    `Patch não deve alterar motor protegido: ${protectedPath}.`,
  );
}

console.log('[v14.3.50] OK — Programações, folgas, descansos e pernoites têm classificação única; HSB/EAD não acionam saída.');
