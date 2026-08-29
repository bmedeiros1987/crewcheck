import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const cssPath = 'client/src/styles/atlas-1c-semantic-navigation.css';

assert.ok(fs.existsSync(cssPath), 'Atlas 1C: folha semântica ausente');

const css = read(cssPath);
const main = read('client/src/main.tsx');
const home = read('client/src/pages/Home.tsx');
const workflow = read('.github/workflows/atlas-v14357-ui-clarity.yml');

assert.ok(main.includes('import "./styles/atlas-1c-semantic-navigation.css";'), 'Atlas 1C: CSS não importado');
assert.ok(main.indexOf('atlas-1c-semantic-navigation.css') > main.indexOf('opening-splash-identity.css'), 'Atlas 1C: CSS precisa encerrar a cascata do shell');
const bottomItems = home.match(/const items: Array<\[ZeroView, string, any\]> = \[?([\s\S]*?)\];/)?.[1] || '';
for (const view of ['cockpit', 'roster', 'alerts', 'settings']) assert.ok(bottomItems.includes(`['${view}'`), `Atlas 1C: destino ${view} ausente do rodapé`);
assert.ok(bottomItems.includes("['departure'") || bottomItems.includes("['load'"), 'Atlas 1C: destino operacional central ausente do rodapé');
for (const view of ['weather', 'wakeup', 'presentation', 'hotels', 'alerts', 'settings']) assert.ok(home.includes(`['${view}'`), `Atlas 1C: destino ${view} ausente do menu`);

for (const token of ['--cc-atlas-brand', '--cc-atlas-flight', '--cc-atlas-alert', '--cc-atlas-positive', '--cc-atlas-attention', '--cc-atlas-violet']) {
  assert.ok(css.includes(token), `Atlas 1C: token ${token} ausente`);
}
assert.match(css, /--cc-atlas-brand:\s*var\(--cz-pink\)/, 'Atlas 1C: FlightDeck não usa a identidade rosa global');
assert.match(css, /\[data-crew-theme='light'\][\s\S]*span small[\s\S]*var\(--cc1515-light-muted\)/, 'Atlas 1C: descrição clara sem token de contraste');
for (const icon of ['lucide-home', 'lucide-calendar-days', 'lucide-navigation', 'lucide-bell', 'lucide-menu']) assert.ok(css.includes(icon), `Atlas 1C: cor funcional ausente para ${icon}`);
for (const label of ['Meteorologia', 'Despertador', 'Apresentação', 'Hotéis', 'Irregularidades', 'Configurações']) assert.ok(css.includes(`[data-menu-label='${label}']`), `Atlas 1C: cor funcional ausente para ${label}`);

assert.match(css, /\[data-crew-theme='light'\][\s\S]*\.cz-menu-panel/, 'Atlas 1C: superfície clara do menu ausente');
assert.match(css, /\[data-crew-theme='light'\][\s\S]*\.cz-bottom-nav/, 'Atlas 1C: superfície clara do rodapé ausente');
assert.match(css, /repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/, 'Atlas 1C: menu não protege largura legível');
assert.match(css, /\.cz-menu-section\.cz-menu-group\[data-menu-group\][\s\S]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*220px\),\s*1fr\)\)/, 'Atlas 1C: regra responsiva não vence a cascata do menu preparado');
assert.match(css, /overflow-wrap:\s*normal\s*!important/, 'Atlas 1C: títulos ainda podem quebrar no meio da palavra');
assert.match(css, /word-break:\s*normal\s*!important/, 'Atlas 1C: word-break responsivo ausente');
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/, 'Atlas 1C: movimento reduzido ausente');
assert.match(css, /backdrop-filter:\s*none\s*!important/, 'Atlas 1C: rodapé ainda depende de glassmorphism');
assert.match(css, /html\[data-crew-theme='dark'\] body > \.cz-bottom-nav > button:not\(\.active\)[\s\S]*background:\s*transparent\s*!important[\s\S]*border:\s*none\s*!important/, 'Atlas 1C: itens inativos não formam uma superfície única no preparado');

assert.doesNotMatch(css, /(?:^|[;{]\s*)(?:position|z-index|overflow|overflow-x|overflow-y)\s*:/m, 'Atlas 1C: propriedade estrutural proibida no slice');
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'Atlas 1C: cor literal em vez de token');
assert.doesNotMatch(css, /filter:\s*(?:invert|grayscale|saturate|brightness)\b/i, 'Atlas 1C: tema não pode ser inversão/desaturação');
assert.doesNotMatch(css, /linear-gradient|radial-gradient/i, 'Atlas 1C: gradiente novo não permitido');
assert.ok(workflow.includes('node scripts/regression-p1-atlas-1c-semantic-themes.mjs'), 'Atlas 1C: gate pós-cadeia não conectado');

console.log('[atlas-1c] menu e rodapé preservam cor funcional em Light/Dark, sem inversão ou quebra interna de títulos.');
