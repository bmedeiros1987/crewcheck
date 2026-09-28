import fs from 'node:fs';

const VERSION = '14.3.3';
const MARKER = 'crewcheck-release-recovery-v1433';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1433] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1433] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

function patchRegulationSource(source) {
  return source
    .replace(
      "  return minutes === null ? DEFAULT_FORM.startTime : simpleClock(minutes - 60);",
      "  return minutes === null ? '' : simpleClock(minutes - 60);",
    )
    .replace(
      "  return minutes === null ? DEFAULT_FORM.plannedEndTime : simpleClock(minutes + 30);",
      "  return minutes === null ? '' : simpleClock(minutes + 30);",
    )
    .replace(
      "  const scheduleSignature = [scheduleDay?.date, dayCode(scheduleDay), scheduleDay?.dutyReport, scheduleDay?.dutyDebrief, scheduleDay?.legs?.length].join('|');",
      "  const scheduleSignature = JSON.stringify([scheduleDay?.date, dayCode(scheduleDay), scheduleDay?.dutyReport, scheduleDay?.dutyDebrief, (scheduleDay?.legs || []).map((leg) => [leg.departureTime, leg.arrivalTime, leg.duration])]);",
    );
}

function patchSecurityHeaders(source) {
  return source
    .replace(
      "\"script-src 'self' 'unsafe-inline'\"",
      "\"script-src 'self' 'unsafe-inline' https://accounts.google.com\"",
    )
    .replace(
      "\"frame-src 'self' https://www.google.com https://maps.google.com\"",
      "\"frame-src 'self' https://accounts.google.com https://www.google.com https://maps.google.com\"",
    )
    .replace(
      "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');",
      "res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');",
    );
}

function patchRegulationServer(source) {
  const oldNatural = `  if (/^\\/(?:regulamentacao|regulamentação|regulacao|regulação)(?:@\\S+)?\\b/i.test(value) || /\\b(at[eé] que horas (?:vai|vai minha|termina).{0,24}regulamenta[cç][aã]o|hor[aá]rio do corte|fim da jornada)\\b/i.test(lower)) return conciergeRegulationReply(snapshot);`;
  const newNatural = `  if (/^\\/(?:regulamentacao|regulamentação|regulacao|regulação)(?:@\\S+)?\\b/i.test(value) || /\\b(at[eé] que horas (?:vai|vai minha|termina).{0,24}regulamenta[cç][aã]o|hor[aá]rio do corte|fim da jornada|que horas termina (?:minha )?jornada|qual (?:[eé] )?(?:o )?(?:meu )?limite (?:de )?regulamenta[cç][aã]o)\\b/i.test(lower)) return conciergeRegulationReply(snapshot);`;
  return source
    .replace(
      '  const startText = conciergePresentationTime(record) || record.startTime;',
      '  const startText = conciergePresentationTime(record);',
    )
    .replace(
      '  if (!firstDeparture) return record.startTime;',
      "  if (!firstDeparture) return '';",
    )
    .replace(
      '  const presentationDate = conciergeProgramDate(record.day, presentation || record.startTime);',
      "  if (!presentation) return `${conciergeProgramTitle(record)} · ${conciergeDateLabel(record)}\\nApresentação a confirmar. A saída inteligente será calculada assim que a escala publicar o horário.`;\n  const presentationDate = conciergeProgramDate(record.day, presentation);",
    )
    .replace(oldNatural, newNatural);
}

update('client/src/components/v1432/ManualRegulationView.tsx', (source) => {
  const next = patchRegulationSource(source);
  if (!next.includes("return minutes === null ? '' : simpleClock(minutes - 60)") || !next.includes('JSON.stringify([scheduleDay?.date')) {
    throw new Error('[v1433] Regulamentação ainda inventa horário quando a escala não publicou dados.');
  }
  return next;
});

update('scripts/v1432/server-regulation.snippet', (source) => {
  const next = patchRegulationServer(source);
  if (next.includes('conciergePresentationTime(record) || record.startTime')) {
    throw new Error('[v1433] Snippet do Telegram ainda usa horário sintético.');
  }
  return next;
});

update('scripts/v1432/security-headers.snippet', (source) => {
  const next = patchSecurityHeaders(source);
  if (!next.includes('https://accounts.google.com') || !next.includes('same-origin-allow-popups')) {
    throw new Error('[v1433] CSP não recebeu compatibilidade segura com Google Identity.');
  }
  return next;
});

