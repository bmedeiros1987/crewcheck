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

// 4. Pulse não é cabeçalho: não fixa, não empilha, não disputa o shell. Se
//    alguém precisar disso um dia, que seja uma decisão explícita e não um
//    efeito colateral de refino visual.
const estruturais = ['position:', 'z-index:', 'inset:', 'overflow:'];
for (const prop of estruturais) {
  const linhas = cssRules
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.startsWith(prop));
  // .cc-pulse-dot é o indicador vivo dentro do próprio ícone: position absolute
  // ali é interno à superfície, não posicionamento no shell.
  const foraDoIndicador = linhas.filter((linha) => linha !== 'position: absolute;' && linha !== 'position: relative;');
  assert.deepEqual(
    foraDoIndicador,
    [],
    `crewcheck-pulse.css declara "${prop}" de shell: ${foraDoIndicador[0]}`,
  );
}

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

console.log('[p1-546] Pulse: superfície própria montada no shell, sem estrutura de cabeçalho, sem cor literal, seis categorias, foco e movimento reduzido.');
