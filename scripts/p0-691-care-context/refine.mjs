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
write(serverPath, server);

console.log(`${TAG} aplicado com sucesso.`);
