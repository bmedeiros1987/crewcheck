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

const CSS_PATH = 'client/src/styles/bottom-nav-clarity.css';
const START = '/* shell-1a:start */';
const END = '/* shell-1a:end */';

// A primeira versão deste gate usava css.slice(start) e passava a auditar todo o
// restante do stylesheet. Como o bloco 1A era a última seção do arquivo, o teste
// passava - mas qualquer seção futura, não relacionada ao rodapé, herdaria as
// restrições de 1A e quebraria o gate por falso positivo. A delimitação agora é
// explícita nos dois lados, e a prova de que ela funciona está em provarDelimitacao().
function extrairBloco(css, origem = CSS_PATH) {
  const inicio = css.indexOf(START);
  assert.notEqual(inicio, -1, `sentinela ${START} ausente em ${origem}`);

  const fim = css.indexOf(END, inicio + START.length);
  assert.notEqual(fim, -1, `sentinela ${END} ausente em ${origem}: o bloco 1A precisa ser fechado, senão o gate volta a auditar o arquivo inteiro`);

  return css.slice(inicio + START.length, fim);
}

const ESTRUTURAIS = new Set([
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
const PERMITIDAS = new Set([
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

function violacoesEstruturais(bloco) {
  return bloco
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => /^[a-z-]+\s*:/.test(linha))
    .filter((linha) => ESTRUTURAIS.has(linha.slice(0, linha.indexOf(':')).trim()))
    .filter((linha) => !PERMITIDAS.has(linha));
}

function coresLiterais(bloco) {
  return bloco
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('*') && !linha.trim().startsWith('/*'))
    .filter((linha) => /#[0-9a-fA-F]{3,8}\b/.test(linha));
}

// Prova exigida pela auditoria do #552: uma seção CSS não relacionada, acrescentada
// depois do bloco 1A, não pode disparar falso positivo. A seção sintética abaixo usa
// de propósito tudo o que 1A proíbe - display, width, position e cor literal - e é
// legítima no seu próprio contexto. Se a delimitação regredir para "do marcador até
// o fim do arquivo", este teste falha aqui, antes de falsear qualquer PR futuro.
function provarDelimitacao(css) {
  const secaoFutura = [
    '',
    '/* Seção hipotética de outra frente do shell. */',
    '.cz-alguma-outra-superficie {',
    '  position: sticky;',
    '  display: grid;',
    '  width: 100%;',
    '  min-height: 48px;',
    '  color: #ff0000;',
    '}',
    '',
  ].join('\n');

  const origem = 'stylesheet sintético (prova de delimitação)';
  const original = extrairBloco(css);
  const depois = extrairBloco(css + secaoFutura, origem);

  // A prova é de indiferença, não de ausência: acrescentar a seção não pode mudar
  // nada do que o gate enxerga. Comparar contra listas vazias faria uma violação
  // real, dentro do bloco, ser relatada aqui como se fosse falso positivo.
  assert.equal(
    depois,
    original,
    'a extração do bloco 1A mudou ao acrescentar uma seção não relacionada: a delimitação não está fechada',
  );

  assert.deepEqual(
    violacoesEstruturais(depois),
    violacoesEstruturais(original),
    'seção não relacionada acrescentada depois de shell-1a:end alterou as violações estruturais vistas pelo gate: falso positivo',
  );

  assert.deepEqual(
    coresLiterais(depois),
    coresLiterais(original),
    'seção não relacionada acrescentada depois de shell-1a:end alterou as cores literais vistas pelo gate: falso positivo',
  );
}

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync(CSS_PATH, 'utf8');

provarDelimitacao(css);

const bloco = extrairBloco(css);

// 1. A superfície renderizada continua sendo .cz-bottom-nav.
assert.match(
  home,
  /<nav className="cz-bottom-nav"/,
  'Home.tsx deixou de renderizar .cz-bottom-nav: reavaliar qual é a navegação canônica antes de mexer no CSS do rodapé',
);

// 2. O CSS do rodapé mira essa mesma classe.
assert.ok(
  bloco.includes('.cz-bottom-nav'),
  'o bloco 1A não estiliza .cz-bottom-nav - o refino voltaria a mirar uma nav sem consumidores',
);

// 3. O seletor `body >` acompanha o portal. scripts/v1432/apply.mjs move o rodapé
//    para document.body no estado preparado; sem esse seletor a regra perde a
//    disputa de especificidade com components/v1432/homologation.css.
assert.ok(
  bloco.includes('body > .cz-bottom-nav'),
  'o bloco 1A precisa de um seletor `body > .cz-bottom-nav`: no estado preparado o rodapé é portado para document.body',
);

// 4. O bloco não decide estrutura. Posição, empilhamento, largura e grade continuam
//    sendo contrato de premium-audit-v13-8-8.css e de components/v1432/homologation.css
//    - alterá-los aqui é exatamente a classe de mudança que produz cobertura de
//    conteúdo e quebra de navegação.
const violacoes = violacoesEstruturais(bloco);
assert.deepEqual(
  violacoes,
  [],
  `bloco 1A declara propriedade estrutural fora do escopo de refino visual: ${violacoes[0]}`,
);

// 5. O raio do botão continua derivado do raio do contêiner, em vez de virar um
//    segundo número solto. Era essa a incoerência original: contêiner com 8px de
//    --cc-radius genérico contra botões de 21px.
assert.match(
  bloco,
  /--cc-nav-radius:\s*\d+px/,
  'o contrato de raio do rodapé (--cc-nav-radius) desapareceu',
);
assert.match(
  bloco,
  /border-radius:\s*calc\(var\(--cc-nav-radius\)\s*-\s*var\(--cc-nav-pad\)\)/,
  'o raio do botão deixou de ser derivado de --cc-nav-radius/--cc-nav-pad',
);

// 6. Refino não introduz cor literal onde o tema já resolve por token.
const literais = coresLiterais(bloco);
assert.deepEqual(
  literais,
  [],
  `bloco 1A introduziu cor literal: ${literais[0]?.trim()}`,
);

// 7. Foco por teclado visível - o rodapé não tinha nenhum estilo de foco próprio,
//    e o :focus-visible de homologation.css só alcança .cc-readable-surface.
assert.ok(
  bloco.includes(':focus-visible'),
  'o rodapé precisa de estado de foco visível: nenhuma outra camada cobre .cz-bottom-nav',
);

// 8. Movimento reduzido respeitado.
assert.ok(
  bloco.includes('prefers-reduced-motion'),
  'as transições do rodapé precisam ser desligadas em prefers-reduced-motion',
);

console.log('[p1-shell-1a] bloco delimitado por sentinelas; rodapé renderizado: CSS e nav miram .cz-bottom-nav, sem estrutura, sem cor literal, com foco e movimento reduzido.');
