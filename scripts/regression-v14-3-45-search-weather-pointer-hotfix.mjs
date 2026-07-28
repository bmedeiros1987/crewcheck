import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const paths = {
  home: 'client/src/pages/Home.tsx',
  app: 'client/src/App.tsx',
  index: 'client/index.html',
  release: 'client/public/release.json',
  regression42: 'scripts/regression-v14-3-42-google-maps-budget-fallback.mjs',
};
const before = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const chain = read('scripts/v139/apply.mjs');
const apply44 = read('scripts/v14344/apply.mjs');
const apply45 = read('scripts/v14345/apply.mjs');
const menuCss = read('scripts/v14344/web-menu.css');
const workflow = read('.github/workflows/crewcheck-v13-8-validation.yml');

assert.ok(chain.trimEnd().endsWith("await import('../v14345/apply.mjs');"), 'v14.3.45 deve encerrar a preparação canônica');
assert.ok(before.home.includes("const DEFAULT_VERSION = '14.3.45';"), 'Home deve anunciar v14.3.45');
assert.ok(before.home.includes('data-layout-v14344="web-icon-menu"'), 'menu Web v14.3.44 deve permanecer ativo');
assert.equal((before.home.match(/data-layout-v14345="weather-search-pointer-hotfix"/g) || []).length, 1, 'marcador v14.3.45 deve existir uma única vez');

const weatherStart = before.home.indexOf('function WeatherView(');
const weatherEnd = before.home.indexOf('\nfunction ', weatherStart + 'function WeatherView('.length);
const weather = before.home.slice(weatherStart, weatherEnd);
assert.ok(weatherStart >= 0 && weatherEnd > weatherStart, 'WeatherView não localizada');
const outerStart = weather.indexOf('<div><span className="cc-search-field"><input');
const inputEndIcon = weather.indexOf('<Search className="cc-search-icon-end" aria-hidden="true"/>', outerStart);
const wrapperEnd = weather.indexOf('</span>', outerStart);
const submitButton = weather.indexOf('<button type="submit"', outerStart);
const outerEnd = weather.indexOf('</div>', outerStart);
assert.ok(outerStart >= 0, 'Meteorologia deve preservar o div externo do grid');
assert.ok(inputEndIcon > outerStart, 'lupa da Meteorologia deve ficar depois do input');
assert.ok(wrapperEnd > inputEndIcon, 'wrapper posicionado deve conter somente input e lupa');
assert.ok(submitButton > wrapperEnd, 'botão Pesquisar deve ficar fora do wrapper posicionado');
assert.ok(outerEnd > submitButton, 'botão deve permanecer dentro do grid externo');
assert.ok(!weather.includes('<div className="cc-search-field"><input'), 'wrapper posicionado não pode substituir o grid externo');
assert.ok(!weather.includes('<Search/><input'), 'lupa antiga não pode reaparecer antes do input');

assert.ok(apply44.includes('function moveNestedDivSearchIconsToEnd('), 'v14.3.44 deve tratar a Meteorologia separadamente');
assert.ok(apply44.includes("const inputClose = next.indexOf('/>', contentStart);"), 'migração deve encerrar no input, não no div');
assert.ok(apply44.includes('const controlsAfterInput = next.slice(inputClose + 2, containerClose);'), 'botão posterior ao input deve ser preservado fora do wrapper');
assert.ok(apply44.includes('<span className="cc-search-field">'), 'wrapper exclusivo do input deve ser um span interno');

assert.ok(menuCss.includes('.cc-weather-search label > div {'), 'CSS final deve adaptar o grid externo da Meteorologia');
assert.ok(menuCss.includes('grid-template-columns: minmax(0, 1fr) auto !important'), 'desktop/tablet deve ter coluna flexível para input e coluna automática para Pesquisar');
assert.ok(menuCss.includes('.cc-weather-search label > div > .cc-search-field'), 'wrapper do input deve ser contido no grid meteorológico');
assert.ok(menuCss.includes('@media (max-width: 520px)'), 'Meteorologia deve ter ajuste próprio para celular');
assert.ok(menuCss.includes('grid-template-columns: minmax(0, 1fr) !important'), 'celular deve empilhar input e botão em uma coluna segura');
assert.ok(menuCss.includes('grid-column: 1 / -1 !important'), 'input e botão devem ocupar toda a largura no celular');

assert.ok(menuCss.includes('@media (hover: hover) and (pointer: fine)'), 'modo somente ícones deve ser definido pela capacidade do ponteiro');
assert.ok(!menuCss.includes('@media (hover: hover) and (pointer: fine) and (min-width: 1024px)'), 'desktop com mouse em janela estreita deve continuar no modo icon-only');
assert.ok(menuCss.includes('@media (hover: none), (pointer: coarse)'), 'touch/iPad deve manter cards completos');
assert.ok(!menuCss.includes('@media (max-width: 1023px), (hover: none), (pointer: coarse)'), 'largura não pode substituir a detecção de touch');
assert.ok(menuCss.includes('place-items: center !important'), 'ícones Web devem permanecer centralizados');
assert.ok(menuCss.includes('grid-template-columns: 42px minmax(0, 1fr) 20px !important'), 'modo touch deve manter ícone, texto e seta em colunas seguras');

assert.ok(before.regression42.includes('const v14345Index ='), 'regressão de mapas deve reconhecer a versão final');
assert.ok(before.regression42.includes('v14.3.45 deve suceder v14.3.44'), 'regressão de mapas deve validar a ordem final');
assert.ok(before.regression42.includes("const DEFAULT_VERSION = '14.3.45'"), 'regressão de mapas deve esperar a versão final');
assert.ok(!before.regression42.includes("const DEFAULT_VERSION = '14.3.44'"), 'regressão de mapas não pode exigir versão anterior após preparação');

assert.ok(before.app.includes("crewcheck-client-cleanup:14.3.45"), 'limpeza segura deve acompanhar v14.3.45');
assert.ok(before.app.includes("!name.includes('v14.3.45')"), 'cache atual não pode ser removido no boot');
assert.ok(before.index.includes("var currentRelease = '14.3.45';"), 'watcher deve anunciar v14.3.45');
assert.ok(before.release.includes('14.3.45'), 'release.json deve anunciar v14.3.45');
assert.ok(before.release.includes('automatic-safe'), 'política segura de atualização deve permanecer');

assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(workflow), 'workflow não pode conter marcadores de conflito');
assert.ok(workflow.includes('Validate weather search wrapper and pointer-capability menu'), 'workflow deve executar a regressão v14.3.45');
assert.ok(workflow.includes('weather-search-pointer-hotfix-regression.log'), 'diagnóstico v14.3.45 deve ser publicado em caso de falha');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!apply45.includes(`update('${protectedPath}'`), `hotfix não pode alterar motor protegido: ${protectedPath}`);
}

const reapply = spawnSync(process.execPath, [path.join(root, 'scripts/v14345/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(reapply.status, 0, reapply.stderr || reapply.stdout || 'reaplicação v14.3.45 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `v14.3.45 deve ser idempotente em ${relative}`);
}

console.log('v14.3.45 hotfix: Weather input-only wrapper, responsive two-column/stacked grid, external submit button, fine-pointer icon menu, coarse-pointer full cards, final-version regressions, safe update and protected engines validated.');
