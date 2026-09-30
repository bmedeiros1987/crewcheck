import fs from 'node:fs';

const VERSION = '14.4.11';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const TAG = '[v14411]';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`${TAG} Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`${TAG} Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${TAG} Bloco ausente: ${label}`);
  return source.replace(before, after);
}

function patchHome(source) {
  let next = source;

  const canonicalImport = "import { buildCanonicalRosterEvents, normalizeRosterDays, selectNextRosterEvent, rosterCounters, type CanonicalRosterEvent } from '@/lib/canonicalRoster';";
  const integrityImport = "import { auditRosterIntegrity, rosterIntegrityBlockingSummary } from '@/lib/rosterIntegrityGuard';";
  next = insertAfterRequired(next, canonicalImport, integrityImport, 'import do Roster Integrity Guard');

  if (!next.includes('integrityBlocked?: boolean;')) {
    next = replaceRequired(
      next,
      "  periodLabel: string;\n};",
      "  periodLabel: string;\n  integrityBlocked?: boolean;\n  integrityIssueCount?: number;\n};",
      'campos do ImportGuardianDecision',
    );
  }

  const confirmAnchor = "  const confirmed = await requestCrewCheckImportConfirmation(decision);";
  const integrityGate = `  const integrity = auditRosterIntegrity(roster);
  if (!integrity.ok) {
    return {
      ...decision,
      ok: false,
      integrityBlocked: true,
      integrityIssueCount: integrity.blockers.length,
      summaryText: rosterIntegrityBlockingSummary(integrity),
      toastText: 'Escala não ativada: divergência de integridade entre a fonte publicada e a linha temporal.',
    };
  }

${confirmAnchor}`;
  if (!next.includes('const integrity = auditRosterIntegrity(roster);')) {
    next = replaceRequired(next, confirmAnchor, integrityGate, 'gate fail-closed antes da ativação');
  }

  const telegramBefore = "      if (!decision.ok) return;\n      const compliance = saveRoster(roster, source);";
  const telegramAfter = "      if (!decision.ok) {\n        if (decision.integrityBlocked) toast.error(decision.toastText || 'Escala não ativada por divergência de integridade.');\n        return;\n      }\n      const compliance = saveRoster(roster, source);";
  if (next.includes(telegramBefore)) next = next.replace(telegramBefore, telegramAfter);

  const pdfBefore = "      if (!decision.ok) {\n        toast.message('Importação cancelada. Sua escala ativa foi preservada.');\n        return;\n      }";
  const pdfAfter = "      if (!decision.ok) {\n        if (decision.integrityBlocked) toast.error(decision.toastText || 'Escala não ativada por divergência de integridade.');\n        else toast.message('Importação cancelada. Sua escala ativa foi preservada.');\n        return;\n      }";
  if (next.includes(pdfBefore)) next = next.replace(pdfBefore, pdfAfter);

  next = next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Roster Integrity Guard fail-closed para APZ, virada de data e continuidade de jornada';`);

  for (const required of [
    integrityImport,
    'integrityBlocked?: boolean;',
    'const integrity = auditRosterIntegrity(roster);',
    'rosterIntegrityBlockingSummary(integrity)',
    "toastText: 'Escala não ativada: divergência de integridade entre a fonte publicada e a linha temporal.'",
  ]) {
    if (!next.includes(required)) throw new Error(`${TAG} contrato ausente em Home: ${required}`);
  }
  return next;
}

update('client/src/pages/Home.tsx', patchHome);

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });

update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });

update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source
  .replace(/version:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`), { optional: true });

update('client/public/manifest.json', (source) => {
  const manifest = JSON.parse(source);
  manifest.version = VERSION;
  manifest.start_url = `/?source=pwa&v=${VERSION}`;
  for (const icon of manifest.icons || []) icon.src = String(icon.src || '').replace(/\?v=[^&]+/, `?v=${VERSION_DIGITS}`);
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) icon.src = String(icon.src || '').replace(/\?v=[^&]+/, `?v=${VERSION_DIGITS}`);
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}, { optional: true });

update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Hotfix P0: Roster Integrity Guard bloqueia ativação quando APZ publicada, virada de meia-noite ou continuidade de jornada divergem da linha temporal canônica.',
}, null, 2)}\n`, { optional: true });

update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=[^"'&]+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=[^"'&]+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });

update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });

update('server/platform.mjs', (source) => source
  .replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`)
  .replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });

update('server.mjs', (source) => source
  .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`)
  .replace(/(app\s*:\s*'CrewCheck',\s*version\s*:\s*)'[^']+'/g, `$1'${VERSION}'`), { optional: true });

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - P0 roster integrity guard and canonical midnight continuity hotfix`;
  data.scripts ||= {};
  data.scripts['regression:v14.4.11:roster-integrity'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-4-11-roster-integrity-guard.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`${TAG} CrewCheck ${VERSION}: Roster Integrity Guard fail-closed + versão de correção materializados.`);
