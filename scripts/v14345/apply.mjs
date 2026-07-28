import fs from 'node:fs';

const VERSION = '14.3.45';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14345] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: busca meteorológica contida e menu Web definido pelo tipo de ponteiro';`);

  if (!next.includes('data-layout-v14345="weather-search-pointer-hotfix"')) {
    next = next.replace(
      'data-layout-v14344="web-icon-menu"',
      'data-layout-v14344="web-icon-menu" data-layout-v14345="weather-search-pointer-hotfix"',
    );
  }
  if ((next.match(/data-layout-v14345="weather-search-pointer-hotfix"/g) || []).length !== 1) {
    throw new Error('[v14345] Marcador final do hotfix deve existir exatamente uma vez.');
  }

  const weatherStart = next.indexOf('function WeatherView(');
  const weatherEnd = weatherStart >= 0 ? next.indexOf('\nfunction ', weatherStart + 'function WeatherView('.length) : -1;
  const weather = weatherStart >= 0 && weatherEnd > weatherStart ? next.slice(weatherStart, weatherEnd) : '';
  const wrapperStart = weather.indexOf('<div><span className="cc-search-field"><input');
  const wrapperEnd = wrapperStart >= 0 ? weather.indexOf('</span>', wrapperStart) : -1;
  const buttonStart = wrapperStart >= 0 ? weather.indexOf('<button', wrapperStart) : -1;
  if (wrapperStart < 0 || wrapperEnd < 0 || buttonStart < wrapperEnd) {
    throw new Error('[v14345] Meteorologia deve manter input/lupa em wrapper próprio e botão fora dele.');
  }
  if (next.includes('<div className="cc-search-field"><input') && weather.includes('<div className="cc-search-field"><input')) {
    throw new Error('[v14345] O wrapper da Meteorologia não pode absorver o botão de pesquisa.');
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
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Hotfix do campo meteorológico e do menu Web por capacidade real do ponteiro, sem alterar o modo touch do iPad.',
}, null, 2)}\n`);

console.log(`[v14345] CrewCheck ${VERSION}: busca meteorológica preserva o botão e menu Web responde ao tipo real de ponteiro.`);
