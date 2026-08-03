import fs from 'node:fs';

const file = 'server/rosterParser.mjs';
if (!fs.existsSync(file)) throw new Error('[v14.3.76] server roster parser ausente.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.76] overnight ground activities keep next-day semantics';
const nextDayLine = 'day.isNextDay = Boolean(window.start && window.end && toMin(window.end) < toMin(window.start));';

if (!source.includes(marker)) {
  const normalBefore = "  day.dutyReport = window.start;\n  day.dutyDebrief = window.end;\n  day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;";
  const normalAfter = "  day.dutyReport = window.start;\n  day.dutyDebrief = window.end;\n  day.isNextDay = Boolean(window.start && window.end && toMin(window.end) < toMin(window.start));\n  day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;";

  if (source.includes(normalBefore)) source = source.replace(normalBefore, normalAfter);
  else if (!source.includes(normalAfter)) throw new Error('[v14.3.76] caminho normal de atividade AIMS não localizado.');

  const fallbackBefore = "    day.dutyReport = window.start;\n    day.dutyDebrief = window.end;\n    day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;";
  const fallbackAfter = "    day.dutyReport = window.start;\n    day.dutyDebrief = window.end;\n    day.isNextDay = Boolean(window.start && window.end && toMin(window.end) < toMin(window.start));\n    day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;";

  if (source.includes(fallbackBefore)) source = source.replace(fallbackBefore, fallbackAfter);
  else if (!source.includes(fallbackAfter)) throw new Error('[v14.3.76] fallback MCK AIMS não localizado.');

  const occurrences = source.split(nextDayLine).length - 1;
  if (occurrences < 2) throw new Error(`[v14.3.76] esperadas duas marcações isNextDay; encontradas ${occurrences}.`);

  source = `${source.trimEnd()}\n\n${marker}\n`;
  fs.writeFileSync(file, source, 'utf8');
  console.log('[v14.3.76] atividades de solo AIMS que cruzam meia-noite preservam isNextDay no caminho normal e no fallback MCK.');
} else {
  console.log('[v14.3.76] semântica next-day de atividades de solo já aplicada.');
}
