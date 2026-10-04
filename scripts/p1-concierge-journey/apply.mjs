import fs from 'node:fs';
import { prepareConciergeCanonicalBridge } from './bridge.mjs';

prepareConciergeCanonicalBridge();
const file = 'server.mjs';
let source = fs.readFileSync(file, 'utf8');
const importLine = "import { conciergeNextJourneyProgram, conciergeJourneyProgramRecords, conciergeJourneyEndText } from './server/concierge/journey-programs.mjs';";
if (!source.includes(importLine)) source = `${importLine}\n${source}`;
function patchFunction(name, transform, required = true) {
  const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
  if (!match) {
    if (!required) return;
    throw new Error(`[concierge-journey] missing ${name}`);
  }
  const start = match.index;
  const end = source.indexOf('\n}', start) + 2;
  if (end <= start) throw new Error(`[concierge-journey] unclosed ${name}`);
  const before = source.slice(start, end);
  source = `${source.slice(0, start)}${transform(before)}${source.slice(end)}`;
}
const nextBefore = 'const next = conciergeNextProgram(roster);';
const nextAfter = 'const next = conciergeNextJourneyProgram(roster, conciergeProgramRecords(roster));';
for (const name of ['conciergeScheduleReply', 'conciergePremiumScheduleReply']) {
  patchFunction(name, (body) => {
    if (!body.includes(nextBefore) && !body.includes(nextAfter)) throw new Error(`[concierge-journey] missing next selection in ${name}`);
    return body.replaceAll(nextBefore, nextAfter);
  });
}
patchFunction('conciergeRegulationReply', (body) => {
  const before = 'const records = conciergeProgramRecords(roster).filter(';
  const after = 'const records = conciergeJourneyProgramRecords(roster, conciergeProgramRecords(roster)).filter(';
  if (!body.includes(before) && !body.includes(after)) throw new Error('[concierge-journey] missing regulation selection');
  body = body.replace(before, after);
  body = body.replace('`Fim da jornada: ${result.dutyEndTime} (30 min após o corte)`,', '`Fim limite calculado: ${result.dutyEndTime} (30 min após o corte)`,\n      conciergeJourneyEndText(record),');
  return body;
});
patchFunction('conciergeFormatProgram', (body) => body.replace(
  " · término ${record.endTime || 'a confirmar'}",
  " · ${record.endKind === 'arrival' ? 'última chegada (fim da jornada não confirmado)' : 'término'} ${record.endTime || 'a confirmar'}",
));
fs.writeFileSync(file, source);
console.log('[concierge-journey] schedule and regulation consume existing canonical journey identities; formulas unchanged.');
