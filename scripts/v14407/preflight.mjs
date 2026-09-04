import fs from 'node:fs';

const serverPath = 'server.mjs';
const serverImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";
const stableAnchor = "import { handleV139Route, handleV139Telegram } from './server/v139/index.mjs';";
const canonicalRoutineDispatch = "  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje)\\b/i.test(lower)) return conciergeRoutineReply(snapshot, value);";
const preferenceSave = `  const incomingGymPreferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : null;
  if (incomingGymPreferences) {
    const gymPlan = ['wellhub', 'smartfit'].includes(String(incomingGymPreferences.gymPlan || '')) ? String(incomingGymPreferences.gymPlan) : undefined;
    const wellhubPlan = isWellhubPlanServer(incomingGymPreferences.wellhubPlan) ? String(incomingGymPreferences.wellhubPlan) : undefined;
    const hasGymActivity = Object.prototype.hasOwnProperty.call(incomingGymPreferences, 'gymActivity');
    const gymActivity = String(incomingGymPreferences.gymActivity || '').trim().slice(0, 80);
    snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: {
      ...(gymPlan ? { gymPlan } : {}),
      ...(wellhubPlan ? { wellhubPlan } : {}),
      ...(hasGymActivity ? { gymActivity } : {}),
    } });
  }`;
const replyAnchor = '  const reply = await buildTelegramConciergeReply(';

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
  if (!source.includes(preferenceSave.trim())) {
    const index = source.indexOf(replyAnchor);
    if (index < 0) throw new Error('[v14407-preflight] resposta do Concierge não encontrada para inserir preferências.');
    source = `${source.slice(0, index)}${preferenceSave}\n${source.slice(index)}`;
  }
  fs.writeFileSync(serverPath, source, 'utf8');
}

console.log('[v14407-preflight] Motor Wellhub, Rotina e preferências do Concierge normalizados.');
