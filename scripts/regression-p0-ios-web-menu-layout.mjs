import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('client/src/main.tsx');
const css = read('client/src/styles/ios-web-menu-layout-p0.css');
const legacy = read('client/src/components/v1399/premium.css');

const finalImport = 'import "./styles/ios-web-menu-layout-p0.css";';
const atlasImport = 'import "./styles/atlas-1c-semantic-navigation.css";';
assert.ok(main.includes(finalImport), 'override P0 iOS/Web precisa estar importado');
assert.ok(main.indexOf(finalImport) > main.indexOf(atlasImport), 'override P0 deve carregar depois das camadas legadas/Atlas');

assert.ok(legacy.includes('width: min(1180px, calc(100vw - 44px)) !important;'), 'regressão deve continuar cobrindo o conflito legado real de 1180px');

const root = '.cz-app[data-version][data-ipad-layout-v14394="contained"][data-menu-open="true"]';
for (const selector of [
  `${root} .cz-menu-overlay`,
  `${root} .cz-menu-panel`,
  `${root} .cz-menu-header`,
  `${root} .cz-menu-scroll`,
  `${root} .cz-menu-section.cz-menu-group`,
]) {
  assert.ok(css.includes(selector), `seletor final de alta especificidade ausente: ${selector}`);
}

assert.ok(css.includes('(any-pointer: coarse)'), 'iPad com trackpad deve manter contrato touch via any-pointer:coarse');
assert.ok(css.includes('(hover: none)'), 'iPad Safari sem hover deve ter fallback explícito');
assert.ok(css.includes('max-width: 100dvw !important;'), 'overlay touch deve ficar contido na viewport dinâmica');
assert.ok(css.includes('height: 100dvh !important;'), 'overlay touch deve respeitar altura dinâmica do Safari');
assert.ok(css.includes('width: 100% !important;\n    min-width: 0 !important;\n    max-width: 100% !important;\n    height: 100% !important;'), 'painel touch não pode ressuscitar largura fixa de 1180px');
assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;'), 'tablet deve usar duas colunas fluidas');
assert.ok(css.includes('@media (max-width: 820px)'), 'larguras menores devem cair para uma coluna');
assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) !important;'), 'fallback de uma coluna precisa existir');
assert.ok(css.includes('env(safe-area-inset-left'), 'safe area esquerda deve ser respeitada');
assert.ok(css.includes('env(safe-area-inset-right'), 'safe area direita deve ser respeitada');
assert.ok(css.includes('env(safe-area-inset-bottom'), 'safe area inferior deve ser respeitada');
assert.ok(css.includes('overflow-x: hidden !important;'), 'scroll horizontal do shell/menu deve ser bloqueado');
assert.ok(css.includes('width: min(560px, calc(100vw - 24px)) !important;'), 'desktop fine-pointer deve manter drawer compacto');
assert.ok(!css.includes('translateX('), 'override final não pode deslocar o painel para fora da viewport');

console.log('✅ P0 iOS/Web layout: drawer contido, safe-area, grid responsivo e conflito legado 1180px protegidos.');
