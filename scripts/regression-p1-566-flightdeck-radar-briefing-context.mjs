import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const home = read('client/src/pages/Home.tsx');
const bridge = read('client/src/components/navigation/FlightDeckNavigationContext.tsx');
const css = read('client/src/components/navigation/flight-context.css');
const navigation = read('client/src/lib/navigationContext.ts');

// FlightDeck deposits explicit, reviewable identifiers only. No parser/compliance work here.
assert.match(home, /function openFlightSurface\(targetView: 'radar' \| 'weather'\)/, 'FlightDeck deve ter uma única ponte para Radar/Meteorologia');
for (const marker of [
  "sourceView: 'cockpit'",
  'dateEpochMs: eventStartDateTime(event).getTime()',
  'programId: event.id',
  "flightKey: String(event.flightNumber || '').trim() || undefined",
  "airportCode: String(event.origin || '').trim() || undefined",
  "returnView: 'cockpit'",
  "returnLabel: 'Voltar ao FlightDeck'",
  "policy: 'persistent-until-return'",
]) assert.ok(home.includes(marker), `contexto FlightDeck ausente: ${marker}`);
assert.match(home, /openFlightSurface\('radar'\)/, 'Radar deve abrir pelo Navigation Context');
assert.match(home, /openFlightSurface\('weather'\)/, 'Meteorologia deve abrir pelo Navigation Context');

// Destination resolves exactly the program id supplied by FlightDeck. If it disappeared,
// fail closed instead of silently switching to another real flight.
assert.match(home, /events\.find\(\(candidate\) => candidate\.id === flightSurfaceContext\.programId && candidate\.kind === 'flight' && !candidate\.placeholder\) \|\| null/, 'destino deve resolver pelo programId exato');
assert.match(home, /const flightSurfaceEvent = flightSurfaceContext\?\.programId \? contextualFlightEvent : flightEvent;/, 'entrada global pode usar próximo voo; entrada contextual não pode substituir voo ausente');
assert.doesNotMatch(home, /flightSurfaceContext\?\.programId[\s\S]{0,220}contextualFlightEvent\s*\|\|\s*flightEvent/, 'contexto não pode cair silenciosamente em outro voo');
assert.match(home, /FlightDeckContextUnavailable targetView="radar"/, 'Radar deve falhar fechado quando contexto não existir mais');
assert.match(home, /FlightDeckContextUnavailable targetView="weather"/, 'Meteorologia deve falhar fechado quando contexto não existir mais');

// Successful destinations keep a clear return affordance; direct/menu entry renders none.
assert.match(home, /<FlightDeckNavigationContext targetView="radar"\/>/, 'Radar deve exibir retorno contextual quando veio do FlightDeck');
assert.match(home, /<FlightDeckNavigationContext targetView="weather"\/>/, 'Meteorologia deve exibir retorno contextual quando veio do FlightDeck');
assert.match(bridge, /context\.sourceView === 'cockpit'/, 'retorno só deve aparecer para origem FlightDeck');
assert.match(bridge, /context\.returnView === 'cockpit'/, 'retorno precisa ser explicitamente FlightDeck');
assert.match(bridge, /context\.programId/, 'retorno contextual exige identidade da programação');
assert.match(bridge, /clearPendingNavigationContext\(\);[\s\S]*detail: 'cockpit'/, 'retorno deve limpar contexto antes de voltar ao FlightDeck');

// Radar -> Meteorologia keeps the same explicit flight context when it was inherited
// from FlightDeck, rather than rebuilding identity from a label or selecting another flight.
assert.match(home, /const inheritedContext = peekPendingNavigationContext\('radar'\);/, 'Radar deve inspecionar o contexto que recebeu');
assert.match(home, /setPendingNavigationContext\(\{ \.\.\.inheritedContext, targetView: 'weather' \}\)/, 'Radar deve repassar o mesmo contexto para Meteorologia');
assert.match(home, /<button onClick=\{openWeatherFromRadar\}><CloudSun\/> Meteorologia<\/button>/, 'handoff Radar → Meteorologia deve usar a ponte contextual');

// Privacy/architecture: context surface is display/navigation only. Word-boundary ACT
// avoids treating the package name "react" as the aviation acronym.
assert.doesNotMatch(bridge, /localStorage|sessionStorage|indexedDB|fetch\(|authFetch|Health|Samsung/i, 'ponte não pode persistir, buscar ou acessar saúde');
assert.doesNotMatch(bridge, /pdfParser|canonicalRoster|complianceEngine|RBAC|\bACT\b|dutyLimit|journeyLimit/i, 'ponte não pode duplicar parser/compliance');
assert.doesNotMatch(navigation.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage/, 'Navigation Context deve continuar somente em memória');

// UX parity.
assert.match(css, /cc-flight-context-return/, 'faixa contextual precisa de estilo próprio');
assert.match(css, /html\[data-crew-theme="light"\] \.cc-flight-context-return/, 'faixa precisa de Light mode');
assert.match(css, /@media \(max-width: 620px\)/, 'faixa precisa adaptar no mobile');
assert.match(bridge, /aria-label="Contexto do voo aberto pelo FlightDeck"/, 'faixa deve ter descrição acessível');

console.log('[p1-566-flight] PASS — FlightDeck ↔ Radar/Meteorologia preserva voo explícito, retorno e fail-closed.');
