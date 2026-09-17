import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

function assertTimeline(source, label) {
  assert.match(source, /carePresentationForScheduleActivity/, `${label}: timeline must consume shared care presentation`);
  assert.match(source, /state === 'LUTO'[\s\S]*?title: 'Luto'[\s\S]*?modo discreto/, `${label}: luto must be visible and discreet`);
  assert.match(source, /state === 'FERIAS'[\s\S]*?title: 'Férias'[\s\S]*?Sem programação operacional/, `${label}: vacation must be visibly distinct from day off`);
  assert.match(source, /state === 'FOLGA'[\s\S]*?title: 'Folga'/, `${label}: day off must remain explicit`);
  assert.match(source, /state === 'REPOUSO'[\s\S]*?title: 'Repouso'/, `${label}: recovery rest must remain distinct`);
  assert.match(source, /eyebrow: copy\.eyebrow/, `${label}: care-specific eyebrow must reach rendered timeline item`);
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

if (process.env.CHECK_PREPARED === '1') {
  const server = read('server.mjs');
  assert.match(server, /currentCareDay[\s\S]*?conciergeCarePresentation/, 'prepared runtime must carry grief humor guard');
  assert.match(server, /const easterEgg = conciergeEasterEggReply\(value, profile, snapshot\);/, 'prepared runtime must preserve normal Easter Egg wiring');
  assert.match(server, /easterEgg && !currentCare\?\.suppressHumor/, 'prepared runtime must suppress humor only when care context says so');
}

console.log(`OK regression-p0-691-care-ui${process.env.CHECK_PREPARED === '1' ? ' (prepared)' : ' (source)'}`);
