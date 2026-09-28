import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync('client/src/styles/web-desktop-shell.css', 'utf8');
const navCss = fs.readFileSync('client/src/styles/bottom-nav-clarity.css', 'utf8');
const mainSource = fs.readFileSync('client/src/main.tsx', 'utf8');

assert.ok(mainSource.includes('import "./styles/web-desktop-shell.css";'), 'override Web deve ser importado no shell');
assert.ok(mainSource.indexOf('import "./styles/web-desktop-shell.css";') > mainSource.indexOf('import "./styles/ipad-shell-v14-3-94.css";'), 'override Web precisa carregar após o hardening de tablet');
assert.ok(css.includes('@media (pointer: fine) and (min-width: 901px)'), 'desktop Web deve ser distinguido por ponteiro fino');
assert.ok(css.includes('width: min(calc(100vw - 48px), 1120px) !important;'), 'header desktop deve ter largura útil limitada');
assert.ok(css.includes('height: calc(88px + env(safe-area-inset-top, 0px)) !important;'), 'reserva vertical desktop deve acompanhar o header compacto');
// #744: the same five canonical destinations must remain available on desktop.
assert.match(css, /\.cz-bottom-nav\s*\{[^}]*display: grid !important;[^}]*visibility: visible !important;/, 'navegação canônica deve aparecer no Web');
assert.doesNotMatch(css, /\.cz-bottom-nav\s*\{[^}]*(?:display: none|visibility: hidden)/, 'desktop não pode suprimir a navegação canônica');
assert.ok(mainSource.includes('import "./styles/bottom-nav-clarity.css";'), 'folha da barra canônica deve ser carregada');
assert.ok(navCss.includes('body > nav.cz-bottom-nav[aria-label="Navegação principal"]'), 'estilizar o portal real e não apenas o componente cc-*');
assert.ok(navCss.includes('html.crewcheck-menu-open body > nav.cz-bottom-nav'), 'drawer aberto deve continuar ocultando o rodapé');
assert.ok(css.includes('padding-bottom: var(--cc-canonical-nav-clearance) !important;'), 'reserva do conteúdo deve acompanhar a altura real da barra');
assert.ok(navCss.includes('@media (orientation: landscape) and (max-height: 500px)'), 'paisagem curta deve ter composição própria');
assert.ok(css.includes('width: 48px !important;') && css.includes('height: 48px !important;'), 'botão Menu deve manter alvo confortável no desktop');
assert.ok(css.includes('width: min(560px, calc(100vw - 24px)) !important;'), 'menu desktop deve usar drawer lateral de largura controlada');
assert.ok(css.includes('height: calc(100dvh - 24px) !important;'), 'drawer deve caber integralmente na viewport');
assert.match(css, /\.cz-app\[data-version\] \.cz-menu-panel \.cz-menu-header\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto !important;/, 'perfil flexível e coluna intrínseca devem acomodar Sair + Fechar');
assert.doesNotMatch(css, /\.cz-menu-header\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 48px !important;/, 'não reservar uma única célula de 48px para duas ações');
assert.match(css, /\.cz-menu-section,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important;/, 'opções do drawer desktop devem formar lista de uma coluna');
assert.ok(css.includes('overflow-y: auto !important;'), 'menu longo deve rolar dentro do drawer');
assert.ok(!css.includes("[data-theme='light'] .cc-flydeck-briefing"), 'briefing deve usar o atributo real data-crew-theme');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing\s*\{[\s\S]*?--briefing-ink: var\(--cc-ink, #0f172a\) !important;[\s\S]*?background: var\(--cc-surface-premium-strong, #ffffff\) !important;/, 'briefing deve acompanhar o tema sem perder tokens');
assert.doesNotMatch(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing\s*\{[\s\S]*?linear-gradient\(145deg, #0f1b30, #071426\)/, 'tema claro não pode manter uma ilha escura');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program h2\s*\{[\s\S]*?color: var\(--briefing-ink\) !important;/, 'próxima programação deve usar contraste do tema');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-actions button\.primary\s*\{[\s\S]*?color: #ffffff !important;/, 'ação primária preserva branco sobre azul');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-phase strong,\s*\n\s*\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-facts strong\s*\{[\s\S]*?color: var\(--briefing-ink\) !important;/, 'valores devem herdar contraste');
assert.match(css, /\[data-crew-theme='light'\] \.cc-flydeck-briefing \.cc-flydeck-program small\s*\{[\s\S]*?color: var\(--briefing-muted\) !important;/, 'data deve usar tom secundário');
assert.ok(!css.includes('pointer: coarse'), 'override desktop não pode alterar tablets touch');

console.log('Web desktop shell regression passed: canonical footer parity, content clearance, controlled drawer and theme preserved.');
