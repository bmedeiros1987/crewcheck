import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_VERSION = '14.3.30';
const WEB_VERSION_DIGITS = WEB_VERSION.replace(/\./g, '');
const parserPath = 'client/src/lib/pdfParser.ts';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const replacementPath = path.join(scriptDir, 'continuation-replacement.ts.txt');

function updateTextFile(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14.3.30] arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

if (!fs.existsSync(parserPath)) throw new Error('[v14.3.30] pdfParser.ts ausente.');
if (!fs.existsSync(replacementPath)) throw new Error('[v14.3.30] implementação de continuação ausente.');

let source = fs.readFileSync(parserPath, 'utf8');
let changed = false;

const implementationMarker = 'function crewRosterRawLegTimings(';
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

updateTextFile('client/src/pages/Home.tsx', (value) => value
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${WEB_VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${WEB_VERSION}: CrewRosterReport multijornada e atividades MCK corrigidos por data real';`), { optional: true });
updateTextFile('client/src/App.tsx', (value) => value.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${WEB_VERSION}'`), { optional: true });
updateTextFile('client/src/pages/AuthPage.tsx', (value) => value
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${WEB_VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${WEB_VERSION}"`), { optional: true });
updateTextFile('client/index.html', (value) => value
  .replace(/data-crewcheck-release="[^"]+"/, `data-crewcheck-release="${WEB_VERSION}"`)
  .replace(/<meta name="crewcheck-release" content="[^"]+"\s*\/>/, `<meta name="crewcheck-release" content="${WEB_VERSION}" />`)
  .replace(/crewcheck-cache-reset-[^']+/, `crewcheck-cache-reset-${WEB_VERSION.replace(/\./g, '-')}`)
  .replace(/manifest\.json\?v=[^"']+/, `manifest.json?v=${WEB_VERSION_DIGITS}`)
  .replace(/\/sw\.js\?v=\d+/, `/sw.js?v=${WEB_VERSION_DIGITS}`)
  .replace(/var currentRelease = '[^']+';/, `var currentRelease = '${WEB_VERSION}';`), { optional: true });
updateTextFile('client/public/sw.js', (value) => value
  .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v${WEB_VERSION}-shell';`)
  .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v${WEB_VERSION}-runtime';`), { optional: true });
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: WEB_VERSION, channel: 'web', updatePolicy: 'automatic' }, null, 2)}\n`, 'utf8');

console.log('CrewCheck v14.3.30: pairings de vários dias, viradas, apresentações reais e MCK reconhecidos por data civil; atualização web automática publicada.');
