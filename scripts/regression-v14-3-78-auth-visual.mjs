import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = spawnSync(process.execPath, ['scripts/v139/apply.mjs'], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr || run.stdout || 'preparação canônica falhou');

const auth = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');
const css = fs.readFileSync('client/src/pages/auth-premium.css', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const v14378Index = chain.indexOf("await import('../v14378/apply.mjs');");
const preparationImports = Array.from(chain.matchAll(/await import\('\.\.\/(v\d+)\/apply\.mjs'\);/g));
const latestPreparation = preparationImports.at(-1);
const manualFinalizer = "await import('../ci/sync-canonical-manual.mjs');";
const manualFinalizerIndex = chain.indexOf(manualFinalizer);

assert.ok(auth.includes("import './auth-premium.css';"), 'AuthPage deve importar o CSS premium');
assert.ok(auth.includes('cc-auth-premium'), 'AuthPage deve usar a classe premium');
assert.ok(auth.includes('className="cz-auth-theme-switch"'), 'Login deve oferecer seletor claro/escuro/sistema');
// The prepared login persists through the shared runtime before updating React.
// A direct setThemeMode-only handler would bypass aliases and other screens.
const chooser = auth.match(/function chooseCrewTheme\(next: 'light' \| 'dark' \| 'system'\)\s*\{([^}]+)\}/)?.[1];
assert.ok(chooser?.includes('setCrewCheckThemePreference(next);'), 'o seletor deve persistir no runtime unificado');
assert.ok(chooser?.includes('setThemeMode(next);'), 'o seletor deve atualizar o estado React acessível');
assert.ok(auth.includes('useState(getCrewCheckThemePreference)'), 'login deve carregar a preferência persistida');
for (const mode of ['light', 'dark', 'system']) {
  assert.ok(auth.includes(`onClick={() => chooseCrewTheme('${mode}')}`), `modo ${mode} deve ser selecionável pelo runtime`);
  assert.ok(auth.includes(`aria-pressed={themeMode === '${mode}'}`), `modo ${mode} deve expor estado acessível`);
}
assert.ok(auth.includes("window.addEventListener('crewcheck:theme-change', refresh)"), 'login deve acompanhar mudanças do runtime');
assert.ok(auth.includes('applyCrewCheckTheme(); setThemeMode(getCrewCheckThemePreference());'), 'sincronização deve aplicar tema e estado selecionado');

assert.match(css, /\.cc-auth-premium \.cz-login-card\s*\{[\s\S]*min-height:\s*610px;/, 'login e cadastro devem compartilhar altura visual desktop');
assert.match(css, /\.cc-auth-premium \.cz-password-toggle\s*\{[\s\S]*position:\s*absolute[\s\S]*top:\s*50%[\s\S]*right:\s*5px/, 'ícone do olho deve permanecer dentro do campo');
assert.match(css, /@media \(max-width:\s*640px\)/, 'layout deve possuir contrato mobile');
assert.match(css, /html\[data-crew-theme="dark"\]/, 'layout deve possuir modo escuro explícito');
assert.ok(v14378Index >= 0, 'v14.3.78 deve participar da preparação canônica');
assert.ok(latestPreparation, 'a preparação canônica deve possuir uma etapa funcional final');
assert.ok((latestPreparation?.index ?? -1) >= v14378Index, 'versões posteriores devem preservar a autenticação premium da v14.3.78');
assert.ok(manualFinalizerIndex > (latestPreparation?.index ?? -1), 'o finalizador documental deve rodar depois da release funcional mais recente');
assert.ok(chain.trimEnd().endsWith(manualFinalizer), 'o finalizador documental deve encerrar a preparação canônica');

console.log('[v14.3.78-auth-visual] OK — login/cadastro padronizados, tema acessível e olho contido no campo.');
