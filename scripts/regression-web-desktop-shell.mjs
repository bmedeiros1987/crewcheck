import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('client/src/styles/web-desktop-shell.css', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

assert.ok(main.includes('import "./styles/web-desktop-shell.css";'), 'override Web deve ser importado no shell');
assert.ok(main.indexOf('import "./styles/web-desktop-shell.css";') > main.indexOf('import "./styles/ipad-shell-v14-3-94.css";'), 'override Web precisa carregar após o hardening de tablet');
assert.ok(css.includes('@media (pointer: fine) and (min-width: 901px)'), 'desktop Web deve ser distinguido por ponteiro fino');
assert.ok(css.includes('width: min(calc(100vw - 48px), 1120px) !important;'), 'header desktop deve ter largura útil limitada');
assert.ok(css.includes('height: calc(88px + env(safe-area-inset-top, 0px)) !important;'), 'reserva vertical desktop deve acompanhar o header compacto');
assert.match(css, /\.cz-bottom-nav\s*\{[\s\S]*?display: none !important;[\s\S]*?visibility: hidden !important;/, 'navegação mobile não pode aparecer no desktop');
assert.ok(css.includes('width: 48px !important;') && css.includes('height: 48px !important;'), 'botão Menu deve manter alvo confortável no desktop');
assert.ok(css.includes('padding-bottom: 34px !important;'), 'desktop não deve reservar espaço para a navegação mobile');
assert.ok(css.includes('width: min(560px, calc(100vw - 24px)) !important;'), 'menu desktop deve usar drawer lateral de largura controlada');
assert.ok(css.includes('height: calc(100dvh - 24px) !important;'), 'drawer deve caber integralmente na viewport');
assert.match(css, /\.cz-menu-header\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 48px !important;/, 'perfil e fechamento devem ter colunas estáveis');
assert.match(css, /\.cz-menu-section,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/, 'opções do drawer desktop devem formar lista de uma coluna');
assert.ok(css.includes('overflow-y: auto !important;'), 'menu longo deve rolar dentro do drawer');
// [data-theme='light'] never matches: the app only ever sets data-crew-theme on <html>
// (confirmed live in the browser). Any regression here must use the real attribute, or
// this assertion goes back to guarding a rule that silently never fires.
assert.ok(!css.includes("[data-theme='light'] .cc-flydeck-briefing"), 'briefing light-theme override must not regress to the attribute the app never sets (data-theme)');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing\s*\{[\s\S]*?--briefing-ink: #f8fbff !important;[\s\S]*?linear-gradient\(145deg, #0f1b30, #071426\) !important;/, 'briefing escuro deve manter texto claro e fundo escuro no shell claro');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program h2\s*\{[\s\S]*?color: #ffffff !important;/, 'identificador da próxima programação deve permanecer legível');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-actions button\.primary\s*\{[\s\S]*?color: #ffffff !important;/, 'ação primária deve preservar contraste branco sobre azul');
// The countdown ("Em Xh Ymin"), date badge ("SÁB DD/MM") and the 4 fact values
// (Apresentação/Partida/Chegada/Portão) are <strong>/<small> elements with their own more
// specific color rule elsewhere in the app that otherwise wins over the card's inherited
// white - measured live: dark navy text on the dark card, effectively invisible.
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-phase strong,\s*\n\s*\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-facts strong\s*\{[\s\S]*?color: var\(--briefing-ink, #f8fbff\) !important;/, 'countdown e valores de fato (apresentação/partida/chegada/portão) devem herdar o tom claro do briefing');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program small\s*\{[\s\S]*?color: var\(--briefing-muted, #b9c8da\) !important;/, 'selo de data do briefing deve usar o tom claro secundário');
assert.ok(!css.includes('pointer: coarse'), 'override desktop não pode alterar tablets touch');

console.log('Web desktop shell regression passed: compact header, controlled lateral drawer, legible briefing, mobile bottom navigation hidden and touch tablets preserved.');
