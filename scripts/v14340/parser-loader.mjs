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
  "    const declaration = `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);`;",
  "    const visualDeclaration = `${declaration}\\n  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);`;",
  "    if (!next.includes(declaration)) throw new Error('[v14340] Declaração do resgate textual não localizada.');",
  "    next = next.replace(declaration, visualDeclaration);",
  "    const continuation = 'normalizeCrewRosterReportContinuationDays(rescuedDays,';",
  "    const ground = 'rescueCrewRosterOffsetGroundActivities(rescuedDays,';",
  "    if (next.includes(continuation)) next = next.replace(continuation, 'normalizeCrewRosterReportContinuationDays(visuallyRescuedDays,');",
  "    else if (next.includes(ground)) next = next.replace(ground, 'rescueCrewRosterOffsetGroundActivities(visuallyRescuedDays,');",
  "    else throw new Error('[v14340] Consumo downstream do resgate textual não localizado.');",
  "  }",
].join('\n') + '\n';
prepared = `${prepared.slice(0, pipelineStart)}${robustPipeline}${prepared.slice(pipelineEnd)}`;

if (!prepared.includes('Âncora compatível do resgate visual') || !prepared.includes('Consumo downstream do resgate textual')) {
  throw new Error('[v14340-loader] Compatibilidade integral do parser não aplicada.');
}
const runtimePath = path.join(os.tmpdir(), `crewcheck-v14340-parser-${process.pid}.mjs`);
fs.writeFileSync(runtimePath, prepared, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
