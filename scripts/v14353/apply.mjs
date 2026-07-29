import fs from 'node:fs';

const VERSION = '14.3.53';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const FLYDECK_MARKER = 'data-flydeck-v14353="premium-briefing"';
const CSS_MARKER = '/* CrewCheck v14.3.53 — FlyDeck Premium com briefing operacional conciso */';
const flyDeckSnippet = fs.readFileSync(new URL('./flydeck-premium.snippet', import.meta.url), 'utf8').trim();
const flyDeckCss = fs.readFileSync(new URL('./flydeck-premium.css', import.meta.url), 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14353] Arquivo ausente: ${path}`);
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

function insertAfterRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14353] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${withEol(value, eol)}`);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14353] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14353] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

export function patchFlyDeckHomeV14353(source) {
  let next = source;
  next = insertAfterRequired(
    next,
    "import '@/components/v1399/premium.css';",
    "import OperationalDayTimeline from '@/components/v14349/OperationalDayTimeline';",
    'import da Linha do Dia',
  );
  next = replaceRequired(
    next,
    "import { countScheduleCategories, isRestScheduleActivity, isSmartDepartureEligible } from '@/lib/scheduleActivityClassification';",
    "import { countScheduleCategories, isProgramScheduleActivity, isRestScheduleActivity, isSmartDepartureEligible } from '@/lib/scheduleActivityClassification';",
    'classificação de próxima programação',
  );

  next = patchBlock(
    next,
    'function chronologicalNextRosterLeg(',
    'function importGuardianSummary(',
    'próxima programação cronológica',
    (block) => {
      if (block.includes('isProgramScheduleActivity(event)')) return block;
      if (!block.includes('isOperationalEvent(event)')) throw new Error('[v14353] Filtro cronológico esperado não encontrado.');
      return block.replace('isOperationalEvent(event)', 'isProgramScheduleActivity(event)');
    },
  );
  next = patchBlock(
    next,
    'function nextFlight(',
    'function nextRealFlight(',
    'seleção da próxima programação',
    (block) => {
      if (block.includes('isProgramScheduleActivity(event)')) return block;
      if (!block.includes('isOperationalEvent(event)')) throw new Error('[v14353] Filtro canônico esperado não encontrado.');
      return block.replace('isOperationalEvent(event)', 'isProgramScheduleActivity(event)');
    },
  );

  if (!next.includes(FLYDECK_MARKER)) {
    const start = next.indexOf('function Cockpit(');
    const end = start >= 0 ? next.indexOf('function rosterCode(', start) : -1;
    if (start < 0 || end < 0) throw new Error(`[v14353] FlyDeck não localizado. start=${start} end=${end}`);
    const eol = next.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
    next = `${next.slice(0, start)}${withEol(flyDeckSnippet, eol)}${eol}${eol}${next.slice(end)}`;
  }

  if (next.includes('<SmartCard event={departureEvent}')) throw new Error('[v14353] Card antigo de saída ainda aparece na tela inicial.');
  if (next.includes('<section className="cz-kpi-row">') && next.slice(next.indexOf('function Cockpit('), next.indexOf('function rosterCode(')).includes('cz-kpi-row')) {
    throw new Error('[v14353] KPIs mensais ainda aparecem no briefing.');
  }
  return next;
}

export function installFlyDeckPremiumCssV14353(source) {
  const markerIndex = source.indexOf(CSS_MARKER);
  if (markerIndex < 0) return `${source.trimEnd()}\n\n${flyDeckCss}\n`;
  const nextCrewCheckMarker = source.indexOf('/* CrewCheck v', markerIndex + CSS_MARKER.length);
  const prefix = source.slice(0, markerIndex).trimEnd();
  const suffix = nextCrewCheckMarker >= 0 ? source.slice(nextCrewCheckMarker).trimStart() : '';
  return `${prefix}${prefix ? '\n\n' : ''}${flyDeckCss}${suffix ? `\n\n${suffix}` : '\n'}`;
}

if (process.env.CREWCHECK_V14353_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', (source) => patchFlyDeckHomeV14353(source)
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(
      /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
      `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: briefing operacional Premium, direto e vinculado à escala oficial';`,
    ));
  update('client/src/index.css', installFlyDeckPremiumCssV14353);
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
    notes: 'FlyDeck Premium com briefing vivo, próxima programação concisa, ações operacionais e confirmação da escala oficial.',
  }, null, 2)}\n`, { optional: true });
  update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
  update('server.mjs', (source) => source
    .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`), { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - concise premium pre-program briefing with official-roster guardrail`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.53:flydeck-premium-briefing'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-53-flydeck-premium-briefing.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140353')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14353] CrewCheck ${VERSION}: FlyDeck Premium com briefing operacional conciso e fonte oficial protegida.`);
}
