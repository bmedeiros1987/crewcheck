import fs from 'node:fs';
import ts from 'typescript';

process.env.CREWCHECK_V14353_SKIP_APPLY = '1';
const {
  patchFlyDeckHomeV14353,
  installFlyDeckPremiumCssV14353,
} = await import('./v14353/apply.mjs');

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.53] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.53] ${message}`);
}

function versionAtLeast(actual, expected) {
  const a = String(actual || '').split('.').map(Number);
  const e = String(expected || '').split('.').map(Number);
  return [0, 1, 2].some((index) => (a[index] || 0) > (e[index] || 0)
    && [0, 1, 2].slice(0, index).every((prior) => (a[prior] || 0) === (e[prior] || 0)))
    || [0, 1, 2].every((index) => (a[index] || 0) === (e[index] || 0));
}

const home = read('client/src/pages/Home.tsx');
const css = read('client/src/index.css');
const snippet = read('scripts/v14353/flydeck-premium.snippet');
const sourceCss = read('scripts/v14353/flydeck-premium.css');
const patch = read('scripts/v14353/apply.mjs');
const applyChain = read('scripts/v139/apply.mjs');
const packageJson = JSON.parse(read('package.json'));
const cockpitStart = home.indexOf('function Cockpit(');
const cockpitEnd = cockpitStart >= 0 ? home.indexOf('function rosterCode(', cockpitStart) : -1;
const cockpit = cockpitStart >= 0 && cockpitEnd > cockpitStart ? home.slice(cockpitStart, cockpitEnd) : '';

expect(home.includes('data-flydeck-v14353="premium-briefing"'), 'Briefing Premium não foi instalado.');
expect(home.includes('ATUALIZADO {flyDeckLiveClockV14353(nowMs)}'), 'Indicador de vida não exibe atualização real.');
expect(home.includes('Consulte sempre a escala oficial'), 'Aviso de confirmação da escala oficial está ausente.');
expect(home.includes('em caso de divergência, prevalece a fonte oficial'), 'Regra de prevalência da fonte oficial está ausente.');
expect(home.includes('<OperationalDayTimeline events={events}'), 'Linha do Dia deixou de aparecer depois do briefing.');
expect(home.includes('isProgramScheduleActivity(event)'), 'Seleção da próxima programação não usa a classificação compartilhada.');
expect(home.includes('isSmartDepartureEligible(event)'), 'Elegibilidade de rota não está separada da existência de programação.');
expect(!cockpit.includes('<SmartCard'), 'Card antigo ainda pode exibir apresentação como horário de saída.');
expect(!cockpit.includes('cz-kpi-row'), 'KPIs mensais continuam ocupando o briefing.');
expect(!cockpit.includes('cz-money-row'), 'Financeiro continua ocupando a tela operacional.');
expect(cockpit.includes("event.kind === 'flight'"), 'Briefing não diferencia voo de atividade.');
expect(cockpit.includes("setView('departure')"), 'Ação de planejar saída está ausente.');
expect(cockpit.includes("setView('roster')"), 'Ação de consultar a escala está ausente.');

expect(snippet.includes('function flyDeckProgramDayV14353(event: ZeroLeg)'), 'Calendário dinâmico não deriva o dia da programação exibida.');
expect(snippet.includes('cc-flydeck-calendar-icon'), 'Botão de escala não usa o calendário dinâmico.');
expect(snippet.includes('Abrir escala da programação de ${programDateLabel(event)}'), 'Calendário dinâmico perdeu descrição acessível da programação atual.');
expect(!snippet.includes('>Ver escala <ChevronRight'), 'Rótulo textual antigo Ver escala ainda permanece no briefing.');

expect(css.includes('CrewCheck v14.3.53 — FlyDeck Premium'), 'CSS do FlyDeck Premium está ausente.');
expect(css.includes('@media (max-width: 760px)'), 'Layout mobile do briefing está ausente.');
expect(css.includes("[data-theme='light']"), 'Tema claro do briefing está ausente.');
expect(css.includes('@media (prefers-reduced-motion: reduce)'), 'Movimento reduzido não está respeitado.');
expect(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'Fatos essenciais não se reorganizam no mobile.');
expect(sourceCss.includes('.cc-flydeck-calendar-icon b'), 'Número do dia não está posicionado dentro do ícone de calendário.');
expect(sourceCss.includes("[data-theme='light'] .cc-flydeck-facts svg"), 'Tema claro não preserva contraste próprio dos ícones.');
expect(sourceCss.includes('filter: drop-shadow'), 'Tema escuro não reforça visualmente os ícones do FlyDeck.');

const transpiled = ts.transpileModule(snippet, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
expect(!syntaxErrors.length, `Snippet TSX inválido: ${syntaxErrors.map((item) => item.messageText).join(' | ')}`);

expect(patchFlyDeckHomeV14353(home) === patchFlyDeckHomeV14353(patchFlyDeckHomeV14353(home)), 'Transformação do Home não é idempotente.');
expect(installFlyDeckPremiumCssV14353(css) === installFlyDeckPremiumCssV14353(installFlyDeckPremiumCssV14353(css)), 'Transformação do CSS não é idempotente.');
expect(applyChain.includes("await import('../v14353/apply.mjs');"), 'v14.3.53 não está na preparação canônica.');
expect(versionAtLeast(packageJson.version, '14.3.53'), `Versão atual ${packageJson.version} é anterior à 14.3.53.`);
expect(Boolean(packageJson.scripts?.['regression:v14.3.53:flydeck-premium-briefing']), 'Script de regressão não registrado.');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[v14.3.53] OK — briefing Premium direto, vivo, responsivo e subordinado à escala oficial.');
