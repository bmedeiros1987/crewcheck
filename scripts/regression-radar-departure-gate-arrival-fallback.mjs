import assert from 'node:assert/strict';
import fs from 'node:fs';

const serverSource = fs.readFileSync('server.mjs', 'utf8').replace(/\r\n/g, '\n');

// #421 regra 6: "Departure gate/terminal nunca podem ser preenchidos a partir de
// arrival gate/terminal." Quatro providers do provider race público montavam o campo
// público `gate`/`terminal` caindo para o valor de chegada quando o de partida estava
// ausente, expondo o portão/terminal de CHEGADA como se fosse o de embarque.
const forbiddenPatterns = [
  'firstKnown(row.gate_origin, row.gate_destination, row.departure_gate, row.arrival_gate)',
  'firstKnown(row.terminal_origin, row.terminal_destination, row.departure_terminal, row.arrival_terminal)',
  'firstKnown(row.departure?.gate, row.arrival?.gate)',
  'firstKnown(row.departure?.terminal, row.arrival?.terminal)',
  'firstKnown(row.dep_gate, row.arr_gate)',
  'firstKnown(row.dep_terminal, row.arr_terminal)',
];

for (const pattern of forbiddenPatterns) {
  assert.equal(
    serverSource.includes(pattern),
    false,
    `padrão de fallback de portão/terminal de chegada ainda presente: ${pattern}`,
  );
}

const requiredPatterns = [
  'gate: firstKnown(row.gate_origin, row.departure_gate)',
  'terminal: firstKnown(row.terminal_origin, row.departure_terminal)',
  'gate: firstKnown(row.dep_gate)',
  'terminal: firstKnown(row.dep_terminal)',
];

for (const pattern of requiredPatterns) {
  assert.equal(
    serverSource.includes(pattern),
    true,
    `provider deve montar o portão/terminal de partida sem fallback de chegada: ${pattern}`,
  );
}

// providerAviationstack e providerAeroDataBox compartilham o mesmo padrão de origem
// (`row.departure?.gate`/`row.departure?.terminal`); contamos as ocorrências para
// garantir que ambos os providers foram corrigidos, não apenas um deles.
const departureGateOccurrences = serverSource.split('gate: firstKnown(row.departure?.gate)').length - 1;
const departureTerminalOccurrences = serverSource.split('terminal: firstKnown(row.departure?.terminal)').length - 1;
assert.equal(departureGateOccurrences, 2, 'providerAviationstack e providerAeroDataBox devem montar gate sem fallback de chegada');
assert.equal(departureTerminalOccurrences, 2, 'providerAviationstack e providerAeroDataBox devem montar terminal sem fallback de chegada');

console.log('Radar departure-gate arrival-fallback regression: ok');
