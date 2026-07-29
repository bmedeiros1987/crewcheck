import fs from 'node:fs';

const VERSION = '14.3.50';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14350] Arquivo ausente: ${path}`);
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
  if (!matched) throw new Error(`[v14350] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${withEol(value, eol)}`);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14350] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${withEol(value, eol)}${eol}${matched}`);
}

function replaceRequired(source, before, after, label) {
  if (variants(after.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(before).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14350] Bloco ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, withEol(after, eol));
}

function replaceRegexRequired(source, pattern, after, sentinel, label) {
  if (source.includes(sentinel)) return source;
  if (!pattern.test(source)) throw new Error(`[v14350] Bloco ausente: ${label}`);
  pattern.lastIndex = 0;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(pattern, withEol(after, eol));
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(
      /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
      `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Folga, descanso, pernoite e programação com classificação única na interface';`,
    );

  next = insertAfterRequired(
    next,
    "import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';",
    "import { countScheduleCategories, isRestScheduleActivity, isSmartDepartureEligible } from '@/lib/scheduleActivityClassification';",
    'import da classificação de atividades',
  );

  next = replaceRequired(
    next,
    `  const flights = events.filter((event) => event.kind === 'flight').length;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;
  const activities = events.filter((event) => event.kind !== 'flight' && event.canonical?.kind !== 'rest').length;
  const rest = events.filter((event) => event.canonical?.kind === 'rest').length;`,
    `  const scheduleCounts = countScheduleCategories(events);
  const flights = scheduleCounts.flights;
  const days = Array.isArray(roster.days) ? roster.days.length : 0;`,
    'contadores do resumo de importação',
  );

  next = replaceRequired(
    next,
    `    \`Voos: \${flights}\`,
    \`Atividades: \${activities}\`,
    \`Folgas/descanso: \${rest}\`,`,
    `    \`Programações: \${scheduleCounts.programming} (\${flights} voos e \${scheduleCounts.nonFlightProgramming} outras atividades)\`,
    \`Folgas: \${scheduleCounts.daysOff}\`,
    \`Descansos: \${scheduleCounts.recoveryRest}\`,
    \`Pernoites: \${scheduleCounts.overnights}\`,`,
    'resumo humano de Folga e Programação',
  );

  next = replaceRequired(
    next,
    `function isOperationalEvent(event: ZeroLeg) {
  if (event.placeholder) return false;
  if (event.canonical?.kind === 'rest') return false;
  const code = \`\${event.flightNumber} \${(event.day as any)?.type || ''} \${(event.day as any)?.pairingCode || ''}\`.toUpperCase();
  if (/(^|\\s)(DO|DOF|DOP|OFF|FOLGA|FÉRIAS|FERIAS|EAD)(\\s|$)/.test(code)) return false;
  if (code.includes('SOBREAVISO') && !/(VOO|RESERVA|ACION|CHAMAD|LA\\d+)/.test(code)) return false;
  return ['flight', 'duty', 'stay'].includes(event.kind);
}`,
    `function isOperationalEvent(event: ZeroLeg) {
  return isSmartDepartureEligible(event);
}`,
    'elegibilidade da Saída Inteligente',
  );

  next = replaceRegexRequired(
    next,
    /  const counters = loaded && events\[0\]\?\.day \? \{[\s\S]*?\n  \} : \{ days: 0, flights: 0, activities: 0, rest: 0 \};/,
    `  const scheduleCounts = countScheduleCategories(events);
  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((item) => item.day.date)).size,
    flights: scheduleCounts.flights,
    programming: scheduleCounts.programming,
    daysOff: scheduleCounts.daysOff,
    recoveryRest: scheduleCounts.recoveryRest,
  } : { days: 0, flights: 0, programming: 0, daysOff: 0, recoveryRest: 0 };`,
    'programming: scheduleCounts.programming',
    'contadores do FlyDeck',
  );

  next = replaceRequired(
    next,
    `title="Atividades" value={String(counters.activities)} detail={\`Folgas \${counters.rest}\`}`,
    `title="Programações" value={String(counters.programming)} detail={\`\${counters.daysOff} folga(s) · \${counters.recoveryRest} descanso(s)\`}`,
    'KPI de Programações',
  );

  next = insertBeforeRequired(
    next,
    'function rosterEventTitle(event: ZeroLeg): string {',
    `function rosterDayCountLabel(dayEvents: ZeroLeg[]): string {
  const counts = countScheduleCategories(dayEvents);
  if (counts.flights > 0) return counts.flights === 1 ? '1 voo' : \`\${counts.flights} voos\`;
  if (counts.daysOff > 0) return counts.daysOff === 1 ? 'Folga' : \`\${counts.daysOff} folgas\`;
  if (counts.recoveryRest > 0) return counts.recoveryRest === 1 ? 'Descanso' : \`\${counts.recoveryRest} descansos\`;
  if (counts.overnights > 0) return counts.overnights === 1 ? 'Pernoite' : \`\${counts.overnights} pernoites\`;
  if (counts.nonFlightProgramming > 0) {
    return counts.nonFlightProgramming === 1 ? '1 atividade' : \`\${counts.nonFlightProgramming} atividades\`;
  }
  return 'Sem programação operacional';
}`,
    'rótulo de contagem por dia',
  );

  next = replaceRequired(
    next,
    `<span className="cz-roster-icon">{e.kind === 'flight' ? <Plane/> : e.kind === 'stay' ? <Hotel/> : <BriefcaseBusiness/>}</span>`,
    `<span className="cz-roster-icon">{isRestScheduleActivity(e) ? <Moon/> : e.kind === 'flight' ? <Plane/> : e.kind === 'stay' ? <Hotel/> : <BriefcaseBusiness/>}</span>`,
    'ícone próprio de Folga e Descanso',
  );

  next = replaceRequired(
    next,
    `<small>{dayEvents.filter(e => e.kind === 'flight').length ? \`Voos \${dayEvents.filter(e => e.kind === 'flight').length}\` : 'Dia sem voo operacional'}</small>`,
    `<small>{rosterDayCountLabel(dayEvents)}</small>`,
    'contagem dos dias publicados',
  );

  return next;
});

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
  notes: 'Folga, descanso e pernoite ficam fora da contagem de programações e não acionam a Saída Inteligente.',
}, null, 2)}\n`, { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - unified UI classification for programming, days off, recovery rest and overnights`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.50:p0-activity-classification'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-50-p0-activity-classification.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140350')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`[v14350] CrewCheck ${VERSION}: classificação única de programação, folga, descanso e pernoite.`);
