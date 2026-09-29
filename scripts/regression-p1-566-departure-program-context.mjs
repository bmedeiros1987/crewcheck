import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const home = read('client/src/pages/Home.tsx');
const bridge = read('client/src/components/navigation/FlightDeckNavigationContext.tsx');
const navigation = read('client/src/lib/navigationContext.ts');
const navigationRuntime = navigation.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const apply = read('scripts/p1-566-departure-program-context/apply.mjs');
const prepare = read('scripts/v139/apply.mjs');

// A mesma ponte usada por Radar/Meteorologia publica a programação explícita para Saída.
assert.match(
  home,
  /function openFlightSurface\(targetView: 'radar' \| 'weather' \| 'departure'\)/,
  'FlightDeck deve usar a ponte única também para Saída',
);
assert.match(
  home,
  /sourceView: 'cockpit',[\s\S]*targetView,[\s\S]*programId: event\.id,[\s\S]*returnView: 'cockpit',[\s\S]*policy: 'persistent-until-return'/,
  'contexto da Saída deve carregar origem, programação e retorno explícitos',
);
assert.match(
  home,
  /onClick=\{\(\) => openFlightSurface\('departure'\)\}/,
  'Planejar saída deve publicar contexto antes de navegar',
);

// O destino resolve apenas a programação escolhida; se ela sumir, falha fechado.
assert.match(
  home,
  /const departureSurfaceContext = view === 'departure' \? peekPendingNavigationContext\('departure'\) : null;/,
  'Saída deve ler somente contexto destinado a ela',
);
assert.match(
  home,
  /events\.find\(\(candidate\) => candidate\.id === departureSurfaceContext\.programId && !candidate\.placeholder && isSmartDepartureEligible\(candidate\)\) \|\| null/,
  'Saída deve resolver a programação pelo ID explícito e revalidar elegibilidade',
);
assert.match(
  home,
  /const departureSurfaceEvent = departureSurfaceContext\?\.programId \? contextualDepartureEvent : departureEvent;/,
  'entrada contextual ausente deve manter a seleção canônica global',
);
assert.doesNotMatch(
  home,
  /departureSurfaceContext\?\.programId \? \(contextualDepartureEvent \|\| departureEvent\)/,
  'contexto inválido não pode cair silenciosamente em outra programação',
);
assert.match(
  home,
  /departureSurfaceEvent \? <Departure event=\{departureSurfaceEvent\} events=\{events\} setView=\{setView\}\/> : <><Brand back\/><FlightDeckContextUnavailable targetView="departure"\/><\/>/,
  'programação contextual ausente deve mostrar estado indisponível',
);

// A própria tela mantém um retorno contextual; abertura global continua sem contexto.
assert.match(
  home,
  /<FlightDeckNavigationContext targetView="departure"\/>/,
  'Saída deve oferecer retorno ao FlightDeck quando veio dele',
);
assert.match(
  bridge,
  /type FlightContextTarget = 'radar' \| 'weather' \| 'departure';/,
  'ponte deve reconhecer Saída sem criar segundo componente/barramento',
);
assert.match(
  bridge,
  /targetView === 'weather' \? 'Meteorologia do voo selecionado' : 'Saída da programação selecionada'/,
  'retorno contextual deve explicar a programação da Saída',
);
assert.match(
  bridge,
  /clearPendingNavigationContext\(\);[\s\S]*detail: 'cockpit'/,
  'retorno deve limpar contexto persistente antes de voltar',
);

// Global/menu/bottom-nav continuam limpando contexto; nenhum estado privado é persistido.
assert.match(
  home,
  /function setView\(nextView: ZeroView\) \{[\s\S]*pendingNavigation\.targetView !== nextView\) clearPendingNavigationContext\(\);[\s\S]*setViewState\(nextView\);/,
  'navegação global deve impedir herança de contexto antigo',
);
assert.doesNotMatch(
  navigationRuntime,
  /localStorage|sessionStorage/,
  'Navigation Context deve permanecer somente em memória',
);
assert.match(
  prepare,
  /p1-566-departure-program-context\/apply\.mjs/,
  'preparação canônica deve reaplicar a fatia após os finalizadores',
);
for (const forbidden of ['aimsParser', 'canonicalRoster', 'financialRules', 'runRadarRace', 'LEAVE_SOON']) {
  assert.ok(!apply.includes(forbidden), `fatia de navegação invadiu domínio proibido: ${forbidden}`);
}

console.log('[p1-566-departure] PASS: programação explícita, falha fechada, retorno contextual e entrada global limpa.');
