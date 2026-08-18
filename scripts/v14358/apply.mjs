import fs from 'node:fs';

const file = 'client/src/lib/canonicalRoster.ts';
if (!fs.existsSync(file)) throw new Error(`[v14.3.58] Arquivo não encontrado: ${file}`);

let source = fs.readFileSync(file, 'utf8');
const marker = 'function reconcileCompetingFlightActivities(days: RosterDay[]): RosterDay[] {';

if (!source.includes(marker)) {
  const insertionPoint = 'export function normalizeRosterDays(roster: CrewRoster): CrewRoster {';
  if (!source.includes(insertionPoint)) throw new Error('[v14.3.58] Âncora de normalizeRosterDays não encontrada.');

  const helper = `function activityAbsoluteInterval(day: RosterDay): { start: number; end: number } | null {
  const legs = sortLegs(day.legs || []);
  if (!legs.length) return null;
  const first = minutes(legs[0].departureTime);
  const last = minutes(legs[legs.length - 1].arrivalTime);
  if (first == null || last == null) return null;
  let end = last;
  if (end < first || legs.some((leg) => legCrossesNextDay(leg))) end += 1440;
  return { start: first, end };
}

function activityIntervalsOverlap(a: RosterDay, b: RosterDay): boolean {
  const left = activityAbsoluteInterval(a);
  const right = activityAbsoluteInterval(b);
  if (!left || !right) return false;
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

function samePublishedPresentation(a: RosterDay, b: RosterDay): boolean {
  const left = normalizeTime(a.dutyReport);
  const right = normalizeTime(b.dutyReport);
  return Boolean(left && right && left === right);
}

function reconcileCompetingFlightActivities(days: RosterDay[]): RosterDay[] {
  const byDate = new Map<string, RosterDay[]>();
  for (const day of days) {
    if (!(day.legs || []).length) continue;
    const group = byDate.get(day.date) || [];
    group.push(day);
    byDate.set(day.date, group);
  }

  const rejected = new Set<RosterDay>();
  for (const activities of byDate.values()) {
    if (activities.length < 2) continue;

    const hasImpossibleCompetition = activities.some((left, index) => activities
      .slice(index + 1)
      .some((right) => activityIntervalsOverlap(left, right) || samePublishedPresentation(left, right)));
    if (!hasImpossibleCompetition) continue;

    const allLegs = activities.flatMap((day) => day.legs || []);
    const selected = selectPhysicalLegSequence(allLegs);
    if (selected.length < 2 || selected.length >= dedupeSimilarLegs(allLegs).length) continue;

    const selectedSignatures = new Set(selected.map(legSignature));
    for (const day of activities) {
      const kept = (day.legs || []).filter((leg) => selectedSignatures.has(legSignature(leg)));
      if (!kept.length) {
        rejected.add(day);
        continue;
      }
      day.legs = sortLegs(kept);
      day.isNextDay = Boolean(day.isNextDay || day.legs.some((leg) => legCrossesNextDay(leg)));
    }
  }

  return days.filter((day) => !rejected.has(day));
}

`;
  source = source.replace(insertionPoint, `${helper}${insertionPoint}`);
}

const oldBlock = `  const collectedDays = Array.from(byActivity.values())
    .map((day) => ({ ...day, legs: selectPhysicalLegSequence(sortLegs(day.legs || [], day.dutyReport)) }))
    .sort((a, b) => dateAt(a, '00:00', 0).getTime() - dateAt(b, '00:00', 0).getTime());`;
const newBlock = `  const collectedDays = reconcileCompetingFlightActivities(Array.from(byActivity.values())
    .map((day) => ({ ...day, legs: selectPhysicalLegSequence(sortLegs(day.legs || [], day.dutyReport)) })))
    .sort((a, b) => dateAt(a, '00:00', 0).getTime() - dateAt(b, '00:00', 0).getTime());`;

if (source.includes(oldBlock)) source = source.replace(oldBlock, newBlock);
if (!source.includes(newBlock)) throw new Error('[v14.3.58] Reconciliação entre atividades concorrentes não foi conectada.');

fs.writeFileSync(file, source, 'utf8');
console.log('[crewcheck:prepare] v14.3.58 next-day roster contamination guard aplicado.');
