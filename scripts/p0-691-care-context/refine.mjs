import fs from 'node:fs';

const TAG = '[p0-691-care-refine]';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`${TAG} arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function write(path, source) { fs.writeFileSync(path, source, 'utf8'); }
function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} âncora ausente: ${label}`);
  return source.replace(before, after);
}
function replaceOptional(source, before, after) {
  if (source.includes(after) || !source.includes(before)) return source;
  return source.replace(before, after);
}

function patchTimeline(path) {
  let source = read(path);
  source = replaceRequired(
    source,
    `  classifyScheduleActivity,\n  isFlightScheduleActivity,`,
    `  carePresentationForScheduleActivity,\n  classifyScheduleActivity,\n  isFlightScheduleActivity,`,
    `${path}: import care presentation`,
  );
  const oldRestCopy = `function restCopy(event: RosterEvent): { title: string; detail: string } {\n  if (classifyScheduleActivity(event) === 'REPOUSO') {\n    return { title: 'Repouso', detail: 'Período de recuperação programado' };\n  }\n  return { title: 'Folga', detail: 'Descanso programado' };\n}`;
  const newRestCopy = `function restCopy(event: RosterEvent): { eyebrow: string; title: string; detail: string } {\n  const care = carePresentationForScheduleActivity(event);\n  if (care?.state === 'LUTO') return { eyebrow: 'Cuidado', title: 'Luto', detail: 'CrewCheck em modo discreto' };\n  if (care?.state === 'FERIAS') return { eyebrow: 'Pausa', title: 'Férias', detail: 'Sem programação operacional' };\n  if (care?.state === 'FOLGA') return { eyebrow: 'Pausa', title: 'Folga', detail: 'Sem programação operacional' };\n  if (care?.state === 'REPOUSO' || classifyScheduleActivity(event) === 'REPOUSO') {\n    return { eyebrow: 'Descanso', title: 'Repouso', detail: 'Período de recuperação programado' };\n  }\n  return { eyebrow: 'Pausa', title: 'Folga', detail: 'Sem programação operacional' };\n}`;
  source = replaceRequired(source, oldRestCopy, newRestCopy, `${path}: care-aware restCopy`);
  source = replaceRequired(
    source,
    `        eyebrow: 'Descanso',\n        title: copy.title,`,
    `        eyebrow: copy.eyebrow,\n        title: copy.title,`,
    `${path}: timeline eyebrow`,
  );
  write(path, source);
}

patchTimeline('client/src/components/v14349/OperationalDayTimeline.tsx');
patchTimeline('scripts/v14357/OperationalDayTimeline.tsx');

// The conversational personality may be playful on normal days, but grief must
// suppress Easter Eggs automatically. Keep the historical Easter Egg call itself
// intact so the existing compatibility regression still proves the feature is wired.
const oldEasterEgg = `  snapshot = identity.snapshot || snapshot;\n  const easterEgg = conciergeEasterEggReply(value, profile, snapshot);\n  if (easterEgg) return easterEgg;`;
const newEasterEgg = `  snapshot = identity.snapshot || snapshot;\n  const currentCareDay = conciergeDayForKey(snapshot?.roster || {}, conciergeDateKey(new Date()));\n  const currentCare = typeof conciergeCarePresentation === 'function' ? conciergeCarePresentation(currentCareDay) : null;\n  const easterEgg = conciergeEasterEggReply(value, profile, snapshot);\n  if (easterEgg && !currentCare?.suppressHumor) return easterEgg;`;

let replySnippet = read('server/v1403/build-reply.snippet');
replySnippet = replaceRequired(replySnippet, oldEasterEgg, newEasterEgg, 'build-reply grief humor suppression');
write('server/v1403/build-reply.snippet', replySnippet);

// server.mjs may not contain the v1403 generated reply before full preparation.
// When it does (prepared workspace), keep the runtime aligned with the snippet.
const serverPath = 'server.mjs';
let server = read(serverPath);
server = replaceOptional(server, oldEasterEgg, newEasterEgg);

// The legacy parser can intentionally emit type=DO while preserving a more
// precise published day-off code in pairingCode (VC/OFF/DOP, etc). Only those
// known published care/day-off codes may specialize the coarse DO wrapper.
// An unrelated residual pairingCode (for example ASB) must not erase the formal
// DO signal and fall through to roster-empty/reimport semantics.
const oldServerPairing = `  if (type === 'DO' && pairing) return pairing;\n  return type && type !== 'OTHER' ? type : (pairing || type);`;
const newServerPairing = `  const publishedDayOff = new Set(['DMO', 'VC', 'FERIAS', 'DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA']);\n  if (type === 'DO' && publishedDayOff.has(pairing)) return pairing;\n  return type && type !== 'OTHER' ? type : (pairing || type);`;
server = replaceRequired(server, oldServerPairing, newServerPairing, 'server DO pairing allowlist');

