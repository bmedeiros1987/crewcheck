import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requireHomeRegulationMarker } from '../v1392/home-regulation-marker.mjs';

const legacyImport = "import ManualRegulationView from '@/components/v1392/ManualRegulationView';";
const preparedImport = "import ManualRegulationView, { regulationForScheduleDay } from '@/components/v1432/ManualRegulationView';";
const tourImport = "import FirstAccessTour from '@/components/v1432/FirstAccessTour';";
const legacyRoute = "    {view === 'regulation' && <ManualRegulationView compliance={compliance}/>}";
const preparedRoute = "    {view === 'regulation' && <ManualRegulationView compliance={compliance} scheduleDay={event?.day}/>}";
const raw = `${legacyImport}\ntype ZeroView = 'regulation';\nexport default function Home() {\n  return <main>\n${legacyRoute}\n  </main>;\n}\n`;
const prepared = raw.replace(legacyImport, `${preparedImport}\n${tourImport}`).replace(legacyRoute, preparedRoute);
const fails = source => assert.throws(() => requireHomeRegulationMarker(source), /v13\.9\.2: marcador ausente/);

test('legacy and v1432 producer forms are read-only and repeat without byte changes', () => {
  for (const source of [raw, prepared]) {
    assert.equal(requireHomeRegulationMarker(source), source);
    assert.equal(requireHomeRegulationMarker(requireHomeRegulationMarker(source)), source);
  }
});

test('tracked or fully prepared Home keeps its exact bytes', () => {
  const source = readFileSync(new URL('../../client/src/pages/Home.tsx', import.meta.url), 'utf8');
  assert.equal(requireHomeRegulationMarker(source), source);
});

test('the compatibility contract matches the existing v1432 producer', () => {
  const source = readFileSync(new URL('../v1432/apply.mjs', import.meta.url), 'utf8');
  for (const marker of [legacyImport, preparedImport, tourImport, legacyRoute.trim(), preparedRoute.trim()]) {
    assert.ok(source.includes(marker), marker);
  }
});

test('unrelated imports, formatting outside the contract and UI edits need no pinned hash', () => {
  const source = "import Unrelated from '@/unrelated';\n" + prepared.replace('<main>', '<main className="unrelated-change">');
  assert.equal(requireHomeRegulationMarker(source), source);
});

test('type-only named imports are normalized only for parse-only inspection', () => {
  const source = "import { useState, type FormEvent, type ChangeEvent } from 'react';\n" + prepared;
  assert.equal(requireHomeRegulationMarker(source), source);
});

test('inspection never resolves imports or executes Home code or inherited preload options', () => {
  const previous = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--require /crewcheck-deliberately-missing-preload.cjs';
  try {
    const source = "import Missing from 'crewcheck-deliberately-missing-module';\n" + prepared + "throw new Error('Do not execute Home');\n";
    assert.equal(requireHomeRegulationMarker(source), source);
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
  }
});

test('missing and unknown component imports still fail closed', () => {
  fails(prepared.replace(preparedImport, ''));
  fails(prepared.replace('/v1432/', '/v9999/'));
  fails(prepared.replace('ManualRegulationView, { regulationForScheduleDay }', 'OtherView, { regulationForScheduleDay }'));
  fails(prepared.replace(', { regulationForScheduleDay }', ''));
  fails('');
});

test('incomplete or stale v1432 wiring is rejected', () => {
  fails(prepared.replace(tourImport, ''));
  fails(prepared.replace(preparedRoute, legacyRoute));
  fails(prepared.replace(preparedRoute, ''));
  fails(prepared.replace('scheduleDay={event?.day}', 'scheduleDay={otherDay}'));
  fails(prepared + legacyRoute + '\n');
});

test('mixed, duplicate or malformed imports are rejected', () => {
  fails(legacyImport + '\n' + prepared);
  fails(preparedImport + '\n' + prepared);
  fails(prepared.replace('{ regulationForScheduleDay }', '{ regulationForScheduleDay'));
  fails(prepared.replace('from', 'fro'));
  fails('const =;\n' + prepared);
});

test('malformed non-import source is not repaired by inline type normalization', () => {
  fails('const x = { type ChangeEvent };\n' + prepared);
});

test('component imports inside comments, strings and template literals are not evidence', () => {
  for (const declaration of [preparedImport, tourImport]) {
    fails(prepared.replace(declaration, `/* ${declaration} */`));
    fails(prepared.replace(declaration, `// ${declaration}`));
    fails(prepared.replace(declaration, `const decoy = ${JSON.stringify(declaration)};`));
    fails(prepared.replace(declaration, 'const decoy = `\n' + declaration + '\n`;'));
  }
  fails('/*\n' + prepared + '\n*/');
  fails('const decoy = `\n' + prepared + '\n`;');
});

test('nested imports and malformed or absent import boundaries fail closed', () => {
  fails(prepared.replace(preparedImport, `function nested() {\n${preparedImport}\n}`));
  fails(prepared.replace('\ntype ZeroView =', '\n// type ZeroView ='));
  fails(prepared.replace(tourImport, '/*\n' + tourImport));
});

test('duplicate route sentinels fail instead of treating a stale copy as prepared', () => {
  fails(prepared + preparedRoute + '\n');
  fails(raw + legacyRoute + '\n');
});
