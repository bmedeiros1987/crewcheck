import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/v14340/parser.mjs';
let prepared = fs.readFileSync(sourcePath, 'utf8');

const anchorStart = prepared.indexOf("  if (!next.includes('function rescueFlightsFromVisualRows(')) {");
const anchorEnd = anchorStart >= 0 ? prepared.indexOf('  next = replaceRequired(', anchorStart) : -1;
if (anchorStart < 0 || anchorEnd < 0) throw new Error(`[v14340-loader] Bloco de âncora não localizado. start=${anchorStart} end=${anchorEnd}`);
const robustAnchor = [
  "  if (!next.includes('function rescueFlightsFromVisualRows(')) {",
  "    const anchor = next.includes('function rescueFlightsFromFullText(')",
  "      ? 'function rescueFlightsFromFullText('",
  "      : next.includes('function addDaysToRosterDate(')",
  "        ? 'function addDaysToRosterDate('",
  "        : next.includes('function countRosterEvents(')",
  "          ? 'function countRosterEvents('",
  "          : '';",
  "    if (!anchor) throw new Error('[v14340] Âncora compatível do resgate visual ausente.');",
  "    next = next.replace(anchor, `${clientVisualRescue}\\n\\n${anchor}`);",
  "  }",
].join('\n') + '\n';
prepared = `${prepared.slice(0, anchorStart)}${robustAnchor}${prepared.slice(anchorEnd)}`;

const pipelineStart = prepared.indexOf('  next = replaceRequired(', prepared.indexOf("update('client/src/lib/pdfParser.ts'"));
const pipelineEnd = pipelineStart >= 0 ? prepared.indexOf('  return next;', pipelineStart) : -1;
if (pipelineStart < 0 || pipelineEnd < 0) throw new Error(`[v14340-loader] Pipeline do cliente não localizado. start=${pipelineStart} end=${pipelineEnd}`);
const robustPipeline = [
  "  if (!next.includes('const visuallyRescuedDays = rescueFlightsFromVisualRows(')) {",
  "    const modern = `  const continuationDays = normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base);`;",
  "    const modernReplacement = `  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);\\n  const continuationDays = normalizeCrewRosterReportContinuationDays(visuallyRescuedDays, header.month, header.year, header.base);`;",
  "    const legacy = `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);\\n  const crewRecords = parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month);\\n  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);`;",
  "    const legacyReplacement = `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);\\n  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);\\n  const crewRecords = parseGenericTripulationRecords(fullText, header.crewName, header.year, header.month);\\n  const days = applyGenericTripulationRecordsToDays(normalizeCrewRosterReportContinuationDays(visuallyRescuedDays, header.month, header.year, header.base), crewRecords, header.crewName);`;",
  "    if (next.includes(modern)) next = next.replace(modern, modernReplacement);",
  "    else if (next.includes(legacy)) next = next.replace(legacy, legacyReplacement);",
  "    else throw new Error('[v14340] Pipeline compatível do resgate visual não localizado.');",
  "  }",
].join('\n') + '\n';
prepared = `${prepared.slice(0, pipelineStart)}${robustPipeline}${prepared.slice(pipelineEnd)}`;

if (!prepared.includes('Âncora compatível do resgate visual') || !prepared.includes('Pipeline compatível do resgate visual')) {
  throw new Error('[v14340-loader] Compatibilidade integral do parser não aplicada.');
}
const runtimePath = path.join(os.tmpdir(), `crewcheck-v14340-parser-${process.pid}.mjs`);
fs.writeFileSync(runtimePath, prepared, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
