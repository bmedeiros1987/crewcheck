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
const frame = fs.readFileSync('client/src/components/navigation/InternalHeaderFrame.tsx', 'utf8');
const finalCss = fs.readFileSync('client/src/styles/ipad-header-recovery.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

// 1. A marca e o aviso têm superfícies separadas no mesmo header em fluxo.
//    Brand conserva navegação mesmo sem aviso; só o frame monta o Pulse ativo.
assert.match(home, /<InternalHeaderFrame>\s*<Brand back=\{view !== 'cockpit'\} onMenu=\{view === 'cockpit' \? \(\) => setDrawer\(true\) : undefined\}\/>\s*<\/InternalHeaderFrame>/,
  'o header deve montar marca navegável e frame de avisos');
assert.equal((home.match(/<InternalHeaderFrame>/g) || []).length, 1, 'a aplicação deve montar um único header global');
assert.match(frame, /className="cz-global-header" data-global-internal-header="true">\{children\}<CrewCheckPulse compact\/>/,
  'o frame deve preservar a marca e montar um único Pulse compacto');
assert.equal((frame.match(/<CrewCheckPulse\b/g) || []).length, 1, 'não duplicar a superfície de aviso');
assert.ok(!/<Brand pulse(?:\s|=)/.test(home), 'Brand não deve montar outro Pulse além do frame');
assert.ok(
  !home.includes('<CrewCheckPulse/>'),
  'não pode existir uma segunda superfície Pulse abaixo do header',
);

// 2. Sem mensagem importante, Pulse retorna null no frame e mantém a marca.
assert.match(
  tsx,
  /if \(!message\) return compact \? <>\{fallback\}<\/> : null;/,
  'sem alerta, o Pulse compacto precisa devolver a identidade do header',
);

// 3. O resumo compacto preserva toque/ellipsis. Detalhes expandidos ficam no
//    fluxo e mostram todo o texto; avisos críticos não podem ser truncados.
assert.match(
  cssRules,
  /\.cc-pulse-compact-trigger \{[^}]*min-height: 44px;/,
  'o resumo compacto precisa manter alvo de toque de 44px',
);
assert.match(
  cssRules,
  /\.cc-pulse-compact-trigger > strong \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/,
  'o título do Pulse compacto precisa permanecer em uma linha',
);
assert.match(finalCss, /\.cz-global-header \.cc-pulse-popover\s*\{[^}]*position:\s*static;[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/,
  'detalhes precisam ficar no fluxo e continuar inteiros');
assert.match(finalCss, /\.cz-app\[data-version\] > \.cz-global-header\s*\{[^}]*position:\s*relative !important;/,
  'o header final deve acompanhar o fluxo da página');
assert.match(finalCss, /data-priority="critica"[\s\S]*?white-space:normal!important;overflow:visible!important;overflow-wrap:anywhere/,
  'aviso crítico deve mostrar o título completo');
assert.ok(main.trimEnd().endsWith('import "./styles/ipad-header-recovery.css";'), 'CSS do header deve fechar a precedência visual');
assert.ok(
  !/--cc-header-clearance|ResizeObserver/.test(css + home),
  'o Pulse não pode voltar a controlar dinamicamente a geometria do header',
);

// 4. O Pulse continua sem entrar na disputa de !important do shell.
const importantes = cssRules
  .split('\n')
  .map((linha) => linha.trim())
  .filter((linha) => linha.includes('!important'));
assert.deepEqual(
  importantes,
  [],
  `crewcheck-pulse.css usa !important: ${importantes[0]}`,
);

// 4b. O botão de dispensar mantém visual de 32px com alvo efetivo expandido,
//     enquanto o trigger compacto já possui 44px visíveis.
assert.match(
  cssRules,
  /\.cc-pulse-dismiss::after \{[^}]*inset: -6px;/,
  'o botão de dispensar precisa preservar o alvo expandido',
);
assert.match(
  cssRules,
  /\.cc-pulse-dismiss \{[^}]*width: 32px;[^}]*height: 32px;/,
  'o visual do dispensar deve continuar em 32px',
);
assert.ok(
  !/position:\s*fixed/.test(cssRules),
  'o Pulse não deve criar uma segunda superfície fixed',
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
  tsx.includes('subscribeCrewCheckPulse(setState)'),
  'o componente precisa assinar o runtime singleton do Pulse para a fila sobreviver a remontagens',
);

console.log('[p1-546] Pulse: header único com marca navegável, aviso compacto e detalhes em fluxo completos; tokens/foco/fila/dispensa continuam seguros.');
