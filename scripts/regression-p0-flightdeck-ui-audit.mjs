import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installMenuClarityCss, normalizeFlightDeckUi } from './p0-flightdeck-ui-audit/patch.mjs';

const applyChain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const css = fs.readFileSync('scripts/p0-flightdeck-ui-audit/menu-clarity.css', 'utf8');
const legacyUi = `<small>FLYDECK</small><button aria-label="Voltar ao FlyDeck">Voltar</button>`;
const normalizedUi = normalizeFlightDeckUi(legacyUi);

assert.doesNotMatch(normalizedUi, /\bFlyDeck\b|FLYDECK/, 'a interface preparada não deve exibir a nomenclatura legada FlyDeck');
assert.match(normalizedUi, /\bFlightDeck\b|FLIGHTDECK/, 'a interface preparada deve usar a nomenclatura oficial FlightDeck');
assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(152px, 1fr\)\) !important;/, 'menu desktop deve reservar largura segura para rótulos permanentes');
assert.match(css, /> button > span,[\s\S]*?position: static !important;/, 'texto do menu desktop não pode depender de balão absoluto no hover');
assert.match(css, /opacity: 1 !important;[\s\S]*?visibility: visible !important;/, 'rótulo e descrição do menu devem permanecer visíveis');
assert.equal(normalizeFlightDeckUi('FlyDeck / FLYDECK'), 'FlightDeck / FLIGHTDECK');
const installedCss = installMenuClarityCss('body {}', css);
assert.equal(installMenuClarityCss(installedCss, css), installedCss, 'instalação do CSS deve ser idempotente');
assert.ok(applyChain.indexOf("../p0-flightdeck-ui-audit/apply.mjs") > applyChain.indexOf("../v14396/apply.mjs"), 'normalização deve rodar depois das camadas históricas de UI');

console.log('[P0/UI] OK — FlightDeck oficial e menu desktop sem vazamento de texto no hover.');
