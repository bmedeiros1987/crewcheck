import fs from 'node:fs';

const VERSION = '14.3.15';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14315] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('server.mjs', (source) => {
  let next = source;
  if (!next.includes('function placesServerKey()')) {
    const anchor = `function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`;
    if (!next.includes(anchor)) throw new Error('[v14315] Função de chave de mapas não encontrada.');
    next = next.replace(anchor, `${anchor}
function placesServerKey() {
  return envAny(['GOOGLE_PLACES_API_KEY', 'GOOGLE_PLACES_SERVER_KEY', 'GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`);
  }
  const categoryPattern = /const PLACE_CATEGORY_CONFIG = \{[\s\S]*?\n\};\n\nasync function handlePlacesSearch/;
  if (!categoryPattern.test(next)) throw new Error('[v14315] Catálogo de categorias de locais não encontrado.');
  next = next.replace(categoryPattern, `const PLACE_CATEGORY_CONFIG = {
  hotel: { label: 'hotéis', query: 'hotel hospedagem', fallbackName: 'Hotel', radius: 12_000 },
  gym: { label: 'academias', query: 'academia fitness musculação', fallbackName: 'Academia', radius: 12_000 },
  crossfit: { label: 'boxes de CrossFit', query: 'CrossFit box treinamento funcional', fallbackName: 'CrossFit', radius: 15_000 },
  pilates: { label: 'estúdios de Pilates', query: 'Pilates estúdio', fallbackName: 'Pilates', radius: 15_000 },
  yoga: { label: 'estúdios de yoga', query: 'yoga estúdio', fallbackName: 'Yoga', radius: 15_000 },
  swimming: { label: 'locais de natação', query: 'piscina natação clube academia', fallbackName: 'Natação', radius: 18_000 },
  running: { label: 'locais para corrida', query: 'parque pista corrida caminhada', fallbackName: 'Corrida', radius: 15_000 },
  sports: { label: 'locais de esporte', query: 'centro esportivo quadra esporte futebol tênis padel', fallbackName: 'Centro esportivo', radius: 18_000 },
  park: { label: 'parques', query: 'parque praça caminhada lazer', fallbackName: 'Parque', radius: 16_000 },
  nature: { label: 'locais de natureza', query: 'parque trilha cachoeira natureza mirante', fallbackName: 'Natureza', radius: 40_000 },
  leisure: { label: 'opções de lazer', query: 'lazer passeio cinema museu parque atração', fallbackName: 'Lazer', radius: 20_000 },
  museum: { label: 'museus', query: 'museu centro cultural exposição', fallbackName: 'Museu', radius: 20_000 },
  cinema: { label: 'cinemas', query: 'cinema shopping', fallbackName: 'Cinema', radius: 18_000 },
  spa: { label: 'locais de bem-estar', query: 'spa massagem relaxamento bem-estar', fallbackName: 'Bem-estar', radius: 15_000 },
  cafe: { label: 'cafés', query: 'café da manhã cafeteria aberto agora', fallbackName: 'Café', radius: 10_000 },
  restaurant: { label: 'restaurantes', query: 'restaurante alimentação saudável aberto agora', fallbackName: 'Restaurante', radius: 12_000 },
  attraction: { label: 'atrações', query: 'atração turística passeio ponto turístico', fallbackName: 'Passeio', radius: 30_000 },
  trip: { label: 'passeios para folga', query: 'atração turística natureza passeio bate e volta', fallbackName: 'Bate-volta', radius: 50_000 },
  study: { label: 'locais para estudo', query: 'biblioteca coworking café tranquilo estudo', fallbackName: 'Local de estudo', radius: 12_000 },
  hospital: { label: 'hospitais', query: 'hospital pronto atendimento emergência', fallbackName: 'Hospital', radius: 20_000 },
  pharmacy: { label: 'farmácias', query: 'farmácia drogaria', fallbackName: 'Farmácia', radius: 12_000 },
  laundry: { label: 'lavanderias', query: 'lavanderia', fallbackName: 'Lavanderia', radius: 12_000 },
};

async function handlePlacesSearch`);

  next = next.replace(
    "async function handlePlacesSearch(req, res, url, forcedCategory = '') {\n  const key = mapsServerKey();",
    "async function handlePlacesSearch(req, res, url, forcedCategory = '') {\n  const key = placesServerKey();",
  );
  next = next.replace(
    "'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow,places.regularOpeningHours.weekdayDescriptions,places.location,places.nationalPhoneNumber,places.websiteUri',",
    "'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.primaryType,places.googleMapsUri,places.currentOpeningHours.openNow,places.regularOpeningHours.weekdayDescriptions,places.location,places.nationalPhoneNumber,places.websiteUri',",
  );
  next = next.replace("        regionCode: 'BR',\n", '');
  next = next.replace('        ...(center ? { locationBias: { circle: { center, radius: 12_000 } } } : {}),', '        ...(center ? { locationBias: { circle: { center, radius: Number(config.radius || 12_000) } } } : {}),');
  next = next.replace('        rating: Number(place.rating) || undefined,', '        rating: Number(place.rating) || undefined,\n        userRatingCount: Number(place.userRatingCount) || undefined,\n        primaryType: place.primaryType || \'\',');
  if (!next.includes("crossfit: { label: 'boxes de CrossFit'") || !next.includes('radius: Number(config.radius || 12_000)') || !next.includes('userRatingCount') || !next.includes('const key = placesServerKey();')) {
    throw new Error('[v14315] Busca mundial de modalidades, lazer e folgas não foi aplicada por completo.');
  }
  return next;
});

