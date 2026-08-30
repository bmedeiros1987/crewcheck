import fs from 'node:fs';

const TAG = '[v14410]';
const conciergeGyms = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8').trim();

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

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} ${label} não localizado.`);
  return source.replace(before, after);
}

function replaceAllGymDispatchers(source, canonicalDispatch) {
  const pattern = /^[ \t]*if \([^\n]*\) return conciergeGymsReply\(snapshot(?:, value, profile)?\);[ \t]*$/gm;
  const matches = source.match(pattern) || [];
  if (!matches.length) throw new Error(`${TAG} roteamento de academias não localizado.`);
  let inserted = false;
  const next = source.replace(pattern, () => {
    if (inserted) return '';
    inserted = true;
    return canonicalDispatch;
  });
  return next.replace(/\n{3,}/g, '\n\n');
}

function patchServer(source) {
  const wellhubImport = "import { buildWellhubRoutineSuggestion, detectWellhubActivityFromText, detectWellhubPlanFromText, handleWellhubRoutineRoute, handleWellhubSearchRoute, isWellhubPlanServer, searchVerifiedWellhub, wellhubPlanLabelServer } from './server/v14407/wellhub.mjs';";
  const conciergeImport = "import { extractWellhubLocationHintFromText, filterWellhubPartnersForLocation, isWellhubActivityPreferenceMessage, isWellhubPlanPreferenceMessage } from './server/v14410/wellhub-concierge.mjs';";
  let next = insertAfterRequired(source, wellhubImport, conciergeImport, 'import Wellhub v14.4.07');

  const conciergeTag = '// cc-v14410:concierge-gyms-plan-location';
  const legacyTag = '// cc-v14409:concierge-gyms-plan-location';
  const gymStart = next.includes(conciergeTag) ? conciergeTag : next.includes(legacyTag) ? legacyTag : 'async function conciergeGymsReply(';
  const routineStart = next.includes('async function conciergeRoutineReply(') ? 'async function conciergeRoutineReply(' : 'function conciergeRoutineReply(';
  next = replaceBetween(next, gymStart, routineStart, conciergeGyms, 'Concierge Wellhub');

  // Generic words like "modalidade" are not sufficient to route into the gym
  // state machine. Natural activity preferences are admitted only by the hardened
  // helper below, preventing unrelated corporate/payment modality messages from
  // silently persisting gymPlan=wellhub.
  const dispatch = "  if (/^\\/(?:academias?|wellhub)(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto)\\b/i.test(lower) || isWellhubPlanPreferenceMessage(value) || isWellhubActivityPreferenceMessage(value)) return conciergeGymsReply(snapshot, value, profile);";
  next = replaceAllGymDispatchers(next, dispatch);

  const whatsappBindingPattern = /configureWhatsAppConcierge\(async \(\{ email, text(?:, location)? \}\) => \{[\s\S]*?\n\}\);\n(?=\nhttp\.createServer)/;
  const whatsappBinding = `configureWhatsAppConcierge(async ({ email, text, location }) => {
  const profile = { email: String(email || '').trim().toLowerCase(), name: '', linked: true, channel: 'whatsapp' };
  let snapshot = await conciergeLoadSnapshot(profile);
  profile.name = snapshot?.name || 'Tripulante';

  if (location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))) {
    const receivedAt = new Date();
    const rawLocation = {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number(location.accuracy || 0),
      source: 'whatsapp',
      updatedAt: receivedAt.toISOString(),
    };
    const resolved = await resolveConciergeLocationLabelV14335(rawLocation, {
      apiKey: mapsServerKey(),
      airportPoints: WEATHER_AIRPORT_POINTS,
    });
    const normalized = normalizeConciergeLocationV14335({
      ...rawLocation,
      label: resolved.label,
      city: resolved.city || '',
      state: resolved.state || '',
      nearestAirport: resolved.airport || '',
    }, { now: receivedAt, airportPoints: WEATHER_AIRPORT_POINTS });
    if (!normalized) return 'Não consegui validar estas coordenadas. Compartilhe novamente sua localização atual pelo WhatsApp.';
    snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: normalized } });
    if (!String(text || '').trim()) {
      return [
        `Localização atualizada: ${normalized.label}.`,
        'Vou usar estas coordenadas por até 6 horas para Saída Inteligente e buscas perto de você.',
        'Depois desse período pedirei uma nova localização para não pesquisar na cidade errada.',
      ].join('\n');
    }
  }

  return buildTelegramConciergeReply(String(text || ''), profile, snapshot);
});`;
  if (!whatsappBindingPattern.test(next)) throw new Error(`${TAG} binding do Concierge WhatsApp não localizado.`);
  next = next.replace(whatsappBindingPattern, `${whatsappBinding}\n`);

  if (!next.includes('cc-v14410:concierge-gyms-plan-location')) throw new Error(`${TAG} função Wellhub nova não aplicada.`);
  if (next.includes('cc-v14409:concierge-gyms-plan-location')) throw new Error(`${TAG} marcador legado v14.4.09 permaneceu materializado.`);
  if (!next.includes('isWellhubPlanPreferenceMessage(value)')) throw new Error(`${TAG} roteamento de plano natural não aplicado.`);
  if (!next.includes('isWellhubActivityPreferenceMessage(value)')) throw new Error(`${TAG} roteamento de modalidade natural não aplicado.`);
  if (!next.includes("const planUpdate = planPreference ? detectedPlan : '';")) throw new Error(`${TAG} tier detectado ainda não está condicionado à intenção Wellhub.`);
  if (next.includes('detectedPlan && wellhubContext')) throw new Error(`${TAG} falso positivo legado de tier em nome de academia permaneceu.`);
  if (!next.includes('extractWellhubLocationHintFromText(text)')) throw new Error(`${TAG} fallback explícito de cidade informada não aplicado.`);
  if (!next.includes('Não tenho uma cidade/UF confirmada para pesquisar academias com segurança.')) throw new Error(`${TAG} busca sem contexto geográfico não está fail-closed.`);
  if (!next.includes('filterWellhubPartnersForLocation(candidatePartners')) throw new Error(`${TAG} filtro geográfico não aplicado.`);
  const dispatchCount = (next.match(/return conciergeGymsReply\(snapshot, value, profile\);/g) || []).length;
  if (dispatchCount !== 1) throw new Error(`${TAG} esperado um único dispatcher de academias; encontrado ${dispatchCount}.`);
  if (next.includes('return conciergeGymsReply(snapshot);')) throw new Error(`${TAG} atalho legado ainda sombreia texto/perfil.`);
  if (!next.includes("source: 'whatsapp'")) throw new Error(`${TAG} localização do WhatsApp não conectada ao snapshot compartilhado.`);
  return next;
}

function patchWhatsApp(source) {
  let next = source;
  const textField = "          text: String(message?.text?.body || '').trim().slice(0, 4000),";
  const locationField = `${textField}\n          location: message?.type === 'location' && Number.isFinite(Number(message?.location?.latitude)) && Number.isFinite(Number(message?.location?.longitude))\n            ? { latitude: Number(message.location.latitude), longitude: Number(message.location.longitude), name: String(message.location.name || '').slice(0, 160), address: String(message.location.address || '').slice(0, 240) }\n            : null,`;
  next = replaceRequired(next, textField, locationField, 'extração de localização do WhatsApp');

  const oldTypeGate = `  if (message?.type !== 'text') {\n    await sendWhatsAppText(from, 'Recebi sua mensagem. Nesta primeira etapa do WhatsApp, fale comigo por texto. Áudio, localização e PDF serão liberados separadamente.', { replyToMessageId: message.id });\n    return;\n  }\n  if (!text) return;`;
  const newTypeGate = `  if (!['text', 'location'].includes(message?.type)) {\n    await sendWhatsAppText(from, 'Recebi sua mensagem. Por enquanto o Concierge aceita texto e localização pelo WhatsApp; áudio e PDF serão liberados separadamente.', { replyToMessageId: message.id });\n    return;\n  }\n  if (message?.type === 'text' && !text) return;`;
  next = replaceRequired(next, oldTypeGate, newTypeGate, 'gate de tipos do WhatsApp');

  const oldCall = "    const result = await whatsappConciergeHandler({ email: String(link.email), text, messageId: message.id });";
  const newCall = "    const result = await whatsappConciergeHandler({ email: String(link.email), text, location: message.location || null, messageType: message.type, messageId: message.id });";
  next = replaceRequired(next, oldCall, newCall, 'encaminhamento de localização ao Concierge');

  next = replaceRequired(next, '    conciergeText: true,', '    conciergeText: true,\n    conciergeLocation: true,', 'health de localização do WhatsApp');
  next = next.replace('WhatsApp oficial pronto para receber, vincular e responder por texto.', 'WhatsApp oficial pronto para receber, vincular e responder por texto e localização.');
  return next;
}

update('server.mjs', patchServer);
update('server/whatsapp.mjs', patchWhatsApp);
console.log(`${TAG} Concierge Wellhub: plano/modalidade naturais + geografia fail-closed + paridade de localização no WhatsApp.`);
