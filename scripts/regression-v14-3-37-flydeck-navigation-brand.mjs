import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const cssPath = path.join(root, 'client/src/index.css');
const applyPath = path.join(root, 'scripts/v14337/apply.mjs');
const compatibilityPath = path.join(root, 'scripts/v14337/compatibility.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
const cssBefore = fs.readFileSync(cssPath, 'utf8');

assert.ok(chain.includes("await import('../v14337/apply.mjs');"), 'v14.3.37 deve estar na preparação canônica');
assert.ok(chain.includes("await import('../v14337/compatibility.mjs');"), 'compatibilidade v14.3.37 deve preservar módulos existentes');
assert.ok(homeBefore.includes("const DEFAULT_VERSION = '14.3.37';"), 'versão web 14.3.37 ausente');
assert.ok(homeBefore.includes('function CrewCheckMark('), 'componente único da marca CrewCheck ausente');
assert.equal((homeBefore.match(/data-crewcheck-brand="canonical"/g) || []).length, 1, 'a definição da marca canônica deve existir uma única vez');
assert.ok(homeBefore.includes('<CrewCheckMark/>'), 'cabeçalho deve reutilizar a marca canônica');
assert.ok(homeBefore.includes('<CrewCheckMark className="cz-menu-brandmark" size={22}/>'), 'menu deve reutilizar a mesma marca canônica');
assert.ok(!homeBefore.includes('<span className="cz-menu-brandmark" title="CrewCheck"><Plane'), 'marca antiga duplicada do menu não pode permanecer');

const bottomStart = homeBefore.indexOf('function BottomNav(');
const bottomEnd = homeBefore.indexOf('function KpiCard(', bottomStart);
assert.ok(bottomStart >= 0 && bottomEnd > bottomStart, 'bloco da navegação inferior não localizado');
const bottomBlock = homeBefore.slice(bottomStart, bottomEnd);
const expectedBottom = [
  "['cockpit','FlyDeck',HomeIcon]",
  "['roster','Escala',CalendarDays]",
  "['departure','Saída',Navigation]",
  "['alerts','Alertas',Bell]",
  "['settings','Menu',Menu]",
];
for (const marker of expectedBottom) assert.ok(bottomBlock.includes(marker), `destino inferior ausente: ${marker}`);
const bottomItems = [...bottomBlock.matchAll(/\['(cockpit|roster|departure|alerts|settings)','([^']+)',/g)];
assert.equal(bottomItems.length, 5, 'navegação inferior deve ter exatamente cinco destinos persistentes');
assert.ok(!bottomBlock.includes("['load','Carga'"), 'Carga não deve competir com a sequência principal na barra inferior');
for (const preservedView of ['life','manual','guardian','support']) assert.ok(bottomBlock.includes(`'${preservedView}'`), `${preservedView} deve manter o Menu ativo na barra inferior`);

const menuStart = homeBefore.indexOf('function MenuDrawer(');
const menuEnd = homeBefore.indexOf('function Cockpit(', menuStart);
assert.ok(menuStart >= 0 && menuEnd > menuStart, 'bloco do menu não localizado');
const menuBlock = homeBefore.slice(menuStart, menuEnd);
const groupTitles = ['Hoje', 'Preparação', 'Em operação', 'Escala e planejamento', 'Financeiro', 'Rotina e apoio', 'Documentos', 'Conta, ajuda e segurança', 'Administração'];
for (const title of groupTitles) assert.ok(menuBlock.includes(`title: '${title}'`), `grupo de menu ausente: ${title}`);

const expectedRoutes = [
  'cockpit','roster','compare','departure','wakeup','weather','presentation','mycar',
  'radar','alerts','regulation','load','import','iflight','bids','map','database',
  'perdiem','salary','crew','concierge','hotels','gyms','routine','community','life',
  'reports','calendar','exports','plans','settings','manual','guardian','support',
  'updates','maintenance','admin',
];
for (const route of expectedRoutes) {
  const count = (menuBlock.match(new RegExp(`\\['${route}',`, 'g')) || []).length;
  assert.equal(count, 1, `rota ${route} deve aparecer exatamente uma vez no menu agrupado`);
}
const groupItemCounts = [...menuBlock.matchAll(/\{ title: '([^']+)', items: \[([\s\S]*?)\n\s*\] \}/g)]
  .map((match) => ({ title: match[1], count: (match[2].match(/\['[a-z]+',/g) || []).length }));
assert.ok(groupItemCounts.length >= 8, 'grupos públicos do menu não foram reconhecidos');
for (const group of groupItemCounts) assert.ok(group.count <= 6, `${group.title} excede seis itens visíveis`);

const cockpitStart = homeBefore.indexOf('function Cockpit(');
const cockpitEnd = homeBefore.indexOf('function rosterCode(', cockpitStart);
const cockpitBlock = homeBefore.slice(cockpitStart, cockpitEnd);
for (const marker of [
  '<small>FlyDeck</small>',
  'COPILOTO CRONOLÓGICO',
  'Confirmar programação',
  'Apresentação e limites',
  'Preparar saída',
  'Acompanhar operação',
  'Revisar próxima etapa',
  '<SmartCard event={departureEvent} setView={setView}/>',
  '<FlightCard event={event}/>',
]) assert.ok(cockpitBlock.includes(marker), `etapa estrutural do FlyDeck ausente: ${marker}`);
const chronologicalLabels = ['Confirmar programação', 'Apresentação e limites', 'Preparar saída', 'Acompanhar operação', 'Revisar próxima etapa'];
const positions = chronologicalLabels.map((label) => cockpitBlock.indexOf(label));
assert.ok(positions.every((position) => position >= 0), 'sequência operacional incompleta');
assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'sequência do FlyDeck deve permanecer cronológica');

assert.ok(cssBefore.includes('CrewCheck v14.3.37 — FlyDeck cronológico'), 'CSS do FlyDeck não foi aplicado');
const markPath = path.join(root, 'client/public/brand/crewcheck-mark.svg');
const playSourcePath = path.join(root, 'client/public/brand/crewcheck-play-store-source.svg');
assert.ok(fs.existsSync(markPath), 'fonte vetorial da marca interna ausente');
assert.ok(fs.existsSync(playSourcePath), 'fonte vetorial para o ativo Play Store ausente');
const mark = fs.readFileSync(markPath, 'utf8');
assert.ok(mark.includes('viewBox="0 0 512 512"'), 'marca deve possuir matriz 512×512');
assert.equal(fs.readFileSync(playSourcePath, 'utf8'), mark, 'ativo Play Store deve nascer da mesma marca interna');
assert.ok(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8').includes('14.3.37'), 'release.json não foi atualizado');

const applySource = fs.readFileSync(applyPath, 'utf8');
for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'server.mjs', 'financialRules', 'canonicalRoster']) {
  assert.ok(!applySource.includes(`update('${protectedPath}`), `v14.3.37 não pode alterar motor protegido: ${protectedPath}`);
}

const second = spawnSync(process.execPath, [applyPath], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.37 falhou');
const compatibility = spawnSync(process.execPath, [compatibilityPath], { cwd: root, encoding: 'utf8' });
assert.equal(compatibility.status, 0, compatibility.stderr || compatibility.stdout || 'segunda compatibilidade v14.3.37 falhou');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'patch FlyDeck deve ser idempotente no Home');
assert.equal(fs.readFileSync(cssPath, 'utf8'), cssBefore, 'patch FlyDeck deve ser idempotente no CSS');

console.log('v14.3.37 FlyDeck/navigation/brand: chronology, grouped menu, preserved control-center routes, five-item bottom nav, protected engine and canonical mark validated.');
