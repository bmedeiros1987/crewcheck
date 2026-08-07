import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const auth = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

assert.match(home, /data-crewcheck-fast-logout="true"/, 'drawer principal deve expor logout rápido');
assert.match(home, /onClick=\{\(\) => \{ close\(\); actions\.logout\(\); \}\}/, 'logout rápido deve usar a ação canônica e fechar o drawer');
assert.match(home, /aria-label="Sair da conta"/, 'logout deve ser acessível');
assert.match(home, /<span>Sair<\/span>/, 'desktop deve mostrar rótulo Sair');
assert.match(auth, /await jsonFetch\('\/api\/auth\/logout', \{ method: 'POST', body: '\{\}' \}\)/, 'logout deve continuar chamando endpoint canônico');
assert.match(auth, /finally \{\s*clearSession\(\);\s*\}/, 'logout deve limpar sessão local mesmo com falha de rede');
assert.match(auth, /sessionStorage\.removeItem\('crewcheck_roster'\)/, 'dados operacionais da sessão devem ser limpos');
assert.match(auth, /localStorage\.removeItem\('crewcheck_latest_roster_bundle'\)/, 'bundle ativo não pode vazar entre contas');
assert.match(css, /CrewCheck P0 #334 — fast logout/, 'estilo do atalho deve estar instalado');
assert.match(css, /@media\(max-width:420px\)[\s\S]*\.cz-menu-logout span\{display:none\}/, 'mobile estreito deve manter o botão acessível sem estourar o header');

console.log('[p0-fast-logout] OK — Sair acessível no drawer e sessão local limpa pelo fluxo canônico.');
