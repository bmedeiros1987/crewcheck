import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const current = fs.readFileSync(path, 'utf8');
  const next = transform(current);
  if (next !== current) fs.writeFileSync(path, next, 'utf8');
}

update('server.mjs', (source) => {
  let next = source;

  if (!next.includes('const crewcheckLiveLocationThrottle = new Map();')) {
    next = next.replace(
      'const radarHealth = new Map();',
      `const radarHealth = new Map();
const crewcheckLiveLocationThrottle = new Map();
function crewcheckLiveLocationDecision(message = {}) {
  const chatId = String(message?.chat?.id || '');
  const latitude = Number(message?.location?.latitude);
  const longitude = Number(message?.location?.longitude);
  if (!chatId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return { process: false, announce: false };
  const now = Date.now();
  const previous = crewcheckLiveLocationThrottle.get(chatId) || {};
  const elapsed = now - Number(previous.at || 0);
  const distanceKm = previous.latitude == null ? Infinity : Math.hypot((latitude - previous.latitude) * 111, (longitude - previous.longitude) * 85);
  const process = !previous.at || elapsed >= 120000 || distanceKm >= 0.25;
  const announce = !previous.announced;
  if (process) crewcheckLiveLocationThrottle.set(chatId, { latitude, longitude, at: now, announced: previous.announced || announce });
  return { process, announce };
}`,
    );
  }

  next = next.replace(
    'else if (chatId && message?.location) await handleTelegramLocation(message);',
    `else if (chatId && message?.location) {
    const locationDecision = crewcheckLiveLocationDecision(message);
    if (locationDecision.process) await handleTelegramLocation({ ...message, crewcheckSilentLocation: !locationDecision.announce });
  }`,
  );

  if (!next.includes('function normalizeCrewCheckNaturalLanguage')) {
    next = next.replace(
      'async function handleTelegramWebhook(req, res) {',
      `function normalizeCrewCheckNaturalLanguage(value = '') {
  const original = String(value || '').trim();
  const plain = original.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ' ').trim();
  if (/^(o que|oq) (eu )?tenho (pra|para) hoje[?!.]*$/.test(plain) || /^(minha )?programacao de hoje[?!.]*$/.test(plain) || /^tenho algo hoje[?!.]*$/.test(plain)) return '/hoje';
  if (/^(o que|oq) (eu )?tenho (pra|para) amanha[?!.]*$/.test(plain) || /^(minha )?programacao de amanha[?!.]*$/.test(plain) || /^tenho algo amanha[?!.]*$/.test(plain)) return '/amanha';
  if (/^(qual (e|eh) )?(a )?(minha )?proxima programacao[?!.]*$/.test(plain) || /^(qual (e|eh) )?meu proximo voo[?!.]*$/.test(plain)) return '/proximo';
  return original;
}

async function handleTelegramWebhook(req, res) {`,
    );
  }
  next = next.replace(
    'const normalizedText = normalizeConciergeButtonText(text);',
    'const normalizedText = normalizeConciergeButtonText(normalizeCrewCheckNaturalLanguage(text));',
  );

  next = next.replace(/OPS:\s*['"][^'"]+['"]/g, "OPS: 'SBSI'");
  return next;
});

update('client/src/main.tsx', (source) => source.includes('v1418/premium-deluxe.css')
  ? source
  : source.replace('import "./components/v1417/operational-intelligence.css";', 'import "./components/v1417/operational-intelligence.css";\nimport "./components/v1418/premium-deluxe.css";'));

console.log('[v1418] Premium Deluxe phase 1: Telegram live-location throttle, natural language, OPS/SBSI and mobile layout hardening.');
