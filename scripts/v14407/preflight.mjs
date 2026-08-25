import fs from 'node:fs';

const serverPath = 'server.mjs';
const serverImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";
const stableAnchor = "import { handleV139Route, handleV139Telegram } from './server/v139/index.mjs';";

if (fs.existsSync(serverPath)) {
  let source = fs.readFileSync(serverPath, 'utf8');
  if (!source.includes(serverImport)) {
    if (!source.includes(stableAnchor)) throw new Error('[v14407-preflight] import estável do servidor não encontrado.');
    source = source.replace(stableAnchor, `${stableAnchor}\n${serverImport}`);
  }
  if (!source.includes('return conciergeRoutineReply(snapshot, value);') && source.includes('return conciergeRoutineReply(snapshot);')) {
    source = source.replace('return conciergeRoutineReply(snapshot);', 'return conciergeRoutineReply(snapshot, value);');
  }
  fs.writeFileSync(serverPath, source, 'utf8');
}

console.log('[v14407-preflight] Motor Wellhub e roteamento de Rotina normalizados.');
