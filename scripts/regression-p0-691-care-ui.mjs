import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = (path) => fs.readFileSync(path, 'utf8');

function assertTimeline(source, label) {
  assert.match(source, /carePresentationForScheduleActivity/, `${label}: timeline must consume shared care presentation`);
  assert.match(source, /state === 'LUTO'[\s\S]*?title: 'Luto'[\s\S]*?modo discreto/, `${label}: luto must be visible and discreet`);
  assert.match(source, /state === 'FERIAS'[\s\S]*?title: 'Férias'[\s\S]*?Sem programação operacional/, `${label}: vacation must be visibly distinct from day off`);
  assert.match(source, /state === 'FOLGA'[\s\S]*?title: 'Folga'/, `${label}: day off must remain explicit`);
  assert.match(source, /state === 'REPOUSO'[\s\S]*?title: 'Repouso'/, `${label}: recovery rest must remain distinct`);
  assert.match(source, /eyebrow: copy\.eyebrow/, `${label}: care-specific eyebrow must reach rendered timeline item`);
}

function extractPreparedFunctions(text, names, label) {
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile(`${label}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      assert.equal(declarations.has(node.name.text), false, `${label}: duplicate function ${node.name.text}`);
      declarations.set(node.name.text, node.getText(source));
    }
  }
  for (const name of names) assert.ok(declarations.has(name), `${label}: missing function ${name}`);
  const compiled = ts.transpileModule(names.map((name) => declarations.get(name)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  return new vm.Script(`${compiled}\n({ ${names.join(', ')} });`, { filename: `${label}-runtime.js` })
    .runInNewContext({ String }, { timeout: 5000 });
}

function assertPreparedHomeRosterIdentity(home) {
  const runtime = extractPreparedFunctions(home, ['rosterCode', 'rosterCodeLabel'], 'prepared-home-roster-labels');

  // The same formal-code authority already enforced in Care classification and
  // Concierge must reach the visible Home/Roster label. Otherwise a real ASB,
  // HSB or EAD with stale residual pairingCode=VC/DMO can remain operational in
  // selectors while being shown to the crew as the sensitive state Férias/Luto.
  let combinations = 0;
  for (const type of ['ASB', 'HSB', 'EAD']) {
    for (const pairingCode of ['DMO', 'VC', 'FERIAS', 'FÉRIAS', 'DO', 'DR', 'REST']) {
      const code = runtime.rosterCode({ type, pairingCode });
      assert.equal(code, type, `${type} + residual ${pairingCode}: Home visible code must preserve formal operational identity`);
      assert.doesNotMatch(runtime.rosterCodeLabel(code), /^(?:Luto|Férias)$/i, `${type} + residual ${pairingCode}: Home must not display a sensitive care label`);
      combinations += 1;
    }
  }

  // Keep the one intentional exception: the parser may publish coarse type=DO
  // while pairingCode carries the exact day-off meaning. Known care/day-off
  // pairings can specialize DO; unrelated operational residue cannot erase it.
  assert.equal(runtime.rosterCode({ type: 'DO', pairingCode: 'VC' }), 'VC', 'coarse DO + published VC must still display Férias');
  assert.equal(runtime.rosterCodeLabel('VC'), 'Férias', 'VC display label must remain Férias');
  assert.equal(runtime.rosterCode({ type: 'DO', pairingCode: 'ASB' }), 'DO', 'coarse DO + unrelated ASB residue must remain Folga');
  assert.equal(runtime.rosterCodeLabel('DO'), 'Folga', 'formal DO display label must remain Folga');

  console.log(`OK prepared Home roster identity: ${combinations} formal-duty/residual-care combinations + coarse DO authority`);
}

assertTimeline(read('client/src/components/v14349/OperationalDayTimeline.tsx'), 'client timeline');
assertTimeline(read('scripts/v14357/OperationalDayTimeline.tsx'), 'v14357 authoritative timeline');

const replySnippet = read('server/v1403/build-reply.snippet');
assert.match(replySnippet, /currentCareDay[\s\S]*?conciergeCarePresentation/, 'Concierge must inspect current published care context before personality/humor');
assert.match(replySnippet, /const easterEgg = conciergeEasterEggReply\(value, profile, snapshot\);/, 'existing Easter Egg call remains wired for normal days');
assert.match(replySnippet, /easterEgg && !currentCare\?\.suppressHumor/, 'grief must suppress Easter Egg/humor while normal days keep it');

const apply = read('scripts/p0-691-care-context/apply.mjs');
assert.match(apply, /await import\('\.\/refine\.mjs'\)/, 'Care materializer must include UI/Concierge refinement');
const refine = read('scripts/p0-691-care-context/refine.mjs');
assert.match(refine, /patchTimeline\('client\/src\/components\/v14349\/OperationalDayTimeline\.tsx'\)/, 'refinement must patch the shipped timeline');
assert.match(refine, /patchTimeline\('scripts\/v14357\/OperationalDayTimeline\.tsx'\)/, 'refinement must patch authoritative prepared timeline source');
assert.doesNotMatch(refine, /rosterParser|aimsParser|complianceEngine/, 'UI/humor refinement must not touch protected engines');

function assertPreparedConciergeOperations(server) {
  // Extract complete declarations from the actual prepared runtime. Never import
  // server.mjs: that would start HTTP/DB/notification side effects in a QA job.
  const ts = createRequire(import.meta.url)('typescript');
  const source = ts.createSourceFile('server.mjs', server, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = [
    'conciergeCareCode', 'conciergeCareState', 'conciergeRosterDayParts',
    'conciergeTime', 'conciergeProgramDate', 'conciergeProgramRecords',
    'conciergeNextProgram', 'conciergeInactiveCodes', 'conciergeRemoteCodes',
  ];
  const declarations = new Map();
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
      assert.equal(declarations.has(node.name.text), false, `duplicate runtime function: ${node.name.text}`);
      declarations.set(node.name.text, node.getText(source));
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)) {
          assert.equal(declarations.has(declaration.name.text), false, `duplicate runtime constant: ${declaration.name.text}`);
          declarations.set(declaration.name.text, `const ${declaration.getText(source)};`);
        }
      }
    }
  }
  for (const name of names) assert.ok(declarations.has(name), `prepared runtime declaration missing: ${name}`);
  const runtime = new vm.Script(`${names.map((name) => declarations.get(name)).join('\n')}\n({
    care: conciergeCareState, records: conciergeProgramRecords,
    next: conciergeNextProgram, remote: conciergeRemoteCodes,
  });`, { filename: 'care-prepared-server-runtime.mjs' }).runInNewContext({ Date, Intl }, { timeout: 5000 });
  const now = new Date('2026-09-18T08:00:00-03:00');
  const day = (type, pairingCode = type) => ({
    date: '18/09/2026', type, pairingCode, legs: [],
    dutyReport: '09:00', dutyDebrief: '14:00',
  });

  // careState=NONE is necessary, not sufficient. A second pairing-first filter
  // must not silently remove formal duties or corrupt their remote/presential code.
  let combinations = 0;
  for (const [type, remote] of [['ASB', false], ['HSB', true], ['EAD', true]]) {
    for (const pairing of ['DMO', 'VC', 'FERIAS', 'FÉRIAS', 'DO', 'DOF', 'OFF', 'DR', 'REST', 'REPOUSO', 'DESCANSO']) {
      const roster = { days: [day(type, pairing)] };
      const before = JSON.stringify(roster);
      const label = `${type} + residual ${pairing}`;
      assert.equal(runtime.care(roster.days[0]), 'NONE', `${label}: no sensitive care state`);
      const records = runtime.records(roster);
      assert.equal(records.length, 1, `${label}: prepared Concierge must retain formal operational programming`);
      assert.equal(records[0].code, type, `${label}: published formal code must reach consumers`);
      assert.equal(runtime.next(roster, now)?.day, roster.days[0], `${label}: real next programming remains selectable`);
      assert.equal(runtime.remote.has(records[0].code), remote, `${label}: preserve remote/presential mobility classification`);
      assert.equal(records[0].start.toISOString(), '2026-09-18T12:00:00.000Z', `${label}: preserve published presentation`);
      assert.equal(records[0].end.toISOString(), '2026-09-18T17:00:00.000Z', `${label}: preserve published end`);
      assert.equal(JSON.stringify(roster), before, `${label}: do not mutate canonical input`);
      combinations += 1;
    }
  }

  const laterFlight = {
    date: '19/09/2026', type: 'FLIGHT', pairingCode: 'PAIR_SYNTHETIC',
    dutyReport: '09:25', dutyDebrief: '13:00',
    legs: [{ flightNumber: 'LA9001', origin: 'BSB', destination: 'GRU', departureTime: '10:25', arrivalTime: '12:00' }],
  };
  for (const [type, pairing, state] of [
    ['DMO', 'DMO', 'LUTO'], ['VC', 'VC', 'FERIAS'],
    ['FERIAS', 'FERIAS', 'FERIAS'], ['FÉRIAS', 'FÉRIAS', 'FERIAS'],
    ['DO', 'VC', 'FERIAS'], ['DO', 'ASB', 'FOLGA'],
    ['DO', 'DO', 'FOLGA'], ['DOF', 'DOF', 'FOLGA'],
    ['OFF', 'OFF', 'FOLGA'], ['DR', 'DR', 'FOLGA'],
    ['REST', 'REST', 'REPOUSO'],
  ]) {
    const careDay = day(type, pairing);
    assert.equal(runtime.care(careDay), state, `${type}/${pairing}: preserve published care state`);
    assert.equal(runtime.records({ days: [careDay] }).length, 0, `${type}/${pairing}: care never becomes operational`);
    const next = runtime.next({ days: [careDay, laterFlight] }, now);
    assert.equal(next?.day, laterFlight, `${type}/${pairing}: later real operation must not be hidden`);
    assert.equal(next.startTime, '09:25', `${type}/${pairing}: never replace published APZ with departure`);
    assert.equal(next.code, 'PAIR_SYNTHETIC', 'ordinary flight pairing identity remains unchanged');
  }
  console.log(`OK prepared Concierge: ${combinations} formal-duty/residual-care combinations + 11 care/next-flight cases`);
}

if (process.env.CHECK_PREPARED === '1') {
  const server = read('server.mjs');
  assertPreparedConciergeOperations(server);
  const home = read('client/src/pages/Home.tsx');
  assertPreparedHomeRosterIdentity(home);
  assert.match(server, /currentCareDay[\s\S]*?conciergeCarePresentation/, 'prepared runtime must carry grief humor guard');
  assert.match(server, /const easterEgg = conciergeEasterEggReply\(value, profile, snapshot\);/, 'prepared runtime must preserve normal Easter Egg wiring');
  assert.match(server, /easterEgg && !currentCare\?\.suppressHumor/, 'prepared runtime must suppress humor only when care context says so');
}

console.log(`OK regression-p0-691-care-ui${process.env.CHECK_PREPARED === '1' ? ' (prepared)' : ' (source)'}`);
