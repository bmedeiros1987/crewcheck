import fs from 'node:fs';

const VERSION = '14.3.44';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const webMenuCss = fs.readFileSync(new URL('./web-menu.css', import.meta.url), 'utf8').trim();
const WEB_MENU_CSS_MARKER = '/* CrewCheck v14.3.44 — menu Web icon-first, location in Settings and search affordance at the end */';
const SEARCH_ICON_END = '<Search className="cc-search-icon-end" aria-hidden="true"/>';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14344] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14344] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

export function upgradePreparedWeatherSearch(source) {
  const preparedStart = '<div className="cc-search-field"><input';
  const closeTag = '</div>';
  let next = source;
  while (next.includes(preparedStart)) {
    const start = next.indexOf(preparedStart);
    const contentStart = start + preparedStart.length;
    const inputClose = next.indexOf('/>', contentStart);
    const containerClose = inputClose >= 0 ? next.indexOf(closeTag, inputClose + 2) : -1;
    if (inputClose < 0 || containerClose < 0) throw new Error('[v14344] Busca meteorológica preparada sem fechamento seguro.');
    const inputRemainder = next.slice(contentStart, inputClose + 2);
    const preparedControls = next.slice(inputClose + 2, containerClose);
    if (!preparedControls.includes(SEARCH_ICON_END)) throw new Error('[v14344] Busca preparada sem a lupa final esperada.');
    const controlsAfterInput = preparedControls.replace(SEARCH_ICON_END, '');
    const replacement = `<div className="cc-weather-search-row-v14344"><span className="cc-search-field"><input${inputRemainder}${SEARCH_ICON_END}</span>${controlsAfterInput}</div>`;
    next = `${next.slice(0, start)}${replacement}${next.slice(containerClose + closeTag.length)}`;
  }
  return next;
}

function moveLabelSearchIconsToEnd(source) {
  const legacyStart = '<label><Search/><input';
  const closeTag = '</label>';
  let next = source;
  let migrated = 0;
  while (next.includes(legacyStart)) {
    const start = next.indexOf(legacyStart);
    const contentStart = start + legacyStart.length;
    const close = next.indexOf(closeTag, contentStart);
    if (close < 0) throw new Error('[v14344] Campo com lupa inicial sem fechamento de label.');
    const inputRemainder = next.slice(contentStart, close);
    const replacement = `<label className="cc-search-field"><input${inputRemainder}${SEARCH_ICON_END}</label>`;
    next = `${next.slice(0, start)}${replacement}${next.slice(close + closeTag.length)}`;
    migrated += 1;
  }
  return { source: next, migrated };
}

function moveNestedDivSearchIconsToEnd(source) {
  const legacyStart = '<div><Search/><input';
  const closeTag = '</div>';
  let next = source;
  let migrated = 0;
  while (next.includes(legacyStart)) {
    const start = next.indexOf(legacyStart);
    const contentStart = start + legacyStart.length;
    const inputClose = next.indexOf('/>', contentStart);
    const containerClose = inputClose >= 0 ? next.indexOf(closeTag, inputClose + 2) : -1;
    if (inputClose < 0 || containerClose < 0) throw new Error('[v14344] Busca aninhada sem fechamento seguro de input/div.');
    const inputRemainder = next.slice(contentStart, inputClose + 2);
    const controlsAfterInput = next.slice(inputClose + 2, containerClose);
    const replacement = `<div className="cc-weather-search-row-v14344"><span className="cc-search-field"><input${inputRemainder}${SEARCH_ICON_END}</span>${controlsAfterInput}</div>`;
    next = `${next.slice(0, start)}${replacement}${next.slice(containerClose + closeTag.length)}`;
    migrated += 1;
  }
  return { source: next, migrated };
}

function moveLeadingSearchIconsToEnd(source) {
  const labelMigration = moveLabelSearchIconsToEnd(source);
  const divMigration = moveNestedDivSearchIconsToEnd(labelMigration.source);
  const next = divMigration.source;
  if (next.includes('<label><Search/><input') || next.includes('<div><Search/><input')) {
    throw new Error('[v14344] Ainda existe lupa antes de um campo de pesquisa.');
  }
  return { source: next, migrated: labelMigration.migrated + divMigration.migrated };
}

