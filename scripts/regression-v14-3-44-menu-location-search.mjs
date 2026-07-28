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
  css: 'client/src/index.css',
  release: 'client/public/release.json',
};
const before = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const chain = read('scripts/v139/apply.mjs');
const applySource = read('scripts/v14344/apply.mjs');
const cssSource = read('scripts/v14344/web-menu.css');
const workflow = read('.github/workflows/crewcheck-v13-8-validation.yml');

assert.ok(chain.trimEnd().endsWith("await import('../v14344/apply.mjs');"), 'v14.3.44 deve encerrar a preparação canônica');
assert.ok(before.home.includes("const DEFAULT_VERSION = '14.3.44';"), 'Home deve anunciar v14.3.44');
assert.ok(before.home.includes('data-layout-v14344="web-icon-menu"'), 'shell deve identificar o menu Web icon-first');

const menuStart = before.home.indexOf('function MenuDrawer(');
const menuEnd = before.home.indexOf('function Cockpit(', menuStart);
const menu = before.home.slice(menuStart, menuEnd);
assert.ok(menuStart >= 0 && menuEnd > menuStart, 'MenuDrawer não localizado');
assert.ok(!menu.includes('<CrewLocationAccess compact/>'), 'localização não pode ocupar o topo do menu');
assert.ok(!menu.includes('<CrewLocationAccess/>'), 'controle de localização não pode permanecer dentro do menu');
assert.ok(menu.includes('data-menu-label={label}'), 'botões do menu devem expor o rótulo ao hover');
assert.ok(menu.includes('data-menu-description={desc}'), 'botões do menu devem expor a descrição ao hover');
assert.ok(menu.includes('aria-label={label}'), 'botões somente com ícone devem manter nome acessível');
assert.ok(menu.includes('<Icon aria-hidden="true"/>'), 'ícone do menu deve ser decorativo e centralizável');

const settingsStart = before.home.indexOf('function SettingsView(');
const settingsEnd = before.home.indexOf('function FeatureHub(', settingsStart);
const settings = before.home.slice(settingsStart, settingsEnd);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, 'SettingsView não localizado');
assert.ok(settings.includes('className="cc-location-settings"'), 'localização deve ficar em Configurações');
assert.ok(settings.includes('<CrewLocationAccess/>'), 'Configurações deve renderizar o controle explícito de localização');
assert.equal((before.home.match(/<CrewLocationAccess\/>/g) || []).length, 1, 'controle global de localização deve existir somente em Configurações');

const departureStart = before.home.indexOf('function Departure(');
const departureEnd = before.home.indexOf('function MonthlyMapView', departureStart);
const departure = before.home.slice(departureStart, departureEnd);
assert.ok(departureStart >= 0 && departureEnd > departureStart, 'Saída Inteligente não localizada');
assert.ok(!departure.includes('<CrewLocationAccess/>'), 'Saída Inteligente deve usar o botão contextual da rota, sem duplicar o painel global de permissão');
assert.ok(departure.includes('<GoogleMapsRoutePreview'), 'prévia de rota deve permanecer disponível na Saída Inteligente');

const migratedSearchFields = before.home.match(/<(?:label|span) className="cc-search-field">/g) || [];
const endSearchIcons = before.home.match(/<Search className="cc-search-icon-end" aria-hidden="true"\/>/g) || [];
assert.ok(migratedSearchFields.length >= 3, 'campos de pesquisa de locais, hotéis e meteorologia devem ser padronizados');
assert.equal(endSearchIcons.length, migratedSearchFields.length, 'cada campo padronizado deve possuir uma lupa ao final');
assert.ok(!before.home.includes('<label><Search/><input'), 'nenhuma lupa em label pode reaparecer antes do texto');
assert.ok(!before.home.includes('<div><Search/><input'), 'nenhuma lupa em div pode reaparecer antes do texto');

const placesSearchStart = before.home.indexOf('className="cz-place-query-row"');
const placesSearchEnd = before.home.indexOf('</div>', placesSearchStart);
const placesSearch = before.home.slice(placesSearchStart, placesSearchEnd);
assert.ok(placesSearchStart >= 0, 'campo de pesquisa de locais não localizado');
assert.ok(placesSearch.indexOf('<input') < placesSearch.indexOf('<Search className="cc-search-icon-end"'), 'campo de locais deve mostrar o input antes da lupa');

const hotelSearchStart = before.home.indexOf('className="cz-search-row"');
const hotelSearchEnd = before.home.indexOf('</div>', hotelSearchStart);
const hotelSearch = before.home.slice(hotelSearchStart, hotelSearchEnd);
assert.ok(hotelSearchStart >= 0, 'campo de pesquisa de hotéis não localizado');
assert.ok(hotelSearch.includes('className="cc-search-field"'), 'campo de hotéis deve usar o mesmo padrão');
assert.ok(hotelSearch.indexOf('<input') < hotelSearch.indexOf('<Search className="cc-search-icon-end"'), 'campo de hotéis deve mostrar o input antes da lupa');

