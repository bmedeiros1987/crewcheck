import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../client/src/index.css', import.meta.url), 'utf8');
const platform = fs.readFileSync(new URL('../client/src/components/platform/PlatformCenter.tsx', import.meta.url), 'utf8');

for (const token of [
  'CrewCheck v13.8.4 — iPad drawer viewport final override',
  'body.crewcheck-menu-open .cz-bottom-nav',
  '.cz-menu-panel > .cz-menu-scroll',
  'overflow: hidden !important',
  'safe-area-inset-bottom',
]) assert.ok(css.includes(token), `CSS ausente: ${token}`);

assert.ok(platform.includes('catalogResult = await getPlatformCatalog()'), 'Catálogo deve carregar sem depender do banco');
assert.ok(platform.includes("setBusy('database')"), 'Operações de cobrança devem pausar sem banco');
assert.ok(platform.includes('A conexão segura com o banco está temporariamente indisponível'), 'Mensagem amigável ausente');
assert.ok(!platform.includes("setError(err instanceof Error ? err.message : 'Não consegui carregar a assinatura.')"), 'Erro técnico ainda exposto');

console.log('CrewCheck v13.8.4: regressão iPad/menu/banco aprovada.');
