import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.CREWCHECK_V14357_SKIP_APPLY = '1';
const { patchAuthPageV14357, patchIndexCssV14357, patchLegacyVoiceRegressionV14357 } = await import('./v14357/apply.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const chain = read('scripts/v139/apply.mjs');
const v14357ApplyIndex = chain.indexOf("await import('../v14357/apply.mjs');");
const v14357CompatibilityIndex = chain.indexOf("await import('../v14357/compatibility.mjs');");
assert.ok(v14357ApplyIndex >= 0, 'v14.3.57 deve participar da preparação canônica');
assert.ok(v14357CompatibilityIndex > v14357ApplyIndex, 'compatibilidade v14.3.57 deve suceder a aplicação v14.3.57 sem bloquear versões posteriores');

const auth = read('client/src/pages/AuthPage.tsx');
const authCss = read('client/src/pages/auth-compact.css');
assert.ok(auth.includes("import './auth-compact.css';"), 'login deve carregar o estilo compacto');
assert.match(auth, /className="[^"]*\bcc-auth-compact\b[^"]*"/, 'login deve preservar o layout compacto mesmo com camadas visuais posteriores');
assert.ok(auth.includes('Entrar no CrewCheck'), 'título do login deve ser familiar e direto');
assert.ok(auth.includes('Use seu e-mail e senha para continuar.'), 'instrução do login deve ser curta');
assert.ok(auth.includes('Criar conta'), 'cadastro deve permanecer disponível');
assert.ok(authCss.includes('width: min(100%, 460px)'), 'cartão de login deve ter largura compacta');
assert.ok(authCss.includes("[data-crew-theme='dark']"), 'login deve cobrir o tema escuro completo');
assert.ok(authCss.includes('.cz-auth-mode-feedback'), 'feedback acessível deve ser preservado');

const authFixture = `import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '@/lib/termsClient';
const title = mode === 'login' ? 'Bem-vindo de volta.' : 'Criar';
return <main className="cz-auth" data-version="14.0.6"><button>Criar cadastro</button><p>Entre para carregar sua escala e continuar de onde parou.</p><footer>CREWCHECK V14.0.6 • PREMIUM BETA</footer></main>;`;
const patchedAuth = patchAuthPageV14357(authFixture);
assert.ok(patchedAuth.includes('cc-auth-compact'));
assert.equal(patchAuthPageV14357(patchedAuth), patchedAuth, 'patch do login deve ser idempotente');

const timeline = read('client/src/components/v14349/OperationalDayTimeline.tsx');
const timelineCss = read('client/src/components/v14349/operational-day-timeline.css');
assert.ok(timeline.includes('cc14357-dayline-summary'), 'Linha do Dia deve exibir resumo Agora/Próximo');
assert.ok(timeline.includes("HSB: 'Sobreaviso'"), 'HSB deve ser traduzido para Sobreaviso');
assert.ok(timeline.includes("ASB: 'Reserva'"), 'ASB deve ser traduzido para Reserva');
assert.ok(timeline.includes('meaningful(event.gate)'), 'metadados de portão devem remover valores vazios');
assert.ok(timeline.includes("actionLabel: 'Ver hotel'"), 'pernoite deve ter ação específica');
assert.ok(timeline.includes("targetView: isFlight(event) ? 'radar' : 'roster'"), 'voos devem manter acesso ao Radar');
assert.ok(timeline.includes('.slice(0, 7)'), 'cronologia deve permanecer limitada e legível');
assert.ok(timelineCss.includes('.cc14349-dayline-item.is-current'), 'atividade atual deve ser destacada');
assert.ok(timelineCss.includes('.cc14349-dayline-item.is-next'), 'próxima atividade deve ser destacada');
assert.ok(timelineCss.includes("[data-crew-theme='dark']"), 'Linha do Dia deve respeitar o tema real do CrewCheck');

const clarityCss = read('client/src/styles/v14357-ui-clarity.css');
const indexCss = read('client/src/index.css');
assert.ok(clarityCss.includes('@media (min-width: 901px)'), 'desktop deve possuir regra própria');
// #558 — contrato invertido conscientemente. Esta regra escondia a navegação inferior a
// partir de 901px sem distinguir ponteiro, alcançando também tablets. A barra passa a
// existir no desktop, e o respeito ao conteúdo deixa de ser "sumir" e passa a ser
// "reservar a própria altura".
assert.match(clarityCss, /@media \(min-width: 901px\)[\s\S]*\.cz-bottom-nav[\s\S]*display:\s*grid/, 'navegação inferior deve permanecer visível no desktop');
assert.match(clarityCss, /@media \(min-width: 901px\)[\s\S]*\.cz-app[\s\S]*padding-bottom:\s*calc\(var\(--cc-nav-height\)/, 'desktop deve reservar a altura da navegação inferior');
assert.doesNotMatch(clarityCss, /@media \(min-width: 901px\)[\s\S]*\.cz-bottom-nav\s*\{[\s\S]*?display:\s*none/, 'a camada de clareza não pode voltar a esconder a navegação inferior');
assert.ok(clarityCss.includes('width: min(100%, 1180px)'), 'FlyDeck e Linha do Dia devem compartilhar largura previsível');
assert.ok(indexCss.includes('@import "./styles/v14357-ui-clarity.css";'), 'camada global de clareza deve estar carregada');
const cssFixture = '@import "tailwindcss";\nbody{}';
const patchedCss = patchIndexCssV14357(cssFixture);
assert.equal(patchIndexCssV14357(patchedCss), patchedCss, 'patch do CSS global deve ser idempotente');

const legacySmartDeparture = read('scripts/regression-v14-3-47-smart-departure-operational-airport.mjs');
assert.ok(legacySmartDeparture.includes("runtime.includes('window.CrewCheckPremium = {')"), 'regressão da Saída Inteligente deve validar capacidades do runtime');
assert.ok(!legacySmartDeparture.includes('runtime premium deve anunciar a versão atual'), 'runtime não deve depender de versão fixa');

const legacyVoice = read('scripts/regression-v14-3-48-elevenlabs-dual-voice.mjs');
assert.ok(legacyVoice.includes("const currentVersion = JSON.parse(read('package.json')).version;"), 'regressão de voz deve acompanhar a versão atual');
assert.ok(!legacyVoice.includes('v14.3.48 deve encerrar a preparação canônica'), 'regressão antiga não pode exigir v14.3.48 como última versão');
assert.equal(patchLegacyVoiceRegressionV14357(legacyVoice), legacyVoice, 'compatibilidade da regressão de voz deve ser idempotente');

const typescriptModule = await import('typescript');
const ts = typescriptModule.default || typescriptModule;
const transpiled = ts.transpileModule(timeline, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(syntaxErrors.length, 0, syntaxErrors.map((diagnostic) => diagnostic.messageText).join('\n'));

const applySource = read('scripts/v14357/apply.mjs');
for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/regulatoryEngine.ts',
]) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `v14.3.57 não pode alterar ${protectedPath}`);
}

console.log('[v14.3.57-ui-clarity] Linha do Dia intuitiva, login compacto, padrão visual, responsividade, compatibilidade e proteção canônica validados.');
