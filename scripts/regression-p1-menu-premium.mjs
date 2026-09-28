import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const chain = read('scripts/v139/apply.mjs');
assert.ok(chain.includes("await import('../p1-menu-premium/apply.mjs');"), 'menu premium deve participar da preparação canônica');
assert.ok(
  chain.indexOf("await import('../p1-menu-premium/apply.mjs');") > chain.indexOf("await import('../v14337/compatibility.mjs');"),
  'normalização do menu deve rodar depois de quem insere destinos',
);

// A cadeia canônica só roda em árvore limpa: reaplicar sobre uma já preparada falha em
// âncora, por construção. O job de validação prepara antes de chamar as regressões, então
// aqui só preparamos se ainda não estiver preparado.
const MENU_MARKER = 'ordem por importância operacional — p1-menu-premium';
if (!read('client/src/pages/Home.tsx').includes(MENU_MARKER)) {
  const prepared = spawnSync(process.execPath, [path.join(root, 'scripts/v139/apply.mjs')], { cwd: root, encoding: 'utf8' });
  assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout || 'preparação canônica falhou');
}

const home = read('client/src/pages/Home.tsx');
const menuStart = home.indexOf('function MenuDrawer(');
const menuEnd = home.indexOf('function Cockpit(', menuStart);
assert.ok(menuStart >= 0 && menuEnd > menuStart, 'MenuDrawer não localizado');
const menu = home.slice(menuStart, menuEnd);

// Ordem dos grupos: do que acontece agora para o que é eventual. Os NOMES são contrato
// de regression-v14-3-37-flydeck-navigation-brand.mjs — renomear grupo quebra aquele gate.
const EXPECTED_GROUPS = [
  'Hoje', 'Preparação', 'Em operação', 'Escala e planejamento',
  'Financeiro', 'Rotina e apoio', 'Documentos', 'Conta, ajuda e segurança',
];
const renderedGroups = [...menu.matchAll(/\{ title: '([^']+)', items: \[/g)].map((match) => match[1]);
assert.deepEqual(
  renderedGroups.slice(0, EXPECTED_GROUPS.length),
  EXPECTED_GROUPS,
  'grupos do menu devem seguir a ordem de importância operacional',
);
assert.equal(renderedGroups[renderedGroups.length - 1], 'Administração', 'administração fecha o menu');

const items = [...menu.matchAll(/\['([A-Za-z][A-Za-z0-9_]*)','([^']*)','([^']*)',\s*([A-Za-z_][A-Za-z0-9_]*)\]/g)]
  .map(([, view, label, desc, icon]) => ({ view, label, desc, icon }));

// Nenhum destino pode sumir: entrada de menu é a única porta de várias telas.
const EXPECTED_VIEWS = [
  'cockpit', 'roster', 'compare',
  'departure', 'wakeup', 'presentation', 'weather', 'mycar',
  'radar', 'alerts', 'regulation', 'load', 'emergency',
  'import', 'iflight', 'bids', 'map', 'database',
  'perdiem', 'salary', 'crew',
  'routine', 'life', 'hotels', 'gyms', 'concierge', 'community',
  'crewlocker', 'crewlock', 'reports', 'calendar', 'exports',
  'settings', 'plans', 'guardian', 'manual', 'support',
  'updates', 'maintenance', 'admin',
];
const views = items.map((item) => item.view);
for (const view of EXPECTED_VIEWS) assert.ok(views.includes(view), `destino ausente do menu: ${view}`);
assert.equal(views.length, new Set(views).size, 'nenhum destino pode aparecer duas vezes no menu');
assert.equal(views.length, EXPECTED_VIEWS.length, 'menu ganhou ou perdeu destino sem atualizar esta regressão');

// Ícone repetido não identifica nada: antes ShieldCheck servia seis destinos.
const icons = items.map((item) => item.icon);
const repeated = icons.filter((icon, index) => icons.indexOf(icon) !== index);
assert.deepEqual(repeated, [], `ícone repetido no menu: ${[...new Set(repeated)].join(', ')}`);

// Todo ícone usado precisa estar importado, e o import não pode sair malformado.
const importMatch = home.match(/import \{([^}]+)\} from 'lucide-react';/);
assert.ok(importMatch, 'import do lucide-react não localizado');
const entries = importMatch[1].split(',').map((entry) => entry.trim()).filter(Boolean);
const declared = new Set(entries.map((entry) => entry.split(/\s+as\s+/).pop().trim()));
assert.ok(!/,\s*,/.test(importMatch[1]), 'import do lucide não pode conter vírgula dupla');
assert.equal(entries.length, new Set(entries).size, 'import do lucide não pode repetir ícone');
for (const icon of new Set(icons)) assert.ok(declared.has(icon), `ícone do menu sem import: ${icon}`);

// Contratos de quem veio antes na cadeia.
assert.ok(menu.includes('data-menu-label={label}'), 'contrato do menu por ícones (v14.3.44) preservado');
assert.ok(menu.includes('<Icon aria-hidden="true"/>'), 'ícone do menu permanece decorativo');
assert.ok(menu.includes('data-menu-group={group.title}'), 'seção precisa expor o grupo para o acento');
assert.ok(menu.includes('cz-menu-header-actions'), 'ação de sair no cabeçalho preservada');

// O tom semântico do menu é keyed por data-menu-label (atlas 1C). Renomear um item
// sem atualizar o mapa derruba a cor dele para o tom padrão sem erro nenhum.
const toneCss = read('client/src/styles/atlas-1c-semantic-navigation.css');
const toned = new Set([...toneCss.matchAll(/data-menu-label='([^']+)'/g)].map((match) => match[1]));
const DEFAULT_TONE = ['FlightDeck'];
for (const item of items) {
  if (DEFAULT_TONE.includes(item.label)) continue;
  assert.ok(toned.has(item.label), `rótulo sem tom semântico no atlas 1C: ${item.label}`);
}
const labels = new Set(items.map((item) => item.label));
for (const label of toned) {
  assert.ok(labels.has(label), `atlas 1C colore rótulo que não existe mais no menu: ${label}`);
}

const first = { home: read('client/src/pages/Home.tsx'), css: read('client/src/index.css') };
const again = spawnSync(process.execPath, [path.join(root, 'scripts/p1-menu-premium/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(again.status, 0, again.stderr || again.stdout || 'reaplicação do menu falhou');
assert.equal(read('client/src/pages/Home.tsx'), first.home, 'normalização do menu deve ser idempotente em Home.tsx');
assert.equal(read('client/src/index.css'), first.css, 'normalização do menu deve ser idempotente no CSS');

console.log(`menu premium: ${renderedGroups.length} grupos, ${views.length} destinos, ${new Set(icons).size} ícones distintos, reaplicação idempotente.`);