export function installWebMenuCss(source) {
  const markerIndex = source.indexOf(WEB_MENU_CSS_MARKER);
  if (markerIndex < 0) return `${source.trimEnd()}\n\n${webMenuCss}\n`;
  const nextCrewCheckMarker = source.indexOf('/* CrewCheck v', markerIndex + WEB_MENU_CSS_MARKER.length);
  const prefix = source.slice(0, markerIndex).trimEnd();
  const suffix = nextCrewCheckMarker >= 0 ? source.slice(nextCrewCheckMarker).trimStart() : '';
  return `${prefix}${prefix ? '\n\n' : ''}${webMenuCss}${suffix ? `\n\n${suffix}` : '\n'}`;
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: menu Web por ícones, localização em Configurações e lupa no fim do campo';`);

  next = next.replace(/\s*<CrewLocationAccess compact\/>\s*/g, '\n');
  if (next.includes('<CrewLocationAccess compact/>')) throw new Error('[v14344] Localização compacta ainda aparece dentro do menu.');

  next = next.replace('<CrewLocationAccess/><GoogleMapsRoutePreview', '<GoogleMapsRoutePreview');
  if (next.includes('<CrewLocationAccess/><GoogleMapsRoutePreview')) {
    throw new Error('[v14344] Controle global de localização ainda aparece dentro da Saída Inteligente.');
  }

  next = patchBlock(next, 'function SettingsView(', 'function FeatureHub(', 'Configurações e localização', (block) => {
    if (block.includes('className="cc-location-settings"')) return block;
    const anchor = '    <PlatformPreferences/>';
    if (!block.includes(anchor)) throw new Error('[v14344] PlatformPreferences não localizado em Configurações.');
    const locationSection = `    <section className="cc-location-settings">
      <h3>Localização</h3>
      <CrewLocationAccess/>
    </section>`;
    return block.replace(anchor, `${anchor}\n${locationSection}`);
  });

  next = patchBlock(next, 'function MenuDrawer(', 'function Cockpit(', 'menu Web por ícones', (block) => {
    if (block.includes('data-menu-label={label}')) return block;
    const before = `<button key={v} className={view === v ? 'active' : ''} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>`;
    const after = `<button key={v} className={view === v ? 'active' : ''} onClick={() => jump(v)} aria-label={label} title={label + ' — ' + desc} data-menu-label={label} data-menu-description={desc}><Icon aria-hidden="true"/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight aria-hidden="true"/></button>`;
    if (!block.includes(before)) throw new Error('[v14344] Botão do menu agrupado não localizado.');
    return block.replace(before, after);
  });

  next = upgradePreparedWeatherSearch(next);
  const searchMigration = moveLeadingSearchIconsToEnd(next);
  next = searchMigration.source;
  if (!next.includes('className="cc-search-field"') || !next.includes('className="cc-search-icon-end"')) {
    throw new Error('[v14344] Nenhum campo de pesquisa com lupa ao final foi localizado.');
  }
  if (next.includes('<div className="cc-search-field"><input')) {
    throw new Error('[v14344] Markup meteorológico preparado antigo ainda presente.');
  }
  if ((next.match(/className="cc-search-field"/g) || []).length !== (next.match(/className="cc-search-icon-end"/g) || []).length) {
    throw new Error('[v14344] Cada campo de pesquisa migrado deve possuir exatamente uma lupa ao final.');
  }

  if (!next.includes('data-layout-v14344="web-icon-menu"')) {
    next = next.replace(
      'data-layout-v14343="premium-contained"',
      'data-layout-v14343="premium-contained" data-layout-v14344="web-icon-menu"',
    );
  }
  if (!next.includes('data-layout-v14344="web-icon-menu"')) throw new Error('[v14344] Identificador do novo layout não foi aplicado.');
  if ((next.match(/data-layout-v14344="web-icon-menu"/g) || []).length !== 1) {
    throw new Error('[v14344] Identificador do layout final não pode ser duplicado.');
  }
  if ((next.match(/<CrewLocationAccess\/>/g) || []).length !== 1) {
    throw new Error('[v14344] O controle global de localização deve existir uma única vez, dentro de Configurações.');
  }
  return next;
});

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
update('client/src/index.css', installWebMenuCss);
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Localização centralizada em Configurações, menu Web por ícones com detalhes no hover e lupas posicionadas ao final dos campos.',
}, null, 2)}\n`);

console.log(`[v14344] CrewCheck ${VERSION}: localização somente em Configurações, menu Web icon-first, ícones centralizados e lupas ao final dos campos.`);