update('client/src/components/v139/RoutineIntelligenceView.tsx', (source) => {
  let next = source;
  if (!next.includes("import RoutineDailyConcierge from '@/components/v14314/RoutineDailyConcierge';")) {
    const anchor = "import './v139.css';";
    if (!next.includes(anchor)) throw new Error('[v14315] Âncora de importação da Rotina não encontrada.');
    next = next.replace(anchor, `${anchor}\nimport RoutineDailyConcierge from '@/components/v14314/RoutineDailyConcierge';\nimport { getLifeRoutineContext } from '@/lib/lifeConcierge';`);
  }
  next = next.replace('    const sleepHours = 8;', '    const sleepHours = Math.max(6, Math.min(10, getLifeRoutineContext().sleep.targetMinutes / 60));');
  next = next.replace('return { next, gapHours, monoFolga, earlyStarts, projectedDuty, heavy, usableHours, recommended, suggestedWindow:', 'return { next, gapHours, monoFolga, earlyStarts, projectedDuty, heavy, usableHours, sleepHours, recommended, suggestedWindow:');
  if (!next.includes('<RoutineDailyConcierge events={events}/>')) {
    const anchor = '    <V139Header title="Rotina inteligente" detail="Trabalho, sono e até três atividades organizados sem competir com a próxima apresentação."/>';
    if (!next.includes(anchor)) throw new Error('[v14315] Cabeçalho da Rotina não encontrado.');
    next = next.replace(anchor, `${anchor}\n    <RoutineDailyConcierge events={events}/>`);
  }
  next = next.replace('<article><Moon/><span>Sono protegido</span><strong>8 h</strong></article>', '<article><Moon/><span>Sono protegido</span><strong>{plan.sleepHours.toFixed(1).replace(\'.\', \',\')} h</strong></article>');
  next = next.replace('<span><b>Proteção:</b> 8 h de sono + 2 h para alimentação, deslocamento e desaceleração</span>', '<span><b>Proteção:</b> {plan.sleepHours.toFixed(1).replace(\'.\', \',\')} h conforme a meta pessoal + 2 h para alimentação, deslocamento e desaceleração</span>');
  next = next.replace('O planejamento nunca reduz as oito horas reservadas ao sono. Em dúvida, o CrewCheck recomenda descansar.', 'O planejamento usa a meta pessoal de sono e nunca ocupa uma janela necessária para a próxima apresentação. Em dúvida, o CrewCheck recomenda preservar recuperação.');
  if (!next.includes('RoutineDailyConcierge') || !next.includes('getLifeRoutineContext().sleep.targetMinutes')) {
    throw new Error('[v14315] Guia diário e meta pessoal de sono não foram conectados à Rotina.');
  }
  return next;
});

update('client/src/components/v14314/RoutineDailyConcierge.tsx', (source) => source.replace(
  "      toast[ok ? 'success' : 'info'](ok ? 'Notificações autorizadas.' : 'A permissão de notificações não foi concedida.');",
  "      if (ok) toast.success('Notificações autorizadas.'); else toast.info('A permissão de notificações não foi concedida.');",
));

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: guia diário geolocalizado, conexões rápidas e rotina sincronizada com descanso e escala';`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
  .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
  .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140315')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - automatic geolocated daily guide, nearby activities and one-tap integrations synchronized with roster and recovery`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.15'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-15-daily-guide.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14315] CrewCheck ${VERSION}: guia diário automático, locais reais, café 09:30, descanso e conexões em um toque.`);
