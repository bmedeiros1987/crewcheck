import fs from 'node:fs';

const VERSION = '14.3.55';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14355] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function withEol(value, eol) {
  return value.trimEnd().replace(/\n/g, eol);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14355] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

function insertAfterRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14355] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${withEol(value, eol)}`);
}

const nearbyPlacesImport = `import { loadFreshNearbyCurrentGeo, loadNearbyPlacesOrigin, saveNearbyPlacesOrigin, type NearbyPlacesOriginMode } from '@/lib/nearbyPlacesOrigin';`;
const nearbyPlacesLegacyImport = `import { loadNearbyPlacesOrigin, saveNearbyPlacesOrigin, type NearbyPlacesOriginMode } from '@/lib/nearbyPlacesOrigin';`;

const openNearbyPlacesBefore = `function openNearbyPlaces(category: PlaceCategory, location = '', mode: 'layover' | 'current' = location ? 'layover' : 'current') {
  storage.set('crewcheck:places-category', category);
  storage.set('crewcheck:places-mode', mode);
  storage.set('crewcheck:places-location', mode === 'layover' ? location : '');
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'gyms' }));
}`;

const openNearbyPlacesAfter = `function openNearbyPlaces(category: PlaceCategory, location = '', mode: NearbyPlacesOriginMode = location ? 'layover' : 'current') {
  storage.set('crewcheck:places-category', category);
  saveNearbyPlacesOrigin(storage, mode, location);
  window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'gyms' }));
}`;

const conciergeAskBefore = `async function askTelegramConcierge(text: string) {
  const response = await fetch('/api/telegram/concierge/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({ ...telegramConciergeIdentity(), text }),
  });`;

const conciergeAskAfter = `async function askTelegramConcierge(text: string) {
  const currentLocation = loadFreshNearbyCurrentGeo(storage);
  const capturedAt = new Date().toISOString();
  const response = await fetch('/api/telegram/concierge/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    body: JSON.stringify({
      ...telegramConciergeIdentity(),
      text,
      ...(currentLocation ? {
        location: {
          latitude: currentLocation.lat,
          longitude: currentLocation.lng,
          accuracy: currentLocation.accuracy,
          source: 'app',
          capturedAt,
        },
      } : {}),
    }),
  });`;
const conciergeAskLegacy = conciergeAskAfter.replace(
  'loadFreshNearbyCurrentGeo(storage)',
  'loadFreshCurrentGeo()',
);

const currentLocationRequestBefore = `      setCoordinates(next);
      setLocationMode('current');
      storage.set('crewcheck:places-location', '');
      const address = await reverseGeocodePosition(position.lat, position.lng);`;

const currentLocationRequestAfter = `      setCoordinates(next);
      setLocationMode('current');
      saveNearbyPlacesOrigin(storage, 'current');
      setPlaces([]);
      setSelected(null);
      const address = await reverseGeocodePosition(position.lat, position.lng);`;

const canonicalAppLocationBeforeV14354 = "  if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: body.location } });";
const canonicalAppLocationBeforeV14355 = "  if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: { ...body.location, source: String(body.location.source || 'app'), updatedAt: new Date().toISOString() } } });";
const canonicalAppLocationGuard = `  if (body.location && typeof body.location === 'object') {
    const receivedAt = new Date();
    const canonicalLocation = normalizeConciergeLocationV14335({
      latitude: Number(body.location.latitude),
      longitude: Number(body.location.longitude),
      accuracy: Number(body.location.accuracy || 0),
      source: 'app',
      updatedAt: receivedAt.toISOString(),
    }, { now: receivedAt, airportPoints: WEATHER_AIRPORT_POINTS });
    body.location = canonicalLocation;
  }`;
const canonicalAppLocationAfter = `${canonicalAppLocationGuard}
${canonicalAppLocationBeforeV14355}`;
const replacedCanonicalAppLocationLegacy = `  if (body.location && typeof body.location === 'object') {
    const receivedAt = new Date();
    const canonicalLocation = normalizeConciergeLocationV14335({
      latitude: Number(body.location.latitude),
      longitude: Number(body.location.longitude),
      accuracy: Number(body.location.accuracy || 0),
      source: 'app',
      updatedAt: receivedAt.toISOString(),
    }, { now: receivedAt, airportPoints: WEATHER_AIRPORT_POINTS });
    if (canonicalLocation) {
      snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: canonicalLocation } });
    }
  }`;

export function patchNearbyPlacesHomeV14355(source) {
  let next = source.replace(nearbyPlacesLegacyImport, nearbyPlacesImport);
  next = insertAfterRequired(
    next,
    "import { countScheduleCategories, isProgramScheduleActivity, isRestScheduleActivity, isSmartDepartureEligible } from '@/lib/scheduleActivityClassification';",
    nearbyPlacesImport,
    'import da origem canônica de Locais próximos',
  );
  if (next.includes(conciergeAskLegacy)) next = next.replace(conciergeAskLegacy, conciergeAskAfter);
  next = replaceRequired(next, openNearbyPlacesBefore, openNearbyPlacesAfter, 'abertura de Locais próximos');
  next = replaceRequired(next, conciergeAskBefore, conciergeAskAfter, 'GPS fresco enviado pelo Concierge no app');
  next = replaceRequired(
    next,
    `  const storedLocation = storage.get('crewcheck:places-location', '');
  const storedMode = storage.get('crewcheck:places-mode', '') as 'layover' | 'current' | '';`,
    `  const initialPlacesOrigin = loadNearbyPlacesOrigin(storage);
  const storedLocation = initialPlacesOrigin.location;
  const storedMode = initialPlacesOrigin.mode;`,
    'migração da origem antiga de Locais próximos',
  );
  next = replaceRequired(
    next,
    "  const [locationMode, setLocationMode] = useState<'layover' | 'current'>(() => storedMode || ((storedLocation || target) ? 'layover' : 'current'));",
    "  const [locationMode, setLocationMode] = useState<NearbyPlacesOriginMode>(() => storedMode);",
    'estado inicial da origem da busca',
  );
  next = replaceRequired(next, currentLocationRequestBefore, currentLocationRequestAfter, 'seleção persistente da localização atual');
  next = insertAfterRequired(
    next,
    `  function choosePlan(value: string) {
    setPlan(value);
    storage.set('crewcheck:gym-provider-plan', value);
  }`,
    `  function chooseLocationMode(value: NearbyPlacesOriginMode) {
    if (value === 'layover' && !resolvedLayoverLocation) return;
    setLocationMode(value);
    saveNearbyPlacesOrigin(storage, value, value === 'layover' ? resolvedLayoverLocation : '');
    setPlaces([]);
    setSelected(null);
  }`,
    'troca persistente entre localização atual e pernoite',
  );
  next = replaceRequired(
    next,
    `<button className={locationMode === 'layover' ? 'active' : ''} disabled={!resolvedLayoverLocation} onClick={() => setLocationMode('layover')}><Hotel/> Usar pernoite</button>`,
    `<button className={locationMode === 'layover' ? 'active' : ''} disabled={!resolvedLayoverLocation} onClick={() => chooseLocationMode('layover')}><Hotel/> Usar pernoite</button>`,
    'botão de pernoite sem modo órfão',
  );
  return next;
}

export function patchConciergeAppLocationV14355(source) {
  if (source.includes(canonicalAppLocationAfter.trim())) return source;
  if (source.includes(replacedCanonicalAppLocationLegacy)) {
    return replaceRequired(source, replacedCanonicalAppLocationLegacy, canonicalAppLocationAfter, 'compatibilidade da primeira preparação v14.3.55');
  }
  if (source.includes(canonicalAppLocationBeforeV14355)) {
    return replaceRequired(source, canonicalAppLocationBeforeV14355, canonicalAppLocationAfter, 'normalização antes do salvamento v14.3.54');
  }
  return replaceRequired(
    source,
    canonicalAppLocationBeforeV14354,
    `${canonicalAppLocationGuard}\n${canonicalAppLocationBeforeV14354}`,
    'normalização antes do salvamento original',
  );
}

if (process.env.CREWCHECK_V14355_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', (source) => patchNearbyPlacesHomeV14355(source)
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(
      /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
      `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: farmácias e locais próximos usam a posição atual, sem Goiânia persistida';`,
    ));
  update('server.mjs', (source) => patchConciergeAppLocationV14355(source)
    .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`));
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
  update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
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
    notes: 'Farmácias e Locais próximos sincronizam a posição atual com o Concierge e removem origem antiga sem escolha recente.',
  }, null, 2)}\n`, { optional: true });
  update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - canonical current location for nearby places and Concierge`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.55:nearby-location'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-55-nearby-location.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140355')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14355] CrewCheck ${VERSION}: Farmácias e Locais próximos usam a posição atual canônica.`);
}
