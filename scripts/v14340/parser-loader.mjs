import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/v14340/parser.mjs';
let prepared = fs.readFileSync(sourcePath, 'utf8');

const integrityStart = prepared.indexOf("  next = replaceBlock(next, 'function assertCrewRosterReportIntegrity('");
const integrityEnd = integrityStart >= 0 ? prepared.indexOf("  if (!next.includes('function rescueFlightsFromVisualRows(')) {", integrityStart) : -1;
if (integrityStart < 0 || integrityEnd < 0) throw new Error(`[v14340-loader] Bloco de integridade não localizado. start=${integrityStart} end=${integrityEnd}`);
const robustIntegrity = [
  "  const blockingIntegrity = `  throw new Error('A escala oficial contém voos, mas nenhuma etapa foi reconhecida. A importação foi bloqueada para não salvar uma escala incompleta. Reprocesse o mesmo CrewRosterReport após atualizar o CrewCheck.');`;",
  "  const warningIntegrity = `  console.warn('[CrewCheck] CrewRosterReport com voos ainda sem etapas no primeiro passe; importação seguirá e o fallback visual do servidor será acionado.');`;",
  "  if (next.includes(blockingIntegrity)) next = next.replace(blockingIntegrity, warningIntegrity);",
  "  else if (!next.includes('importação seguirá e o fallback visual do servidor')) console.warn('[v14340] Barreira local já ausente ou em formato alternativo.');",
].join('\n') + '\n';
prepared = `${prepared.slice(0, integrityStart)}${robustIntegrity}${prepared.slice(integrityEnd)}`;

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
  "    if (anchor) next = next.replace(anchor, `${clientVisualRescue}\\n\\n${anchor}`);",
  "    else console.warn('[v14340] Resgate visual do cliente não encontrou âncora; fallback do servidor permanecerá ativo.');",
  "  }",
].join('\n') + '\n';
prepared = `${prepared.slice(0, anchorStart)}${robustAnchor}${prepared.slice(anchorEnd)}`;

const pipelineStart = prepared.indexOf('  next = replaceRequired(', prepared.indexOf("update('client/src/lib/pdfParser.ts'"));
const pipelineEnd = pipelineStart >= 0 ? prepared.indexOf('  return next;', pipelineStart) : -1;
if (pipelineStart < 0 || pipelineEnd < 0) throw new Error(`[v14340-loader] Pipeline do cliente não localizado. start=${pipelineStart} end=${pipelineEnd}`);
const robustPipeline = [
  "  if (!next.includes('const visuallyRescuedDays = rescueFlightsFromVisualRows(')) {",
  "    const declaration = `  const rescuedDays = rescueFlightsFromFullText(mergedDays, fullText, header.month, header.year, header.base);`;",
  "    if (next.includes(declaration)) {",
  "      const visualDeclaration = `${declaration}\\n  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);`;",
  "      next = next.replace(declaration, visualDeclaration);",
  "      const continuation = 'normalizeCrewRosterReportContinuationDays(rescuedDays,';",
  "      const ground = 'rescueCrewRosterOffsetGroundActivities(rescuedDays,';",
  "      if (next.includes(continuation)) next = next.replace(continuation, 'normalizeCrewRosterReportContinuationDays(visuallyRescuedDays,');",
  "      else if (next.includes(ground)) next = next.replace(ground, 'rescueCrewRosterOffsetGroundActivities(visuallyRescuedDays,');",
  "      else console.warn('[v14340] Resgate visual inserido sem consumo downstream; fallback do servidor permanecerá ativo.');",
  "    } else console.warn('[v14340] Declaração textual do cliente não localizada; fallback do servidor permanecerá ativo.');",
  "  }",
].join('\n') + '\n';
prepared = `${prepared.slice(0, pipelineStart)}${robustPipeline}${prepared.slice(pipelineEnd)}`;

const runtimePath = path.join(os.tmpdir(), `crewcheck-v14340-parser-${process.pid}.mjs`);
fs.writeFileSync(runtimePath, prepared, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  try { fs.unlinkSync(runtimePath); } catch {}
}
