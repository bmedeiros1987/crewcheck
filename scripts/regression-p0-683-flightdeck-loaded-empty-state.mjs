import fs from 'node:fs';
import assert from 'node:assert/strict';

function assertContract(source, label) {
  assert.ok(source.includes("const vacationEvent = nextVacationRestV14353(events, nowMs);"), `${label}: FlightDeck must derive vacation/rest context from canonical rest events`);
  assert.ok(source.includes("loaded ? 'Ver escala' : 'Importar PDF'"), `${label}: loaded roster empty state must offer Ver escala instead of reimport`);
  assert.ok(!source.includes("loaded ? 'Reimportar escala' : 'Importar PDF'"), `${label}: loaded roster must not present Reimportar escala as primary CTA`);
  assert.ok(source.includes("onClick={() => loaded ? setView('roster') : onUpload()}"), `${label}: loaded roster CTA must navigate to roster; import only when nothing is loaded`);
  assert.ok(source.includes("vacationEvent ? 'Férias na escala' : 'Sem programação operacional futura'"), `${label}: vacation context must be explicit without pretending the roster is missing`);
  assert.ok(source.includes("event.canonical?.kind === 'rest'"), `${label}: vacation context must come from canonical rest events`);
  assert.ok(source.includes("pairingCode || event.day?.type"), `${label}: vacation detection must use published roster code evidence`);
}

const snippet = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');
assertContract(snippet, 'authoritative snippet');

if (process.env.CHECK_PREPARED === '1') {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assertContract(home, 'prepared Home.tsx');
}

console.log(`PASS p0-683 FlightDeck loaded empty-state contract${process.env.CHECK_PREPARED === '1' ? ' (prepared)' : ' (source)'}`);
