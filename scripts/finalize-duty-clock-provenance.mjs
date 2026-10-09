import fs from 'node:fs';
const file='client/src/lib/pdfParser.ts';
let source=fs.readFileSync(file,'utf8');
const patches=[
  [
    "  dutyDebrief: string | null; // HH:MM",
    "  dutyDebrief: string | null; // HH:MM\n  /** Clock origin survives parsing/cache; unknown legacy clocks are never publication proof. */\n  dutyReportSource?: 'published' | 'estimated' | 'absent' | 'unknown';\n  dutyDebriefSource?: 'published' | 'estimated' | 'absent' | 'unknown';"
  ],
  [
    "day.dutyReport = reportRaw ? cleanTime(reportRaw) : departureTime;",
    "day.dutyReport = reportRaw ? cleanTime(reportRaw) : departureTime;\n  day.dutyReportSource = reportRaw ? 'published' : 'estimated';"
  ],
  [
    "day.dutyDebrief = debriefRaw ? cleanTime(debriefRaw) : arrivalTime;",
    "day.dutyDebrief = debriefRaw ? cleanTime(debriefRaw) : arrivalTime;\n  day.dutyDebriefSource = debriefRaw ? 'published' : 'estimated';"
  ],
  [
    "const report = crewRosterOffsetReportBefore(block.text, first, previousEnd, offset) || cleanTime(first.rawDeparture);",
    "const publishedReport = crewRosterOffsetReportBefore(block.text, first, previousEnd, offset);\n      const report = publishedReport || cleanTime(first.rawDeparture);"
  ],
  [
    "day.dutyDebrief = debrief?.time || addMinutes(cleanTime(last.rawArrival), 30);",
    "day.dutyDebrief = debrief?.time || addMinutes(cleanTime(last.rawArrival), 30);\n      day.dutyReportSource = publishedReport ? 'published' : 'estimated';\n      day.dutyDebriefSource = debrief ? 'published' : 'estimated';"
  ],
  [
    "if (reportTime && !day.dutyReport) day.dutyReport = cleanTime(reportTime);",
    "if (reportTime && !day.dutyReport) { day.dutyReport = cleanTime(reportTime); day.dutyReportSource = 'published'; }"
  ],
  [
    "day.dutyReport = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber) || null;",
    "day.dutyReport = extractDutyReportBeforeFirstFlight(text, firstLeg.flightNumber) || null;\n      day.dutyReportSource = day.dutyReport ? 'published' : 'absent';"
  ],
  [
    "day.dutyDebrief = day.dutyDebrief || findColumnarDebriefForLastLeg(day.rawText || '', lastLeg) || addMinutes(lastLeg.arrivalTime, 30);",
    "const publishedDebrief = findColumnarDebriefForLastLeg(day.rawText || '', lastLeg);\n    if (!day.dutyDebrief) {\n      day.dutyDebrief = publishedDebrief || addMinutes(lastLeg.arrivalTime, 30);\n      day.dutyDebriefSource = publishedDebrief ? 'published' : 'estimated';\n    }"
  ],
  [
    "day.dutyDebrief = findColumnarDebriefForLastLeg(day.rawText || '', lastLeg) || day.dutyDebrief || addMinutes(lastLeg.arrivalTime, 30);",
    "const publishedDebrief = findColumnarDebriefForLastLeg(day.rawText || '', lastLeg);\n    if (publishedDebrief) { day.dutyDebrief = publishedDebrief; day.dutyDebriefSource = 'published'; }\n    else if (!day.dutyDebrief) { day.dutyDebrief = addMinutes(lastLeg.arrivalTime, 30); day.dutyDebriefSource = 'estimated'; }"
  ],
  [
    "function finalizeRosterDay(day: RosterDay): void {",
    "function finalizeRosterDay(day: RosterDay): void {\n  day.dutyReportSource ||= day.dutyReport ? 'unknown' : 'absent';\n  day.dutyDebriefSource ||= day.dutyDebrief ? 'unknown' : 'absent';"
  ],
  [
    "if (debrief) day.dutyDebrief = debrief;",
    "if (debrief) { day.dutyDebrief = debrief; day.dutyDebriefSource = 'published'; }"
  ],
  [
    "if (rawDebrief) day.dutyDebrief = cleanTime(rawDebrief);",
    "if (rawDebrief) { day.dutyDebrief = cleanTime(rawDebrief); day.dutyDebriefSource = 'published'; }"
  ],
  [
    "if (rawDebriefTime) day.dutyDebrief = cleanTime(rawDebriefTime);",
    "if (rawDebriefTime) { day.dutyDebrief = cleanTime(rawDebriefTime); day.dutyDebriefSource = 'published'; }"
  ],
  [
    "day.dutyDebrief = stationWindow.end;",
    "day.dutyDebrief = stationWindow.end;\n      day.dutyReportSource = 'published'; day.dutyDebriefSource = 'published';"
  ],
  [
    "day.dutyDebrief = timeWindow.end;",
    "day.dutyDebrief = timeWindow.end;\n      day.dutyReportSource = 'published'; day.dutyDebriefSource = 'published';"
  ]
];
for(const [before,after] of patches) source=source.split(after).map(part=>part.replaceAll(before,after)).join(after);
fs.writeFileSync(file,source);
console.log('Duty clock origins preserved; legacy unknown clocks remain unconfirmed.');
