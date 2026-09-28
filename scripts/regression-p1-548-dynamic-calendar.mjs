/**
 * #548/#549 → #560 → #566 — contrato atualizado conscientemente.
 *
 * Este gate nasceu para impedir que o calendário dinâmico sumisse do estado
 * preparado, depois de ele ter desaparecido em silêncio na cadeia. A decisão de
 * produto do #560 mudou o que precisa ser protegido: o calendário sai de vista
 * na Linha do Dia e no FlightDeck, e o que permanece vivo é o COMPORTAMENTO —
 * abrir a escala já no dia da programação exibida.
 *
 * #566 funda um Navigation Context único. O adapter rosterFocus preserva a API do
 * #560, mas deixa de manter um segundo barramento próprio: deposita/consome um
 * contexto `once` endereçado somente a `roster`.
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
const navigationContext = fs.readFileSync('client/src/lib/navigationContext.ts', 'utf8');

// ---------------------------------------------------------------------------
// 1. O repasse do #560 continua de uma leitura só, agora sobre o barramento único
//    do #566. Isso impede menu/rodapé de herdarem um foco antigo sem criar um
//    segundo estado paralelo só para a Escala.
// ---------------------------------------------------------------------------
assert.match(relay, /export function setPendingRosterFocus/, 'o adapter precisa preservar o depósito público da data');
assert.match(relay, /export function consumePendingRosterFocus/, 'o adapter precisa preservar a leitura pública');
assert.match(
  relay,
  /setPendingNavigationContext\(\{[\s\S]*?targetView: 'roster'[\s\S]*?policy: 'once'/,
  'o foco da Escala precisa depositar contexto once endereçado somente a roster',
);
assert.match(
  relay,
  /consumePendingNavigationContext\('roster'\)/,
  'o foco da Escala precisa consumir somente contexto endereçado a roster',
);
assert.ok(
  !/let\s+pending\s*:/.test(relay),
  'rosterFocus não pode recriar um segundo barramento pending fora do Navigation Context',
);
assert.match(
  navigationContext,
  /if \(pending\.policy === 'once'\) pending = null;/,
  'o barramento compartilhado precisa apagar contextos once no primeiro consumo correto',
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
// Dia pedido sem programação publicada não pode virar clique morto nem parada no
// topo: o aviso explica, e a escala rola até a data pedida do mesmo jeito.
assert.match(
  home,
  /toast\.info\(`Sem programação publicada em \$\{pad2\(focus\.getDate\(\)\)\}\/\$\{pad2\(focus\.getMonth\(\) \+ 1\)\}[^`]*`\);/,
  'o Roster precisa avisar, com a data pedida, quando o dia não tem programação publicada',
);
assert.ok(
  !/toast\.info\(`Sem programação publicada[\s\S]{0,120}?return;/.test(home),
  'o aviso de dia sem programação não pode interromper a rolagem: a escala precisa abrir na data pedida mesmo assim',
);
// A âncora dos dias vazios vive na seção "Todos os dias publicados", que lista
// todos os dias — inclusive os sem evento. Sem ela o scroll não teria alvo.
assert.match(
  home,
  /<article key=\{`\$\{day\.date\}-\$\{index\}`\} data-roster-day=\{dateChip\(d\)\}/,
  'os dias publicados sem programação precisam de data-roster-day para o foco contextual encontrar alvo',
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
// 6. O relay de navegação não encosta em parser, canônico ou regra financeira.
// ---------------------------------------------------------------------------
for (const forbidden of ['pdfParser', 'rosterParser', 'financialRules', 'canonicalRoster']) {
  assert.ok(!relay.includes(forbidden), `o adapter de foco não pode tocar ${forbidden}`);
  assert.ok(!navigationContext.includes(forbidden), `o Navigation Context não pode tocar ${forbidden}`);
}

console.log('P1 #548→#560→#566: navegação contextual por data protegida — adapter da Escala sobre barramento único consume-once, Linha do Dia e FlightDeck preservados.');
