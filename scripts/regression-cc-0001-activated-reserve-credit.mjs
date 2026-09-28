import fs from 'node:fs';
import ts from 'typescript';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[CC-0001/250] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[CC-0001/250] ${message}`);
}

async function loadHelper() {
  const source = read('client/src/lib/financialReserveCredits.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, strict: true },
    fileName: 'financialReserveCredits.ts',
    reportDiagnostics: true,
  });
  expect((output.diagnostics || []).length === 0, 'Helper de crédito de Reserva não transpila.');
  return import(`data:text/javascript;base64,${Buffer.from(output.outputText, 'utf8').toString('base64')}`);
}

const finance = await loadHelper();
const at = (day, hour, minute) => new Date(2026, 7, day, hour, minute, 0, 0);

// Caso CC-0001: Reserva publicada por 6h, acionada em voo após 48 min.
const start = at(13, 6, 5);
const end = at(13, 12, 5);
const firstFlight = at(13, 6, 53);
expect(finance.reserveWindowHours(start, end) === 6, 'Janela publicada deve permanecer 6h.');
expect(
  Number(finance.payableReserveHours(start, end, [firstFlight]).toFixed(1)) === 0.8,
  `Reserva acionada deveria creditar 0,8h; recebido ${finance.payableReserveHours(start, end, [firstFlight])}.`,
);

// Sem acionamento, a janela integral continua remunerada.
expect(
  finance.payableReserveHours(start, end, []) === 6,
  'Reserva não acionada deve manter crédito integral de 6h.',
);

// Voo fora da janela não caracteriza acionamento desta Reserva.
expect(
  finance.payableReserveHours(start, end, [at(13, 12, 30)]) === 6,
  'Voo depois do fim da Reserva não pode truncar o crédito.',
);
expect(
  finance.payableReserveHours(start, end, [at(13, 5, 50)]) === 6,
  'Voo anterior ao início da Reserva não pode truncar o crédito.',
);

// Se houver mais de um voo dentro da janela, usa o primeiro.
expect(
  Number(finance.payableReserveHours(start, end, [at(13, 8, 0), firstFlight, at(13, 7, 20)]).toFixed(1)) === 0.8,
  'Deve usar o primeiro voo acionado dentro da janela.',
);

// Virada de madrugada continua calculável sem heurística de relógio.
const overnightStart = at(14, 23, 30);
const overnightEnd = at(15, 5, 30);
const overnightFlight = at(15, 0, 18);
expect(
  Number(finance.payableReserveHours(overnightStart, overnightEnd, [overnightFlight]).toFixed(1)) === 0.8,
  'Reserva acionada após meia-noite deve preservar 0,8h de crédito.',
);

const home = read('client/src/pages/Home.tsx');
expect(home.includes("payableReserveHours"), 'Home ainda não usa crédito financeiro de Reserva acionada.');
expect(home.includes('reserveFlightStarts'), 'Home ainda não vincula voos à janela de Reserva para crédito.');

const patch = read('scripts/v14385/apply.mjs');
for (const protectedPath of [
  'client/src/lib/complianceEngine.ts',
  'client/src/lib/pdfParser.ts',
  'client/src/lib/aimsParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
]) {
  expect(!patch.includes(protectedPath), `Patch financeiro não deve alterar ${protectedPath}.`);
}

console.log('[CC-0001/250] OK — Reserva acionada 06:05–12:05 com primeiro voo 06:53 credita 0,8h; sem acionamento mantém 6h.');
