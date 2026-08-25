import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('client/src/lib/crewLogistics.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const logistics = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

let passed = 0;
let failed = 0;
function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

const targets = [
  {
    id: 'arrival-duty',
    journeyId: 'J-ARRIVAL',
    pairingRef: 'PAIR-DEMO',
    stayRef: 'STAY-DEMO',
    direction: 'to-hotel',
    date: '2026-09-10',
    airport: 'AAA',
    hotel: 'Hotel Demo',
    referenceTime: '23:50',
  },
  {
    id: 'departure-duty',
    journeyId: 'J-DEPARTURE',
    pairingRef: 'PAIR-DEMO',
    stayRef: 'STAY-DEMO',
    direction: 'from-hotel',
    date: '2026-09-11',
    airport: 'AAA',
    hotel: 'Hotel Demo',
    referenceTime: '15:05',
  },
];

const facts = [
  {
    id: 'pickup-to-hotel',
    kind: 'pickup',
    source: 'mycrewcare',
    pairingRef: 'PAIR-DEMO',
    stayRef: 'STAY-DEMO',
    direction: 'to-hotel',
    date: '2026-09-11',
    airport: 'AAA',
    hotel: 'Hotel Demo',
    value: '00:25',
    transitMinutes: 20,
    provider: 'Transport Demo',
    observedAt: '2026-09-10T21:00:00Z',
    confidence: 'alta',
    provenance: 'published',
  },
  {
    id: 'pickup-from-hotel',
    kind: 'pickup',
    source: 'mycrewcare',
    pairingRef: 'PAIR-DEMO',
    stayRef: 'STAY-DEMO',
    direction: 'from-hotel',
    date: '2026-09-11',
    airport: 'AAA',
    hotel: 'Hotel Demo',
    value: '13:55',
    transitMinutes: 60,
    provider: 'Transport Demo',
    observedAt: '2026-09-10T21:00:00Z',
    confidence: 'alta',
    provenance: 'published',
  },
  {
    id: 'aims-presentation',
    kind: 'presentation',
    source: 'aims',
    journeyId: 'J-DEPARTURE',
    date: '2026-09-11',
    airport: 'AAA',
    value: '15:05',
    observedAt: '2026-09-10T18:00:00Z',
    confidence: 'alta',
    provenance: 'published',
  },
  {
    id: 'external-presentation',
    kind: 'presentation',
    source: 'mycrewcare',
    journeyId: 'J-DEPARTURE',
    date: '2026-09-11',
    airport: 'AAA',
    value: '14:45',
    observedAt: '2026-09-10T21:00:00Z',
    confidence: 'alta',
    provenance: 'published',
  },
];

const result = logistics.reconcileCrewLogisticsFacts(targets, facts);
const arrival = result.resolutions.find((item) => item.targetId === 'arrival-duty');
const departure = result.resolutions.find((item) => item.targetId === 'departure-duty');

check('TO_HOTEL atravessando meia-noite casa com jornada de chegada', arrival?.pickup?.factId === 'pickup-to-hotel');
check('TO_HOTEL preserva direção', arrival?.pickup?.direction === 'to-hotel');
check('TO_HOTEL preserva transitMinutes', arrival?.pickup?.transitMinutes === 20);
check('FROM_HOTEL casa com jornada de saída', departure?.pickup?.factId === 'pickup-from-hotel');
check('FROM_HOTEL preserva direção', departure?.pickup?.direction === 'from-hotel');
check('FROM_HOTEL preserva transitMinutes', departure?.pickup?.transitMinutes === 60);
check('pickup e apresentação permanecem campos distintos', departure?.pickup?.value === '13:55' && departure?.presentation?.value === '15:05');
check('AIMS publicado prevalece sobre apresentação externa', departure?.presentation?.source === 'aims');

const wrongDirectionScore = logistics.scoreCrewLogisticsMatch(facts[0], targets[1]);
check('TO_HOTEL nunca casa com target FROM_HOTEL', wrongDirectionScore === 0);

const ambiguousFact = {
  id: 'ambiguous',
  kind: 'pickup',
  source: 'mycrewcare',
  date: '2026-09-11',
  airport: 'AAA',
  value: '12:00',
  observedAt: '2026-09-10T21:00:00Z',
  confidence: 'media',
  provenance: 'published',
};
const ambiguousTargets = [
  { id: 'a', date: '2026-09-11', airport: 'AAA', referenceTime: '12:10' },
  { id: 'b', date: '2026-09-11', airport: 'AAA', referenceTime: '12:20' },
];
const ambiguousMatch = logistics.matchCrewLogisticsFact(ambiguousFact, ambiguousTargets);
check('duas jornadas equivalentes falham fechado', ambiguousMatch.targetId === null && ambiguousMatch.ambiguous === true);

console.log(`\n#571 logistics contract: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
