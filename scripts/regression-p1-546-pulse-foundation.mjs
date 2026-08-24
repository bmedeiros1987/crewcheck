/**
 * #546 — fundação do CrewCheck Pulse.
 *
 * Pulse é a camada de comunicação viva do sistema, não o cabeçalho. O contrato
 * que este gate protege é justamente a separação que faltava:
 *   - cabeçalho (.cz-global-header) = navegação e contexto da tela;
 *   - Pulse (.cc-pulse) = o que o sistema tem a dizer agora.
 *
 * Roda depois da cadeia de preparação, porque a montagem vive em Home.tsx, que
 * é reescrito por vários aplicadores. Sem isso, a superfície poderia sumir do
 * estado que roda sem que nenhum teste percebesse — a classe do #549.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/pulse/crewcheck-pulse.css', 'utf8');
// Comentários saem antes de qualquer varredura. Filtrar por prefixo de linha não
// serve: a linha "CrewCheck Pulse — ... (#546)" fica dentro de um bloco /* */ sem
// começar com asterisco, e o "#546" casa como cor hexadecimal.
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const tsx = fs.readFileSync('client/src/components/pulse/CrewCheckPulse.tsx', 'utf8');

// 1. A superfície está montada no shell e sobreviveu à cadeia.
assert.match(
  home,
  /<CrewCheckPulse\/>/,
  'CrewCheckPulse não está montado em Home.tsx: a fundação do Pulse sumiu do shell',
);
assert.match(
  home,
  /import CrewCheckPulse from '@\/components\/pulse\/CrewCheckPulse';/,
  'o import do CrewCheckPulse desapareceu de Home.tsx',
);

// 2. Fica logo depois do espaçador do cabeçalho, no fluxo normal — é o que
//    garante que não cobre conteúdo nem a navegação inferior.
const spacer = home.indexOf('<div className="cz-global-header-spacer"');
const pulse = home.indexOf('<CrewCheckPulse/>');
assert.ok(spacer !== -1 && pulse > spacer, 'o Pulse precisa vir depois do espaçador do cabeçalho');

// 3. Sem mensagem publicada, não renderiza nada. É o que torna a fundação
//    segura de montar antes de existir fila e integração (slice 2).
assert.match(
  tsx,
  /if \(!message\) return null;/,
  'o Pulse precisa não renderizar nada enquanto não houver mensagem publicada',
);

// 4. Fixação: o Pulse acompanha a tela enquanto está ativo, mas por sticky, não
//    por fixed. Sticky some junto com o elemento quando não há mensagem e não
//    reserva espaço; fixed transformaria a superfície em mais uma barra do shell,
//    que é justamente o que a separação header/Pulse existe para evitar.
assert.match(
  cssRules,
  /\.cc-pulse \{[^}]*position: sticky;/,
  'o Pulse precisa ser sticky para não sumir com o scroll',
);
assert.ok(
  !/position:\s*fixed/.test(cssRules),
  'o Pulse não pode ser fixed: isso o transformaria em barra de shell',
);

// O deslocamento de topo espelha as três alturas do espaçador do cabeçalho, para
// o banner parar abaixo dele em vez de escorregar por baixo.
for (const altura of ['116px', '62px', '88px']) {
  assert.ok(
    cssRules.includes(`--cc-pulse-offset: calc(${altura} + env(safe-area-inset-top, 0px))`),
    `deslocamento de ${altura} ausente: o Pulse deixaria de espelhar o espaçador do cabeçalho`,
  );
}

// 4b. O Pulse não entra na disputa de !important do shell. É classe nova, que
//     nenhuma outra folha estiliza — não precisa de força bruta para vencer.
const importantes = cssRules
  .split('\n')
  .map((linha) => linha.trim())
  .filter((linha) => linha.includes('!important'));
assert.deepEqual(
  importantes,
  [],
  `crewcheck-pulse.css usa !important: ${importantes[0]}`,
);

// 4c. Alvo de toque de 44x44 no dispensar, sem inchar o visual do ícone.
assert.match(
  cssRules,
  /\.cc-pulse-dismiss::after \{[^}]*inset: -6px;/,
  'o botão de dispensar precisa expandir o alvo de toque para 44x44 por pseudo-elemento',
);
assert.match(
  cssRules,
  /\.cc-pulse-dismiss \{[^}]*width: 32px;[^}]*height: 32px;/,
  'o visual do dispensar deve continuar em 32px — a expansão é só do alvo de toque',
);

// 5. Tokens antes de hardcoded, nos dois temas.
const literais = cssRules
  .split('\n')
  .filter((linha) => /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(linha));
assert.deepEqual(literais, [], `crewcheck-pulse.css introduziu cor literal: ${literais[0]?.trim()}`);

// 6. As seis categorias do contrato têm cor semântica própria.
for (const tone of ['informativo', 'sucesso', 'atencao', 'erro', 'operacional', 'lembrete']) {
  assert.ok(
    css.includes(`.cc-pulse[data-tone='${tone}']`),
    `categoria "${tone}" sem cor semântica definida`,
  );
  assert.ok(tsx.includes(`${tone}:`) || tsx.includes(`'${tone}'`), `categoria "${tone}" sem ícone semântico`);
}

// 7. Acessibilidade e movimento.
assert.ok(css.includes('prefers-reduced-motion'), 'as animações do Pulse precisam ser desligadas em prefers-reduced-motion');
assert.ok(css.includes(':focus-visible'), 'o botão de dispensar precisa de foco visível');
assert.ok(tsx.includes("role=\"status\"") && tsx.includes('aria-live="polite"'), 'o Pulse precisa se anunciar como região de status');

console.log('[p1-546] Pulse: superfície própria montada no shell, sticky sem fixed, sem !important, alvo de toque 44x44, sem cor literal, seis categorias, foco e movimento reduzido.');
