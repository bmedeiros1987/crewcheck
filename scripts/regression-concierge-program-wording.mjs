import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { conciergeFinalizeReplyV14354 as finalize } from '../server/v14354/concierge-language.mjs';
import { conciergeHumanizeReplyV14408 as humanize, conciergeVoiceScriptV14408 as voice } from '../server/v14408/concierge-human.mjs';

// Fictional flights and operational times, unrelated to any person's roster.
const record = { startTime: '22:15', endTime: '08:45', endKind: 'duty-debrief', legs: [
  { flightNumber: 'LA0012', origin: 'GRU', destination: 'NAT', departureTime: '23:10', arrivalTime: '02:25', gate: '999' },
  { flightNumber: 'LA0098', origin: 'NAT', destination: 'BSB', departureTime: '05:15', arrivalTime: '08:15' },
] };
const source = fs.readFileSync('server/v1404/telegram-language.mjs', 'utf8');
const generator = fs.readFileSync('scripts/v14314/apply.mjs', 'utf8');
const target = 'server/v1404/telegram-language.mjs';
// Execute the exact canonical generator's renderer update, without running unrelated
// historical app rewrites. Full-chain/build validation is a separate integration gate.
function prepare(input) {
  let output = input;
  const scoped = generator.slice(0, generator.indexOf("update('server/v1403/premium-helpers.snippet'"))
    .replace("import fs from 'node:fs';", '');
  assert.ok(scoped.includes("update('server/v1404/telegram-language.mjs'"));
  vm.runInNewContext(scoped, { fs: {
    existsSync: (p) => p === target,
    readFileSync: (p) => { assert.equal(p, target); return output; },
    writeFileSync: (p, value) => { assert.equal(p, target); output = value; },
  } });
  return output;
}
const prepared = prepare(source);
assert.equal(prepare(prepared), prepared, 'canonical renderer preparation is byte-idempotent');

for (const [stage, code] of [['raw', source], ['prepared', prepared]]) {
  const url = pathToFileURL(`${process.cwd()}/server/v1403/telegram-human.mjs`).href;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code.replaceAll('../v1403/telegram-human.mjs', url)).toString('base64')}`);
  const render = (value, options = {}) => humanize(finalize(module.buildProgramSummary({ record: value, label: 'A próxima programação', includeGreeting: false, ...options }), '/proximo'), '/proximo');
  const before = JSON.stringify(record);
  const text = render(record);
  for (const value of ['LA0012:', 'LA0098:', '22:15', '08:45', '23:10', '02:25', '05:15', '08:15', 'chegada em Natal', 'saída de Natal', 'Fim da jornada em Brasília', 'Se houver divergência, vale a escala oficial.']) assert.ok(text.includes(value), `${stage}: ${value}`);
  assert.doesNotMatch(text, /zero zero|você segue|Na primeira perna|Na perna 2|aeroporto|999|portão/);
  assert.equal(JSON.stringify(record), before, 'rendering does not mutate operational data');
  assert.equal(render(record, { radar: { flight: 'LA9999', gate: '888', origin: 'REC', destination: 'SSA' } }), text, 'ambiguous radar never supplies a gate');
  const spoken = module.premiumVoiceText(voice(text, '/proximo'));
  assert.match(spoken, /zero zero um dois/);
  assert.match(spoken, /zero zero nove oito/);
  assert.match(spoken, /vale a oficial|vale a escala oficial/);
  const arrivalOnly = render({ ...record, endKind: 'arrival', endTime: '08:15' });
  assert.match(arrivalOnly, /fim publicado da jornada não está confirmado/);
  assert.doesNotMatch(arrivalOnly, /fim da jornada em/);
  const unknown = render({ ...record, legs: [{ ...record.legs[0], flightNumber: 'XY0007', origin: 'ZZZ', destination: 'MCZ' }] });
  assert.match(unknown, /XY0007: saída de ZZZ/);
  assert.match(unknown, /chegada em Maceió/);
  assert.doesNotMatch(unknown, /aeroporto/);
  const missing = render({ ...record, legs: [{}] });
  assert.match(missing, /Voo 1 a confirmar/);
  assert.match(missing, /horário a confirmar/);
  const noLegs = render({ ...record, code: 'CRM', legs: [] });
  assert.match(noLegs, /22:15/); assert.match(noLegs, /08:45/);
  const repeated = render({ ...record, legs: [record.legs[0], record.legs[0]] });
  assert.equal((repeated.match(/LA0012:/g) || []).length, 2);
  console.log(`${stage}: ${text}`);

}
console.log('PASS raw/prepared wording matrix; real v14314 scoped preparation and repeat byte parity.');
