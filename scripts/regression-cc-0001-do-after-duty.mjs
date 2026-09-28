import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[CC-0001/225] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[CC-0001/225] ${message}`);
}

async function loadHelper() {
  const source = read('client/src/lib/embeddedFormalDaysOff.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true },
    fileName: 'embeddedFormalDaysOff.ts',
    reportDiagnostics: true,
  });
  expect((output.diagnostics || []).length === 0, 'Helper de folga embutida não transpila.');
  return import(`data:text/javascript;base64,${Buffer.from(output.outputText, 'utf8').toString('base64')}`);
}

const helper = await loadHelper();

const nineExplicitDaysOff = Array.from({ length: 9 }, (_, index) => ({
  date: `${String(index + 1).padStart(2, '0')}/08/2026`,
  type: 'DO',
  pairingCode: 'DO',
  dutyReport: '19:53',
  dutyDebrief: '19:52',
  isNextDay: true,
  rawText: 'DO BSB 19:53 19:52(+1)',
}));

const dutyThenDoSameCivilDay = {
  date: '20/08/2026',
  type: 'VOO',
  pairingCode: 'LA0001',
  dutyReport: '03:50',
  dutyDebrief: '05:25',
  isNextDay: false,
  rawText: 'LA0001 BSB GRU 04:30 05:25  DO BSB 19:53 19:52(+1)',
};

const missing = helper.collectMissingEmbeddedFormalDoIntervals([
  ...nineExplicitDaysOff,
  dutyThenDoSameCivilDay,
]);
expect(missing.length === 1, `Esperava 1 DO formal embutido faltante; recebido ${missing.length}.`);
expect(missing[0].date === '20/08/2026', `Data do DO embutido incorreta: ${missing[0]?.date}.`);
expect(missing[0].startTime === '19:53' && missing[0].endTime === '19:52', 'Janela 19:53–19:52 não preservada.');
expect(9 + missing.length === 10, 'Cenário real deve corrigir a métrica mensal de 9 para 10 folgas.');

// Se o parser já entregar um DO explícito com a mesma janela, não pode haver dupla contagem.
const explicitSameDo = {
  date: '20/08/2026',
  type: 'DO',
  pairingCode: 'DO',
  dutyReport: '19:53',
  dutyDebrief: '19:52',
  isNextDay: true,
  rawText: 'DO BSB 19:53 19:52(+1)',
};
expect(
  helper.countMissingEmbeddedFormalDoIntervals([...nineExplicitDaysOff, dutyThenDoSameCivilDay, explicitSameDo]) === 0,
  'DO explícito equivalente deve deduplicar o DO embutido.',
);

// Texto solto ou janela curta não pode virar folga formal.
expect(
  helper.countMissingEmbeddedFormalDoIntervals([{ date: '21/08/2026', type: 'VOO', rawText: 'DO CHECK 08:00 10:00' }]) === 0,
  'Ocorrência textual de DO com duração curta não pode virar folga.',
);

const compliance = read('client/src/lib/complianceEngine.ts');
expect(
  compliance.includes("countMissingEmbeddedFormalDoIntervals"),
  'Motor de conformidade ainda não integra a contagem do DO formal embutido.',
);
expect(
  compliance.includes('missingEmbeddedFormalDaysOff'),
  'Ajuste mensal de folgas embutidas ainda não foi aplicado.',
);

console.log('[CC-0001/225] OK — DO 19:53–19:52(+1) após jornada conta uma vez e eleva 9 folgas para 10.');