// Care NONE alone is insufficient: the legacy inactive filter also reads code.
// Keep published ASB/HSB/EAD duties operational with their own mobility identity,
// even when a weaker pairing carries a care label. Preserve flight pairings.
const oldProgramIdentity = `function conciergeProgramRecords(roster = {}) {\n  const records = [];\n  for (const day of Array.isArray(roster.days) ? roster.days : []) {\n    const legs = Array.isArray(day?.legs) ? day.legs : [];\n    const code = String(day?.pairingCode || day?.type || '').trim().toUpperCase();`;
const newProgramIdentity = `function conciergeProgramRecords(roster = {}) {\n  const records = [];\n  for (const day of Array.isArray(roster.days) ? roster.days : []) {\n    const legs = Array.isArray(day?.legs) ? day.legs : [];\n    const formalCode = String(day?.type || '').trim().toUpperCase();\n    const code = ['ASB', 'HSB', 'EAD'].includes(formalCode)\n      ? formalCode\n      : String(day?.pairingCode || day?.type || '').trim().toUpperCase();`;
server = replaceRequired(server, oldProgramIdentity, newProgramIdentity, 'formal Concierge duty survives residual care pairing');
write(serverPath, server);

const humanPath = 'server/v1403/telegram-human.mjs';
let human = read(humanPath);
const oldHumanPairing = `  const code = type === 'DO' && pairing ? pairing : (type && type !== 'OTHER' ? type : (pairing || type));`;
const newHumanPairing = `  const publishedDayOff = new Set(['DMO', 'VC', 'FERIAS', 'DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA']);\n  const code = type === 'DO' && publishedDayOff.has(pairing) ? pairing : (type && type !== 'OTHER' ? type : (pairing || type));`;
human = replaceRequired(human, oldHumanPairing, newHumanPairing, 'human DO pairing allowlist');
write(humanPath, human);

// A care-state result of NONE must not be undone by the operational classifier's
// older label fallback. Preserve a formal operational kind after formal care
// and rest checks, before consulting weaker pairing/title evidence.
const classificationPath = 'client/src/lib/scheduleActivityClassification.ts';
let classification = read(classificationPath);
classification = replaceRequired(
  classification,
  `  const coarseDayOff = [...formalTokens].some((token) => ['DO', 'FOLGA'].includes(token));`,
  `  const coarseDayOff = [...formalTokens].some((token) => token === 'DO');`,
  'only coarse DO may be specialized by residual care pairing',
);
const oldOperationalFallback = `  // Sem código formal conclusivo, rótulo e pairingCode entram como fallback.\n  if (hasCode(activity, RECOVERY_REST_CODES)) return 'REPOUSO';`;
const newOperationalFallback = `  // Formal operational identity cannot be erased by a residual care label.\n  const formalKind = normalize(activity.canonical?.kind || activity.kind);\n  if (formalCodeValues(activity).length > 0\n    && ['FLIGHT', 'DUTY', 'RESERVE', 'STANDBY', 'ACTIVITY', 'GROUND'].includes(formalKind)) {\n    return 'PROGRAMACAO';\n  }\n\n  // Sem código formal conclusivo, rótulo e pairingCode entram como fallback.\n  if (hasCode(activity, RECOVERY_REST_CODES)) return 'REPOUSO';`;
classification = replaceRequired(classification, oldOperationalFallback, newOperationalFallback, 'formal operation survives residual care labels');

// Pairing-based care was already resolved from published evidence. A remaining
// title/flightNumber fallback may describe ordinary rest but cannot infer a
// sensitive grief/vacation state when the published code is missing.
const oldCareFallback = `  if (pairingSensitiveState !== 'NONE') return pairingSensitiveState;\n  return resolveCareState(tokensOfValues(fallbackCodeValues(activity)));`;
const newCareFallback = `  if (pairingSensitiveState !== 'NONE') return pairingSensitiveState;\n  const fallbackState = resolveCareState(tokensOfValues(fallbackCodeValues(activity)));\n  return fallbackState === 'LUTO' || fallbackState === 'FERIAS' ? 'NONE' : fallbackState;`;
classification = replaceRequired(classification, oldCareFallback, newCareFallback, 'sensitive care requires published evidence');
write(classificationPath, classification);

// Home/Roster must use the same authority hierarchy as the shared classifier
// and Concierge. A residual pairing code may specialize only the parser's
// intentionally coarse DO wrapper. Explicit operational, care, day-off and
// recovery identities remain authoritative and cannot be relabelled by residue.
const homePath = 'client/src/pages/Home.tsx';
let home = read(homePath);
const oldHomeRosterCode = `function rosterCode(day?: RosterDay): string {\n  return String((day as any)?.pairingCode || (day as any)?.type || '').trim().toUpperCase();\n}`;
const newHomeRosterCode = `function rosterCode(day?: RosterDay): string {\n  const type = String((day as any)?.type || '').trim().toUpperCase();\n  const pairing = String((day as any)?.pairingCode || '').trim().toUpperCase();\n  const formalIdentity = new Set([\n    'ASB', 'HSB', 'EAD',\n    'DMO', 'VC', 'FERIAS', 'FÉRIAS',\n    'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA',\n    'REST', 'REPOUSO', 'DESCANSO', 'DESCANSO_REGULAMENTAR',\n  ]);\n  if (formalIdentity.has(type)) return type;\n  const publishedDayOff = new Set(['DMO', 'VC', 'FERIAS', 'FÉRIAS', 'DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA']);\n  if (type === 'DO') return publishedDayOff.has(pairing) ? pairing : type;\n  return pairing || type;\n}`;
home = replaceRequired(home, oldHomeRosterCode, newHomeRosterCode, 'Home formal duty survives residual care pairing');
write(homePath, home);

console.log(`${TAG} aplicado com sucesso.`);
