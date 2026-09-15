import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('client/src/main.tsx');
const legacy = read('client/src/components/v1399/premium.css');
const cssPath = 'client/src/styles/visual-layout-containment-p0.css';

assert.ok(
  legacy.includes('width: min(1180px, calc(100vw - 44px)) !important;'),
  'gate deve continuar cobrindo o conflito legado real de 1180px',
);
assert.ok(fs.existsSync(cssPath), 'camada final de containment visual precisa existir');
const css = read(cssPath);
const finalImport = 'import "./styles/visual-layout-containment-p0.css";';
const atlasImport = 'import "./styles/atlas-1c-semantic-navigation.css";';
assert.ok(main.includes(finalImport), 'camada visual final precisa estar importada');
assert.ok(main.indexOf(finalImport) > main.indexOf(atlasImport), 'camada visual deve carregar depois de Atlas');

const root = '.cz-app[data-version][data-ipad-layout-v14394="contained"]';
assert.ok(css.includes(`${root}[data-menu-open="true"] .cz-menu-overlay`), 'overlay precisa de containment explícito');
assert.ok(css.includes(`${root}[data-menu-open="true"] .cz-menu-panel`), 'painel precisa de containment explícito');
assert.ok(css.includes('max-width: 100dvw !important;'), 'overlay não pode exceder viewport dinâmica');
assert.ok(css.includes('min-width: 0 !important;'), 'filhos flex/grid precisam poder encolher');
assert.ok(css.includes('overflow-x: hidden !important;'), 'shell não pode criar scroll horizontal');
assert.ok(css.includes('(any-pointer: coarse)'), 'iPad com trackpad deve preservar contrato touch');
assert.ok(css.includes('(hover: none)'), 'Safari touch deve ter fallback sem hover');
assert.ok(css.includes('env(safe-area-inset-left'), 'safe area esquerda deve ser respeitada');
assert.ok(css.includes('env(safe-area-inset-right'), 'safe area direita deve ser respeitada');
assert.ok(css.includes('env(safe-area-inset-bottom'), 'safe area inferior deve ser respeitada');
assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'), 'tablet deve usar colunas fluidas');
assert.ok(css.includes('@media (max-width: 820px)'), 'mobile deve cair para uma coluna');
assert.ok(css.includes('width: min(560px, calc(100vw - 24px)) !important;'), 'desktop deve manter drawer compacto');
assert.ok(!css.includes('translateX('), 'camada final não pode deslocar drawer para fora da viewport');

console.log('P0 visual layout containment contract: PASS');
