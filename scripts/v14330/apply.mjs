import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const parserPath = 'client/src/lib/pdfParser.ts';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const replacementPath = path.join(scriptDir, 'continuation-replacement.ts.txt');

if (!fs.existsSync(parserPath)) throw new Error('[v14.3.30] pdfParser.ts ausente.');
if (!fs.existsSync(replacementPath)) throw new Error('[v14.3.30] implementação de continuação ausente.');

let source = fs.readFileSync(parserPath, 'utf8');
let changed = false;

const implementationMarker = 'function crewRosterRawLegTiming(';
if (!source.includes(implementationMarker)) {
  const startMarker = 'function normalizeCrewRosterReportContinuationDays(';
  const endMarker = '\ntype GenericTripulationRecord =';
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
  if (start < 0 || end < 0) {
    throw new Error(`[v14.3.30] bloco de continuação do CrewRosterReport não localizado com segurança. start=${start} end=${end}`);
  }

  const implementation = fs.readFileSync(replacementPath, 'utf8').trimEnd();
  source = `${source.slice(0, start)}${implementation}\n\n${source.slice(end + 1)}`;
  changed = true;
  console.log('[v14.3.30] continuação multijornada do CrewRosterReport substituída estruturalmente.');
} else {
  console.log('[v14.3.30] continuação multijornada do CrewRosterReport já aplicada.');
}

const pipelineMarker = 'const daysWithGroundActivities = rescueCrewRosterOffsetGroundActivities(';
const oldPipeline = /  const days = applyGenericTripulationRecordsToDays\(normalizeCrewRosterReportContinuationDays\(rescuedDays, header\.month, header\.year, header\.base\), crewRecords, header\.crewName\);/g;

if (!source.includes(pipelineMarker)) {
  const matches = [...source.matchAll(oldPipeline)];
  if (matches.length !== 1) {
    throw new Error(`[v14.3.30] pipeline final do parser não localizado com segurança. Ocorrências: ${matches.length}`);
  }
  source = source.replace(
    oldPipeline,
    [
      '  const continuationDays = normalizeCrewRosterReportContinuationDays(rescuedDays, header.month, header.year, header.base);',
      '  const daysWithGroundActivities = rescueCrewRosterOffsetGroundActivities(continuationDays, fullText, header.month, header.year, header.base);',
      '  const days = applyGenericTripulationRecordsToDays(daysWithGroundActivities, crewRecords, header.crewName);',
    ].join('\n'),
  );
  changed = true;
  console.log('[v14.3.30] resgate de MCK conectado antes da normalização canônica.');
} else {
  console.log('[v14.3.30] pipeline de MCK e continuação já aplicado.');
}

if (changed) fs.writeFileSync(parserPath, `${source.trimEnd()}\n`, 'utf8');
console.log('CrewCheck v14.3.30: pairings de vários dias, viradas e MCK reconhecidos por data real.');
