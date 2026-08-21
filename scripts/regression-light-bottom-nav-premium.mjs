import fs from 'node:fs';
import assert from 'node:assert/strict';

const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/light-bottom-nav-premium.css', 'utf8');

assert.match(main, /light-bottom-nav-premium\.css/, 'main.tsx deve carregar o refinamento da navegação inferior');
assert.match(css, /data-crewcheck-theme="light"/, 'o refinamento deve ser explicitamente limitado ao tema claro');
assert.match(css, /\.cc-bottom-nav-item\.active/, 'o estado ativo deve possuir tratamento visual dedicado');
assert.match(css, /linear-gradient\(135deg,[\s\S]*rgba\(224, 88, 196,[\s\S]*rgba\(77, 176, 232/, 'o estado ativo deve preservar uma assinatura CrewCheck rosa/azul discreta');
assert.match(css, /\.cc-bottom-nav-item svg/, 'os ícones da navegação devem ter contraste explícito');
assert.match(css, /prefers-reduced-motion/, 'o refinamento deve respeitar preferência por movimento reduzido');
assert.doesNotMatch(css, /\.cc-routine|\.cc-timeline|event-(rest|flight|hotel)|roster-card/i, 'o slice não deve alterar a semântica cromática dos ícones operacionais');

console.log('[light-bottom-nav-premium] contrato visual protegido');
