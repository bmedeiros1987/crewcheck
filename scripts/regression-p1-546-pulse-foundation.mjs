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
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

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

// ---------------------------------------------------------------------------
// 8. Comportamento — a corrida entre dispensar e publicar.
//
//    Dispensar agenda a limpeza do estado para depois da animação de saída. Se
//    uma mensagem nova chegasse dentro dessa janela, o timer antigo apagava a
//    mensagem nova. Num banner operacional o aviso recém-chegado é justamente o
//    que não pode sumir.
//
//    Este bloco executa a sequência de verdade, com relógio injetado — o projeto
//    não tem jsdom, testing-library nem vitest, e foi por isso que a lógica saiu
//    do componente para um módulo próprio: um teste que só lesse o texto do
//    fonte não provaria nada sobre a corrida.
// ---------------------------------------------------------------------------
{
  const { load, cleanup } = loadClientModules({
    files: ['client/src/components/pulse/pulseTypes.ts', 'client/src/components/pulse/pulseSession.ts'],
    stubs: TYPE_ONLY_PDF_PARSER_STUB,
    prefix: 'crewcheck-546-session-',
  });
  const { createPulseSession, PULSE_LEAVE_MS } = load('pulseSession');

  // Relógio falso: guarda os agendamentos e só dispara quando mandado.
  const criarRelogio = () => {
    const agendados = new Map();
    let proximo = 1;
    return {
      timers: {
        set: (fn, ms) => { const id = proximo++; agendados.set(id, { fn, ms }); return id; },
        clear: (id) => { agendados.delete(id); },
      },
      pendentes: () => agendados.size,
      avancar: () => { for (const [id, { fn }] of [...agendados]) { agendados.delete(id); fn(); } },
    };
  };

  const A = { title: 'Escala importada com sucesso.', tone: 'sucesso' };
  const B = { title: 'Há inconsistências na programação importada.', tone: 'atencao' };

  // dismiss A -> publish B antes de PULSE_LEAVE_MS -> B permanece
  {
    const relogio = criarRelogio();
    let estado = null;
    const sessao = createPulseSession((s) => { estado = s; }, { timers: relogio.timers });

    sessao.publish(A);
    assert.equal(estado.message.title, A.title, 'A deveria estar visível após publicar');

    sessao.dismiss();
    assert.equal(estado.leaving, true, 'dispensar deveria iniciar a saída animada');
    assert.equal(relogio.pendentes(), 1, 'dispensar deveria agendar exatamente uma limpeza');

    sessao.publish(B);
    assert.equal(relogio.pendentes(), 0, 'publicar deveria cancelar a limpeza pendente de A');
    assert.equal(estado.message.title, B.title, 'B deveria estar visível');
    assert.equal(estado.leaving, false, 'B não deveria nascer em estado de saída');

    relogio.avancar();
    assert.equal(
      estado.message?.title,
      B.title,
      'o timer de saída de A apagou a mensagem B: a corrida do dismiss continua aberta',
    );
  }

  // Controle: sem mensagem nova, a dispensa continua limpando o estado.
  {
    const relogio = criarRelogio();
    let estado = null;
    const sessao = createPulseSession((s) => { estado = s; }, { timers: relogio.timers });
    sessao.publish(A);
    sessao.dismiss();
    relogio.avancar();
    assert.equal(estado.message, null, 'sem mensagem nova, dispensar precisa limpar o Pulse');
    assert.equal(estado.leaving, false, 'estado de saída precisa voltar ao normal depois de limpar');
  }

  // Desmontagem não deixa timer vivo.
  {
    const relogio = criarRelogio();
    const sessao = createPulseSession(() => {}, { timers: relogio.timers });
    sessao.publish(A);
    sessao.dismiss();
    assert.equal(relogio.pendentes(), 1, 'dispensar deveria ter deixado um timer pendente');
    sessao.dispose();
    assert.equal(relogio.pendentes(), 0, 'dispose precisa cancelar o timer pendente');
  }

  assert.equal(PULSE_LEAVE_MS, 180, 'a janela de saída deve continuar alinhada à animação do CSS');
  cleanup();
}

// O componente não pode voltar a agendar timer solto: a sessão é dona única.
assert.ok(
  !/window\.setTimeout/.test(tsx),
  'CrewCheckPulse.tsx voltou a agendar timer diretamente: o dono do timer é a sessão',
);
assert.ok(
  tsx.includes('session.dispose()'),
  'o componente precisa descartar a sessão ao desmontar',
);

console.log('[p1-546] Pulse: superfície própria montada no shell, sticky sem fixed, sem !important, alvo de toque 44x44, sem cor literal, seis categorias, foco e movimento reduzido; dispensa não apaga mensagem nova.');