const weatherStart = before.home.indexOf('function WeatherView(');
const weatherEnd = before.home.indexOf('\nfunction ', weatherStart + 'function WeatherView('.length);
const weather = before.home.slice(weatherStart, weatherEnd);
assert.ok(weatherStart >= 0 && weatherEnd > weatherStart, 'WeatherView não localizada');
const weatherSearchStart = weather.indexOf('<div className="cc-weather-search-row-v14344"><span className="cc-search-field"><input');
const weatherSearchWrapperEnd = weather.indexOf('</span>', weatherSearchStart);
const weatherSearchButton = weather.indexOf('<button', weatherSearchStart);
assert.ok(weatherSearchStart >= 0, 'busca meteorológica deve manter um grid externo próprio e wrapper exclusivo do input');
assert.ok(weatherSearchWrapperEnd > weatherSearchStart, 'wrapper posicionado da busca meteorológica deve ser fechado');
assert.ok(weather.indexOf('<input', weatherSearchStart) < weather.indexOf('<Search className="cc-search-icon-end"', weatherSearchStart), 'Meteorologia deve mostrar o input antes da lupa');
assert.ok(weatherSearchButton > weatherSearchWrapperEnd, 'botão de consulta meteorológica deve ficar fora do wrapper do input/lupa');

assert.ok(applySource.includes('function moveLabelSearchIconsToEnd('), 'preparação deve migrar buscas simples dentro de label');
assert.ok(applySource.includes('function moveNestedDivSearchIconsToEnd('), 'preparação deve tratar separadamente a estrutura aninhada de Meteorologia');
assert.ok(applySource.includes('const inputClose = next.indexOf(\'/>\', contentStart);'), 'busca aninhada deve isolar somente o input');
assert.ok(applySource.includes('const controlsAfterInput = next.slice(inputClose + 2, containerClose);'), 'controles após o input devem permanecer fora do wrapper posicionado');
assert.ok(applySource.includes('className="cc-weather-search-row-v14344"'), 'grid meteorológico final deve possuir classe própria');
assert.ok(!applySource.includes('[^>]*value=\\{searchTerm\\}'), 'padrão frágil com callbacks JSX não pode reaparecer');

for (const marker of [
  '@media (hover: hover) and (pointer: fine)',
  'grid-template-columns: repeat(auto-fill, 72px)',
  'place-items: center',
  '> button > svg:last-child',
  '> button:hover > span',
  '@media (hover: none), (pointer: coarse)',
  'grid-template-columns: 42px minmax(0, 1fr) 20px',
  'max-width: none',
  'overflow-wrap: break-word',
  '.cc-location-settings',
  '.cc-search-icon-end',
  'padding-right: 46px',
  '.cc-weather-search label > .cc-weather-search-row-v14344',
  'grid-template-columns: minmax(0, 1fr) auto',
  '.cc-weather-search-row-v14344 > .cc-search-field',
]) assert.ok(cssSource.includes(marker), `proteção visual v14.3.44 ausente: ${marker}`);
assert.ok(!cssSource.includes('@media (hover: hover) and (pointer: fine) and (min-width: 1024px)'), 'desktop com mouse não pode depender de largura mínima');
assert.ok(!cssSource.includes('@media (max-width: 1023px), (hover: none), (pointer: coarse)'), 'largura estreita não pode forçar desktop com mouse para o modo touch');
assert.ok(before.css.includes('CrewCheck v14.3.44 — menu Web icon-first'), 'CSS v14.3.44 deve estar aplicado uma única vez');
assert.equal((before.css.match(/CrewCheck v14\.3\.44 — menu Web icon-first/g) || []).length, 1, 'CSS v14.3.44 não pode duplicar');

assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(workflow), 'workflow não pode conter marcadores de conflito Git');
assert.ok(workflow.includes('Validate menu icons, Settings location and end-positioned search'), 'workflow deve executar a regressão v14.3.44');
assert.ok(workflow.includes('menu-location-search-regression.log'), 'diagnóstico v14.3.44 deve ser publicado em caso de falha');
assert.ok(before.release.includes('14.3.44'), 'release.json deve anunciar v14.3.44');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch visual não pode alterar motor protegido: ${protectedPath}`);
}

const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14344/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.44 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `patch v14.3.44 deve ser idempotente em ${relative}`);
}

console.log('v14.3.44 menu usability: location only in Settings, icon-only mode for every fine-pointer desktop width, full-width coarse-pointer cards, centered icons, two-column Weather input/action grid and every magnifier at field end validated.');