update('server/platform.mjs', (source) => {
  let next = source;
  const entry = `export async function handlePlatformRoute(req, res, url) {
  const legacy = url.pathname === '/api/db/status' || url.pathname === '/api/stats' || url.pathname === '/api/rosters' || url.pathname.startsWith('/api/rosters/');
  if (!url.pathname.startsWith('/api/platform/') && !legacy) return false;
  if (!legacy && !enforcePlatformMethod(req, res, url.pathname)) return true;
  try {
    if (legacy) { await handleLegacyDatabase(req, res, url); return true; }`;
  const aliasEntry = `export async function handlePlatformRoute(req, res, url) {
  const asaasWebhookAlias = url.pathname === '/api/webhooks/asaas';
  const legacy = url.pathname === '/api/db/status' || url.pathname === '/api/stats' || url.pathname === '/api/rosters' || url.pathname.startsWith('/api/rosters/');
  if (!url.pathname.startsWith('/api/platform/') && !legacy && !asaasWebhookAlias) return false;
  if (!legacy && !asaasWebhookAlias && !enforcePlatformMethod(req, res, url.pathname)) return true;
  try {
    if (asaasWebhookAlias) { await handleAsaasWebhook(req, res); return true; }
    if (legacy) { await handleLegacyDatabase(req, res, url); return true; }`;
  next = required(next, entry, aliasEntry, 'alias autenticado do webhook Asaas');
  next = next.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`);
  if (!next.includes("url.pathname === '/api/webhooks/asaas'") || !next.includes('await handleAsaasWebhook(req, res)')) {
    throw new Error('[v1433] Alias do webhook Asaas não foi aplicado.');
  }
  return next;
});

update('server.mjs', (source) => {
  let next = patchRegulationServer(patchSecurityHeaders(source));
  next = next
    .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
    .replace(/CrewCheck \d+\.\d+\.\d+ - Safe Shell/g, `CrewCheck ${VERSION} - Safe Shell`)
    .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
    .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`);
  if (!next.includes('crewcheckLocationReplySender') || !next.includes('crewcheckSilentLocation')) {
    throw new Error('[v1433] Localização silenciosa e idempotente do Telegram não está presente.');
  }
  if (!next.includes('same-origin-allow-popups') || next.includes('conciergePresentationTime(record) || record.startTime') || next.includes('if (!firstDeparture) return record.startTime;')) {
    throw new Error('[v1433] Servidor não recebeu CSP/Telegram/regulamentação final.');
  }
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: build recuperado, webhook Asaas compatível e horários regulatórios somente quando publicados';`));

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));

update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`)
  .replace(/CREWCHECK V[^•<]+• PREMIUM BETA/g, `CREWCHECK V${VERSION} • PREMIUM BETA`));

update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140303')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

update('scripts/regression-v14-3-2-homologation.mjs', (source) => {
  let next = source;
  if (!next.includes("const currentVersion = JSON.parse(read('package.json')).version;")) {
    next = next.replace(
      "const apply1432 = read('scripts/v1432/apply.mjs');",
      "const apply1432 = read('scripts/v1432/apply.mjs');\nconst currentVersion = JSON.parse(read('package.json')).version;",
    );
  }
  return next
    .replace(
      "check('versão visual unificada', app.includes(\"crewcheck_last_loaded_version', '14.3.2'\") && auth.includes('data-version=\"14.3.2\"') && auth.includes('CREWCHECK V14.3.2'));",
      "check('versão visual unificada', app.includes(`crewcheck_last_loaded_version', '${currentVersion}'`) && auth.includes(`data-version=\"${currentVersion}\"`) && auth.includes(`CREWCHECK V${currentVersion}`));",
    )
    .replace(
      "check('versão do backend unificada', server.includes(\"version: '14.3.2'\") && !server.includes(\"version:'14.1.7'\") && !server.includes(\"version: '14.2.7'\"));",
      "check('versão do backend unificada', server.includes(`version: '${currentVersion}'`) && !server.includes(\"version:'14.1.7'\") && !server.includes(\"version: '14.2.7'\"));",
    );
}, { optional: true });

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - clean-build recovery, authenticated Asaas webhook alias and regulatory data integrity`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.3'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-3-release-recovery.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1433] CrewCheck ${VERSION}: ${MARKER}, build limpo recuperado, Asaas compatível, CSP Google segura e regulamentação sem horário inventado.`);
await import('../v1434/apply.mjs');
