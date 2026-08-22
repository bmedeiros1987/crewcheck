import assert from 'node:assert/strict';
import fs from 'node:fs';

// Shell 1A - rodapé renderizado.
//
// Este teste existe por causa de um achado da investigação do item 1 do roadmap
// visual: client/src/styles/bottom-nav-clarity.css estilizava exclusivamente
// .cc-bottom-nav, servida por CanonicalBottomNav e SideDrawer - dois componentes
// sem nenhum consumidor, em base e no estado preparado. A navegação que o usuário
// toca é .cz-bottom-nav, renderizada por Home.tsx. O arquivo inteiro não tinha
// efeito sobre a interface.
//
// A asserção central é essa: o CSS do rodapé e a nav renderizada precisam mirar
// a mesma classe. Sem isso, um PR de refino visual passa em todos os gates atuais
// e não muda um pixel.

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/bottom-nav-clarity.css', 'utf8');

// 1. A superfície renderizada continua sendo .cz-bottom-nav.
assert.match(
  home,
  /<nav className="cz-bottom-nav"/,
  'Home.tsx deixou de renderizar .cz-bottom-nav: reavaliar qual é a navegação canônica antes de mexer no CSS do rodapé',
);

// 2. O CSS do rodapé mira essa mesma classe.
assert.ok(
  css.includes('.cz-bottom-nav'),
  'bottom-nav-clarity.css não estiliza .cz-bottom-nav - o refino voltaria a mirar uma nav sem consumidores',
);

// 3. O seletor `body >` acompanha o portal. scripts/v1432/apply.mjs move o rodapé
//    para document.body no estado preparado; sem esse seletor a regra perde a
//    disputa de especificidade com components/v1432/homologation.css.
assert.ok(
  css.includes('body > .cz-bottom-nav'),
  'bottom-nav-clarity.css precisa de um seletor `body > .cz-bottom-nav`: no estado preparado o rodapé é portado para document.body',
);

// 4. O bloco do rodapé renderizado não decide estrutura. Posição, empilhamento,
//    largura e grade continuam sendo contrato de premium-audit-v13-8-8.css e de
//    components/v1432/homologation.css - alterá-los aqui é exatamente a classe de
//    mudança que produz cobertura de conteúdo e quebra de navegação.
const marker = '   Rodapé renderizado — .cz-bottom-nav (Home.tsx)';
const start = css.indexOf(marker);
assert.ok(start !== -1, 'bloco do rodapé renderizado não localizado em bottom-nav-clarity.css');
const block = css.slice(start);

const structural = new Set([
  'position',
  'z-index',
  'overflow',
  'overflow-x',
  'overflow-y',
  'width',
  'max-width',
  'min-width',
  'height',
  'min-height',
  'max-height',
  'transform',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'display',
  'grid-template-columns',
]);

// Contenção de texto do label e dimensão do badge são estilo do próprio elemento,
// não geometria do rodapé. Ficam explícitas para que qualquer nova exceção precise
// ser escrita aqui, e não escorregue por descuido.
const allowed = new Set([
  'max-width: 100%;',
  'overflow: hidden;',
  'display: block;',
  'min-width: 18px !important;',
  'height: 18px !important;',
  // Elevação de 1px do ícone ativo: microinteração dentro do botão, desligada em
  // prefers-reduced-motion. Não desloca o rodapé nem nenhum controle.
  'transform: translateY(-1px);',
  'transform: none !important;',
]);

const violations = block
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /^[a-z-]+\s*:/.test(line))
  .filter((line) => structural.has(line.slice(0, line.indexOf(':')).trim()))
  .filter((line) => !allowed.has(line));

assert.deepEqual(
  violations,
  [],
  `bloco do rodapé renderizado declara propriedade estrutural fora do escopo de refino visual: ${violations[0]}`,
);

// 5. O raio do botão continua derivado do raio do contêiner, em vez de virar um
//    segundo número solto. Era essa a incoerência original: contêiner com 8px de
//    --cc-radius genérico contra botões de 21px.
assert.match(
  block,
  /--cc-nav-radius:\s*\d+px/,
  'o contrato de raio do rodapé (--cc-nav-radius) desapareceu',
);
assert.match(
  block,
  /border-radius:\s*calc\(var\(--cc-nav-radius\)\s*-\s*var\(--cc-nav-pad\)\)/,
  'o raio do botão deixou de ser derivado de --cc-nav-radius/--cc-nav-pad',
);

// 6. Refino não introduz cor literal onde o tema já resolve por token.
const hardcoded = block
  .split('\n')
  .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
  .filter((line) => /#[0-9a-fA-F]{3,8}\b/.test(line));

assert.equal(
  hardcoded.length,
  0,
  `bloco do rodapé renderizado introduziu cor literal: ${hardcoded[0]?.trim()}`,
);

// 7. Foco por teclado visível - o rodapé não tinha nenhum estilo de foco próprio,
//    e o :focus-visible de homologation.css só alcança .cc-readable-surface.
assert.ok(
  block.includes(':focus-visible'),
  'o rodapé precisa de estado de foco visível: nenhuma outra camada cobre .cz-bottom-nav',
);

// 8. Movimento reduzido respeitado.
assert.ok(
  block.includes('prefers-reduced-motion'),
  'as transições do rodapé precisam ser desligadas em prefers-reduced-motion',
);

console.log('[p1-shell-1a] rodapé renderizado: CSS e nav miram .cz-bottom-nav, sem estrutura, sem cor literal, com foco e movimento reduzido.');
