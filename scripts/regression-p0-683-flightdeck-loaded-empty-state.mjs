import fs from 'node:fs';
import assert from 'node:assert/strict';

const snippet = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');

assert.ok(snippet.includes("const vacationEvent = nextVacationRestV14353(events, nowMs);"), 'FlightDeck must derive vacation/rest context from canonical rest events');
assert.ok(snippet.includes("loaded ? 'Ver escala' : 'Importar PDF'"), 'Loaded roster empty state must offer Ver escala instead of reimport');
assert.ok(!snippet.includes("loaded ? 'Reimportar escala' : 'Importar PDF'"), 'Loaded roster must not present Reimportar escala as primary CTA');
assert.ok(snippet.includes("onClick={() => loaded ? setView('roster') : onUpload()}"), 'Loaded roster CTA must navigate to roster; import only when nothing is loaded');
assert.ok(snippet.includes("vacationEvent ? 'Férias na escala' : 'Sem programação operacional futura'"), 'Vacation context must be explicit without pretending the roster is missing');
assert.ok(snippet.includes("event.canonical?.kind === 'rest'"), 'Vacation context must come from canonical rest events');
assert.ok(snippet.includes("pairingCode || event.day?.type"), 'Vacation detection must use published roster code evidence');

console.log('PASS p0-683 FlightDeck loaded empty-state contract');
