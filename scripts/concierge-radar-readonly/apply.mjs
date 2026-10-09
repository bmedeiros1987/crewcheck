import fs from 'node:fs';
const file = 'server.mjs';
let source = fs.readFileSync(file, 'utf8');
const importLine = "import { radarReadReply } from './server/concierge/radar-readonly.mjs';";
if (!source.includes(importLine)) source = importLine + '\n' + source;
const legacyRadarButton = "  if (normalized.includes('radar') || normalized.includes('portão')) return '/radar';";
const exactRadarButton = "  if (['radar', 'portão', 'portao', 'radar / portão', 'radar / portao'].includes(normalized)) return '/radar';";
if (!source.includes(exactRadarButton)) {
  if (!source.includes(legacyRadarButton)) throw new Error('[concierge-radar-readonly] Radar button normalization missing');
  source = source.replace(legacyRadarButton, exactRadarButton);
}
const radarLines = '\n  const savedRadar = await radarReadReply(text, profile, snapshot);\n  if (savedRadar.handled) return savedRadar.reply;';
// Keep the other finalizers' contiguous prefixes intact in either apply order.
source = source.replace(radarLines, '');
const anchor = source.includes('  if (companyTransport.handled) return companyTransport.reply;')
  ? '  if (companyTransport.handled) return companyTransport.reply;'
  : '  if (stayMenu.handled) return stayMenu.reply;';
if (!source.includes(anchor)) throw new Error('[concierge-radar-readonly] final wrapper missing');
source = source.replace(anchor, anchor + radarLines);
// Semantic rewrite can discard dates and infer LA for a bare number. Intercept
// original Radar text before that rewrite; no provider, roster write or GPS.
const endpointAnchor = "  if (snapshot && !conciergeAccessMatches(user, snapshot)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a consultar esta escala.' });";
const endpointGuard = `${endpointAnchor}
  const radarRequest = await radarReadReply(String(body.text || body.message || ''), { ...profile, channel: 'app' }, snapshot);
  if (radarRequest.handled) return sendJson(res, 200, {
    ok: true, reply: radarRequest.reply, linked: profile.linked,
    hasRoster: Boolean(snapshot?.roster), preferences: conciergePreferencesV14336(snapshot),
    voiceOptions: conciergeVoiceOptionsV14336(), updatedAt: snapshot?.updatedAt || '',
    message: 'Consulta Radar salva; nenhuma localização ou preferência alterada.',
  });`;
if (!source.includes(endpointGuard)) {
  if (!source.includes(endpointAnchor)) throw new Error('[concierge-radar-readonly] authenticated endpoint anchor missing');
  source = source.replace(endpointAnchor, endpointGuard);
}
fs.writeFileSync(file, source);
const clientFile = 'client/src/pages/Home.tsx';
let client = fs.readFileSync(clientFile, 'utf8');
const clientImport = "import { radarReadIntent } from '../../../shared/conciergeRadarIntent.mjs';";
if (!client.includes(clientImport)) client = clientImport + '\n' + client;
const clientAnchor = 'async function askTelegramConcierge(text: string) {';
const clientGuard = `${clientAnchor}
  if (radarReadIntent(text)) {
    const response = await fetch('/api/telegram/concierge/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', cache: 'no-store',
      body: JSON.stringify({ ...telegramConciergeIdentity(), text }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'O Concierge não respondeu agora.');
    return payload;
  }`;
if (!client.includes(clientGuard)) {
  if (!client.includes(clientAnchor)) throw new Error('[concierge-radar-readonly] client request anchor missing');
  client = client.replace(clientAnchor, clientGuard);
}
fs.writeFileSync(clientFile, client);
console.log('[concierge-radar-readonly] owner-scoped saved Radar/follows; no provider or transport calls');
