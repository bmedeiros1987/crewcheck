import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('client/src/styles/web-desktop-shell.css', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

assert.ok(main.includes('import "./styles/web-desktop-shell.css";'), 'override Web deve ser importado no shell');
assert.ok(main.indexOf('import "./styles/web-desktop-shell.css";') > main.indexOf('import "./styles/ipad-shell-v14-3-94.css";'), 'override Web precisa carregar após o hardening de tablet');
assert.ok(css.includes('@media (pointer: fine) and (min-width: 901px)'), 'desktop Web deve ser distinguido por ponteiro fino');
assert.ok(css.includes('width: min(calc(100vw - 48px), 1120px) !important;'), 'header desktop deve ter largura útil limitada');
assert.ok(css.includes('height: calc(88px + env(safe-area-inset-top, 0px)) !important;'), 'reserva vertical desktop deve acompanhar o header compacto');
// #558 — contrato invertido conscientemente. Até 30d25b4 esta asserção exigia
// display:none + visibility:hidden: a navegação inferior era escondida no desktop Web
// por decisão de produto. A decisão mudou — a barra passa a existir no desktop — então
// a asserção passa a travar o oposto, e proíbe explicitamente o retorno do padrão antigo.
assert.match(css, /\.cz-bottom-nav\s*\{[\s\S]*?display: grid !important;[\s\S]*?visibility: visible !important;[\s\S]*?pointer-events: auto !important;/, 'navegação inferior deve existir no desktop Web');
assert.doesNotMatch(css, /\.cz-bottom-nav\s*\{[\s\S]*?display: none !important;/, 'o desktop não pode voltar a esconder a navegação inferior');
assert.ok(css.includes('width: 48px !important;') && css.includes('height: 48px !important;'), 'botão Menu deve manter alvo confortável no desktop');
// #558 — mesma inversão: com a barra visível, 34px fixos deixariam o conteúdo por baixo
// dela. O respiro passa a somar a altura real da barra ao mesmo afastamento de 34px.
assert.ok(
  css.includes('padding-bottom: calc(var(--cc-nav-height) + 34px + env(safe-area-inset-bottom, 0px)) !important;')
  && css.includes('scroll-padding-bottom: calc(var(--cc-nav-height) + 34px + env(safe-area-inset-bottom, 0px)) !important;'),
  'desktop deve reservar a altura da navegação inferior para ela não cobrir conteúdo',
);
assert.ok(css.includes('width: min(560px, calc(100vw - 24px)) !important;'), 'menu desktop deve usar drawer lateral de largura controlada');
assert.ok(css.includes('height: calc(100dvh - 24px) !important;'), 'drawer deve caber integralmente na viewport');
assert.match(css, /\.cz-menu-header\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 48px !important;/, 'perfil e fechamento devem ter colunas estáveis');
assert.match(css, /\.cz-menu-section,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/, 'opções do drawer desktop devem formar lista de uma coluna');
assert.ok(css.includes('overflow-y: auto !important;'), 'menu longo deve rolar dentro do drawer');
// [data-theme='light'] never matches: the app only ever sets data-crew-theme on <html>
// (confirmed live in the browser). Any regression here must use the real attribute, or
// this assertion goes back to guarding a rule that silently never fires.
assert.ok(!css.includes("[data-theme='light'] .cc-flydeck-briefing"), 'briefing light-theme override must not regress to the attribute the app never sets (data-theme)');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing\s*\{[\s\S]*?--briefing-ink: var\(--cc-ink, #0f172a\) !important;[\s\S]*?background: var\(--cc-surface-premium-strong, #ffffff\) !important;/, 'briefing deve acompanhar a superfície clara do shell sem perder tokens semânticos');
assert.doesNotMatch(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing\s*\{[\s\S]*?linear-gradient\(145deg, #0f1b30, #071426\)/, 'tema claro não pode manter uma ilha de superfície escura');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program h2\s*\{[\s\S]*?color: var\(--briefing-ink\) !important;/, 'identificador da próxima programação deve usar o contraste do tema ativo');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-actions button\.primary\s*\{[\s\S]*?color: #ffffff !important;/, 'ação primária deve preservar contraste branco sobre azul');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-phase strong,\s*\n\s*\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-facts strong\s*\{[\s\S]*?color: var\(--briefing-ink\) !important;/, 'countdown e valores de fato devem herdar o contraste do briefing');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program small\s*\{[\s\S]*?color: var\(--briefing-muted\) !important;/, 'selo de data do briefing deve usar o tom secundário do tema');
assert.ok(!css.includes('pointer: coarse'), 'override desktop não pode alterar tablets touch');

console.log('Web desktop shell regression passed: compact header, controlled lateral drawer, legible briefing, bottom navigation visible and centred on desktop, and touch tablets preserved.');
