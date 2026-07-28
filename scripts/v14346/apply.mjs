import fs from 'node:fs';

const VERSION = '14.3.46';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const freshLocationSnippet = fs.readFileSync(new URL('./fresh-location.snippet', import.meta.url), 'utf8').trim();

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14346] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14346] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14346] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: localização fresca, sem Goiânia persistida e Telegram sincronizado';`);

  next = replaceBlock(
    next,
    'function getCurrentGeoPosition():',
    'type NearbyAddress =',
    freshLocationSnippet,
    'captura fresca Web/Android',
  );

  next = replaceRequired(
    next,
    `  const saved = storage.get('crewcheck_last_geo', '');
  if (saved) return saved;`,
    `  const saved = loadFreshCurrentGeo();
  if (saved) return coordsLabel(saved.lat, saved.lng);`,
    'origem da rota sem coordenada antiga',
  );

  next = next.replace(
    `      const stored = coordinatePair(storage.get('crewcheck_last_geo', ''));`,
    `      const stored = loadFreshCurrentGeo();`,
  );

  next = replaceRequired(
    next,
    `  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(() => {
    const match = storage.get('crewcheck_last_geo', '').match(/^(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)$/);
    return match ? { lat: Number(match[1]), lon: Number(match[2]) } : null;
  });`,
    `  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(() => {
    const saved = loadFreshCurrentGeo();
    return saved ? { lat: saved.lat, lon: saved.lng } : null;
  });`,
    'Locais sem posição persistida vencida',
  );

  next = next.replace(
    `const [routeOrigin, setRouteOrigin] = useState(() => storage.get('crewcheck_last_geo', ''));`,
    `const [routeOrigin, setRouteOrigin] = useState(() => { const saved = loadFreshCurrentGeo(); return saved ? coordsLabel(saved.lat, saved.lng) : ''; });`,
  );

  next = next.replace(
    `      storage.set('crewcheck_last_geo', next.lat + ',' + next.lon);`,
    `      persistCurrentGeoPosition({ lat: next.lat, lng: next.lon, accuracy: Number(position.coords.accuracy || 0), source: 'browser-watch' });`,
  );
  return next;
});

update('server/v139/index.mjs', (source) => {
  let next = source;
  next = next.replace(
    /export async function handleV139Telegram\(([^)]*)\) \{/,
    (match, args) => args.includes('options') ? match : `export async function handleV139Telegram(${args}, options = {}) {`,
  );
  next = next.replace(
    'await handleTelegramLocationAndPlaces(update)',
    'await handleTelegramLocationAndPlaces(update, { silent: Boolean(options?.silentLocation) })',
  );
  if (!next.includes('silentLocation') || !next.includes('options = {}')) {
    throw new Error('[v14346] Handler auxiliar do Telegram não aceitou modo silencioso.');
  }
  return next;
});

update('server/v14316/telegramLocation.mjs', (source) => {
  let next = source.replace(
    'export async function handleTelegramLocationAndPlaces(update = {}) {',
    'export async function handleTelegramLocationAndPlaces(update = {}, options = {}) {',
  );
  if (!next.includes('if (options.silent) return true;')) {
    next = replaceRequired(
      next,
      '    if (edited) return true;',
      '    if (edited) return true;\n    if (options.silent) return true;',
      'persistência auxiliar silenciosa',
    );
  }
  return next;
});

update('server.mjs', (source) => {
  let next = source;
  const oldDispatch = `  // Ordinary text must reach the Concierge. Only live-location updates retain
  // priority in the auxiliary handler.
  if (chatId && message?.location && await handleV139Telegram(update, sendTelegramMessage)) return true;
  if (chatId && telegramMessagePdfDocument(message)) await handleTelegramPdfRoster(message);
  else if (chatId && message?.location) await handleTelegramLocation(message);
  else if (chatId && text) {`;
  const newDispatch = `  // Toda posição atualiza primeiro o contexto canônico; a base auxiliar recebe
  // a mesma coordenada sem emitir uma segunda confirmação.
  if (chatId && message?.location) {
    const snapshotHandled = await handleTelegramLocation(message, { silent: Boolean(update?.edited_message) });
    const auxiliaryHandled = await handleV139Telegram(update, sendTelegramMessage, { silentLocation: true });
    if (snapshotHandled || auxiliaryHandled) return true;
  }
  if (chatId && telegramMessagePdfDocument(message)) await handleTelegramPdfRoster(message);
  else if (chatId && text) {`;
  next = replaceRequired(next, oldDispatch, newDispatch, 'ordem canônica da localização Telegram');
  return next;
});

update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => {
  let next = source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`);
  const oldPersist = `    if (Number.isFinite(lat) && Number.isFinite(lng)) localStorage.setItem('crewcheck_last_geo', \`\${lat},\${lng}\`);`;
  const newPersist = `    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      localStorage.setItem('crewcheck_last_geo', \`\${lat},\${lng}\`);
      localStorage.setItem('crewcheck_last_geo_meta', JSON.stringify({ lat, lng, accuracy, capturedAt: new Date().toISOString(), source: 'runtime' }));
    }`;
  next = replaceRequired(next, oldPersist, newPersist, 'metadados da posição no runtime');
  return next;
}, { optional: true });

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`)
  .replace(/!name\.includes\('v[^']+'\)/g, `!name.includes('v${VERSION}')`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Localização atual obtida sem cache, coordenadas antigas expiram e Telegram sincroniza a posição canônica sem manter Goiânia.',
}, null, 2)}\n`);
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - localização fresca Web/Android e Telegram sincronizado`;
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140346')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`[v14346] CrewCheck ${VERSION}: posição fresca, cache geográfico com validade e Telegram canônico sincronizado.`);
