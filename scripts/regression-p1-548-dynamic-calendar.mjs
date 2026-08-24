/**
 * #548/#549 → #560 — contrato atualizado conscientemente.
 *
 * Este gate nasceu para impedir que o calendário dinâmico sumisse do estado
 * preparado, depois de ele ter desaparecido em silêncio na cadeia. A decisão de
 * produto do #560 mudou o que precisa ser protegido: o calendário sai de vista
 * na Linha do Dia e no FlightDeck, e o que permanece vivo é o COMPORTAMENTO —
 * abrir a escala já no dia da programação exibida.
 *
 * Então o gate deixa de afirmar a presença literal do calendário e passa a
 * afirmar a navegação contextual por data. A parte que continua valendo sem
 * mudança é a que impediu o bug original: cliente e fonte fixada da Linha do Dia
 * precisam seguir byte-idênticos, senão a cadeia descarta a integração inteira
 * sem acusar erro.
 *
 * Roda em estado preparado: o FlightDeck só existe em Home.tsx depois que
 * scripts/v14353 injeta o snippet.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';

const timeline = fs.readFileSync('client/src/components/v14349/OperationalDayTimeline.tsx', 'utf8');
const pinnedTimeline = fs.readFileSync('scripts/v14357/OperationalDayTimeline.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const snippet = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');
const relay = fs.readFileSync('client/src/lib/rosterFocus.ts', 'utf8');

// ---------------------------------------------------------------------------
// 1. O repasse de foco é de uma leitura só. É isso que impede o rodapé e o menu
//    de herdarem o foco de uma navegação anterior — sem precisar tocar em
//    nenhum dos dois, que são materializados por scripts/v1432 e v14337.
// ---------------------------------------------------------------------------
assert.match(relay, /export function setPendingRosterFocus/, 'o repasse precisa expor o depósito da data');
assert.match(relay, /export function consumePendingRosterFocus/, 'o repasse precisa expor a leitura');
assert.match(
  relay,
  /const value = pending;\s*\n\s*pending = null;\s*\n\s*return value;/,
  'consumir precisa esvaziar o repasse: sem isso o rodapé e o menu herdam foco antigo',
);

// ---------------------------------------------------------------------------
// 2. Linha do Dia — sem calendário, com data no comportamento.
// ---------------------------------------------------------------------------
assert.ok(
  !timeline.includes('CrewCheckDynamicCalendar'),
  'o calendário voltou à Linha do Dia: a decisão do #560 é que ele sai de vista',
);
// A ordem importa: buildOperationalDayTimeline mantém itens já encerrados por
// até 2 h, então timeline[0] pode ser passado. O CTA precisa levar o compromisso
// corrente, senão o próximo, e só então o primeiro item relevante.
assert.ok(
  timeline.includes('const focusDate = current?.at || next?.at || timeline[0]?.at || new Date();'),
  'o CTA da Linha do Dia precisa priorizar o compromisso corrente, depois o próximo, e só então o primeiro item',
);
assert.ok(
  !/const focusDate = timeline\[0\]\?\.at \|\| new Date\(\);/.test(timeline),
  'o CTA da Linha do Dia voltou a usar timeline[0] direto: com a janela de 2 h isso abre a data errada',
);
assert.match(
  timeline,
  /setPendingRosterFocus\(focusDate\);\s*onNavigate\('roster'\)/,
  '"Ver escala" da Linha do Dia precisa abrir o roster na data em foco',
);
assert.match(
  timeline,
  /setPendingRosterFocus\(item\.at\);\s*onNavigate\(item\.targetView \|\| 'roster'\)/,
  'cada item da Linha do Dia precisa abrir a escala no próprio dia',
);

// ---------------------------------------------------------------------------
// 3. FlightDeck — o lançador vira "Ver Escala" e leva a data da programação.
// ---------------------------------------------------------------------------
assert.ok(
  !snippet.includes('cc-flydeck-calendar-icon'),
  'o ícone de calendário voltou ao FlightDeck: o lançador agora é "Ver Escala"',
);
assert.ok(snippet.includes('Ver Escala'), 'o lançador do FlightDeck precisa se chamar "Ver Escala"');
assert.match(
  snippet,
  /setPendingRosterFocus\(eventStartDateTime\(event\)\);\s*setView\('roster'\)/,
  '"Ver Escala" precisa abrir o roster na data da programação exibida',
);
assert.ok(
  home.includes('cc-flydeck-roster-link'),
  'o lançador do FlightDeck não chegou a Home.tsx: rode este gate depois da cadeia',
);

// ---------------------------------------------------------------------------
// 4. Roster consome o foco ao abrir.
// ---------------------------------------------------------------------------
assert.match(
  home,
  /const focus = consumePendingRosterFocus\(\);/,
  'o Roster precisa consumir o foco contextual ao montar',
);
assert.match(
  home,
  /document\.querySelector\(`\[data-roster-day="\$\{key\}"\]`\)/,
  'o Roster precisa rolar até o dia focado',
);
// Dia pedido sem programação publicada não pode virar clique morto: a data
// pedida é preservada na mensagem e o usuário sabe que a escala abriu mesmo
// assim.
assert.match(
  home,
  /if \(!target\) \{[\s\S]*?toast\.info\(`Sem programação publicada em \$\{pad2\(focus\.getDate\(\)\)\}\/\$\{pad2\(focus\.getMonth\(\) \+ 1\)\}[^`]*`\);[\s\S]*?return;/,
  'o Roster precisa avisar, com a data pedida, quando o dia não tem programação publicada — em vez de não fazer nada',
);

// ---------------------------------------------------------------------------
// 5. A trava que resolveu o bug original continua igual. scripts/v14357/apply.mjs
//    sobrescreve o arquivo inteiro com a cópia fixada (`update(..., () =>
//    timelineSource)`), então qualquer divergência apaga a integração no estado
//    preparado sem a cadeia acusar erro.
// ---------------------------------------------------------------------------
assert.equal(
  timeline,
  pinnedTimeline,
  'client/src/components/v14349/OperationalDayTimeline.tsx e scripts/v14357/OperationalDayTimeline.tsx precisam ser idênticos, senão a cadeia de preparação descarta a Linha do Dia',
);

// ---------------------------------------------------------------------------
// 6. Slice visual não encosta em parser, canônico ou regra financeira.
// ---------------------------------------------------------------------------
for (const forbidden of ['pdfParser', 'rosterParser', 'financialRules', 'canonicalRoster']) {
  assert.ok(!relay.includes(forbidden), `o repasse de foco não pode tocar ${forbidden}`);
}

console.log('P1 #548→#560: navegação contextual por data protegida — repasse de leitura única, Linha do Dia e FlightDeck sem calendário, Roster focando o dia, cópia fixada idêntica.');
