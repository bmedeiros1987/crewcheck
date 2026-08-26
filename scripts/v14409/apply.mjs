import fs from 'node:fs';

const TAG = '[v14409]';
const conciergeGyms = fs.readFileSync('scripts/v14409/concierge-gyms.snippet', 'utf8').trim();

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`${TAG} Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`${TAG} ${label} não localizado.`);
  const current = source.slice(start, end).trimEnd();
  if (current === replacement.trimEnd()) return source;
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} ${label} não localizado.`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

function patchServer(source) {
  const wellhubImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";
  const conciergeImport = "import { filterWellhubPartnersForLocation, isWellhubPlanPreferenceMessage } from './server/v14409/wellhub-concierge.mjs';";
  let next = insertAfterRequired(source, wellhubImport, conciergeImport, 'import Wellhub v14.4.07');
  next = replaceBetween(next, 'async function conciergeGymsReply(', 'function conciergeRoutineReply(', conciergeGyms, 'Concierge Wellhub');
  const dispatch = "  if (/^\\/(?:academias?|wellhub)(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto|modalidade)\\b/i.test(lower) || isWellhubPlanPreferenceMessage(value)) return conciergeGymsReply(snapshot, value, profile);";
  const dispatchPattern = /^\s*if \([^\n]*return conciergeGymsReply\(snapshot, value, profile\);\s*$/m;
  if (!dispatchPattern.test(next)) throw new Error(`${TAG} roteamento de academias não localizado.`);
  next = next.replace(dispatchPattern, dispatch);
  if (!next.includes('cc-v14409:concierge-gyms-plan-location')) throw new Error(`${TAG} função Wellhub nova não aplicada.`);
  if (!next.includes('isWellhubPlanPreferenceMessage(value)')) throw new Error(`${TAG} roteamento de plano natural não aplicado.`);
  if (!next.includes('filterWellhubPartnersForLocation(candidatePartners')) throw new Error(`${TAG} filtro geográfico não aplicado.`);
  return next;
}

update('server.mjs', patchServer);
console.log(`${TAG} Concierge Wellhub: plano natural + localização fail-closed.`);
