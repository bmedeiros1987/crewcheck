import fs from 'node:fs';

const serverPath = 'server.mjs';
const serverImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";
const stableAnchor = "import { handleV139Route, handleV139Telegram } from './server/v139/index.mjs';";
const canonicalRoutineDispatch = "  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot, value);";

if (fs.existsSync(serverPath)) {
  let source = fs.readFileSync(serverPath, 'utf8');
  if (!source.includes(serverImport)) {
    if (!source.includes(stableAnchor)) throw new Error('[v14407-preflight] import estável do servidor não encontrado.');
    source = source.replace(stableAnchor, `${stableAnchor}\n${serverImport}`);
  }
  let routineDispatchFound = false;
  source = source.split('\n').map((line) => {
    if (!line.includes('conciergeRoutineReply(snapshot') || (!line.includes('/rotina') && !line.includes('treino hoje'))) return line;
    routineDispatchFound = true;
    return canonicalRoutineDispatch;
  }).join('\n');
  if (!routineDispatchFound && !source.includes(canonicalRoutineDispatch.trim())) {
    throw new Error('[v14407-preflight] roteamento de Rotina não encontrado para normalização.');
  }
  fs.writeFileSync(serverPath, source, 'utf8');
}

console.log('[v14407-preflight] Motor Wellhub e roteamento canônico de Rotina normalizados.');
