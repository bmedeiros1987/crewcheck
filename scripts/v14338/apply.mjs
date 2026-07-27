import fs from 'node:fs';

const VERSION = '14.3.38';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14338] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14338] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14338] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

const localHistoryHelpers = `function localRosterPeriodIdentity(roster: CrewRoster): string {
  const crew = String(roster.crewId || roster.crewName || 'crew').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'crew';
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  return \`${'${crew}:${year}:${month}'}\`;
}
function localRosterHistorySummary(item: LocalHistoryItem): SavedRosterSummary {
  return {
    id: item.id,
    createdAt: item.createdAt,
    crewName: item.roster.crewName || null,
    crewId: item.roster.crewId || null,
    base: item.roster.base || null,
    rank: item.roster.rank || null,
    airline: item.roster.airline || null,
    year: Number(item.roster.year) || null,
    month: Number(item.roster.month) || null,
    sourceFileName: item.sourceFileName || null,
    score: Number(item.compliance?.score ?? 0),
    intensityScore: Number(item.compliance?.loadAnalysis?.intensityScore ?? 0),
    alertsCount: Array.isArray(item.compliance?.alerts) ? item.compliance.alerts.length : 0,
    criticalAlertsCount: Array.isArray(item.compliance?.alerts) ? item.compliance.alerts.filter((alert: any) => alert?.severity === 'error').length : 0,
    checksum: item.checksum,
    isActive: false,
    importStatus: 'local_history',
    storageReady: false,
  };
}
function persistRosterHistoryLocally(payload: SaveRosterPayload): SavedRosterSummary {
  const roster = payload.roster;
  const periodIdentity = localRosterPeriodIdentity(roster);
  const previousItems = readLocalHistory();
  const previous = previousItems.find((item) => localRosterPeriodIdentity(item.roster) === periodIdentity) || null;
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  const now = new Date().toISOString();
  const item: LocalHistoryItem = {
    id: previous?.id || \`local-\${safeStorageScope()}-\${year}-\${month}\`,
    checksum: String(payload.checksum || periodIdentity),
    createdAt: now,
    sourceFileName: payload.sourceFileName || previous?.sourceFileName || 'Escala oficial importada',
    roster,
    compliance: payload.compliance || ({ score: 0, alerts: [] } as any),
    gym: Array.isArray(payload.gym) ? payload.gym : [],
  };
  const merged = [
    item,
    ...previousItems.filter((candidate) => localRosterPeriodIdentity(candidate.roster) !== periodIdentity),
  ].slice(0, 72);
  try { localStorage.setItem(localHistoryKey(), JSON.stringify(merged)); } catch {}
  return localRosterHistorySummary(item);
}`;

update('client/src/lib/databaseClient.ts', (source) => {
  let next = insertBeforeRequired(source, 'export async function saveRosterAnalysis(payload: SaveRosterPayload): Promise<SavedRosterSummary> {', localHistoryHelpers, 'persistência mensal local');
  next = replaceRequired(
    next,
    `export async function saveRosterAnalysis(payload: SaveRosterPayload): Promise<SavedRosterSummary> {
  const onlinePayload = trimHeavyRosterBackupPayload(payload);
  const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
    method: 'POST',
    body: JSON.stringify(onlinePayload),
  });
  return result.roster;
}`,
    `export async function saveRosterAnalysis(payload: SaveRosterPayload): Promise<SavedRosterSummary> {
  const localSummary = persistRosterHistoryLocally(payload);
  if (!hasCrewCheckAuthToken()) return localSummary;
  const onlinePayload = trimHeavyRosterBackupPayload(payload);
  try {
    const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
      method: 'POST',
      body: JSON.stringify(onlinePayload),
    });
    return result.roster || localSummary;
  } catch {
    return localSummary;
  }
}`,
    'salvamento local antes da nuvem',
  );
  return next;
});

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: histórico mensal preservado e auditoria visual da Saída Inteligente';`);

  next = replaceRequired(
    next,
    `      const newCompliance = saveRoster(roster, file.name);
      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);`,
    `      const newCompliance = saveRoster(roster, file.name);
      const newGym = (() => { try { return getGymRecommendations(roster); } catch { return []; } })();
      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);`,
    'recomendações associadas à escala importada',
  );

  next = replaceRequired(
    next,
    `      syncRosterWithTelegramConcierge(roster, file.name).catch(() => undefined);
      syncPlatformRoster(roster, newCompliance, file.name).catch(() => toast.message('Escala salva neste dispositivo; a sincronização com o banco será tentada novamente.'));`,
    `      syncRosterWithTelegramConcierge(roster, file.name).catch(() => undefined);
      Promise.allSettled([
        saveRosterAnalysis({ roster, compliance: newCompliance, gym: newGym, sourceFileName: file.name } as any),
        syncPlatformRoster(roster, newCompliance, file.name),
      ]).then((results) => {
        if (results.every((result) => result.status === 'rejected')) toast.message('Escala preservada neste dispositivo; a sincronização com o banco será tentada novamente.');
      });`,
    'histórico automático em toda importação',
  );
  return next;
});

const departureAuditCss = `
/* CrewCheck v14.3.38 — auditoria visual da Saída Inteligente */
.cz-depart-hero {
  grid-template-areas:
    "eyebrow status"
    "when when"
    "time time"
    "route route"
    "detail detail"
    "warning warning" !important;
}
.cz-depart-when {
  grid-area: when;
  display: grid !important;
  gap: 5px;
  min-width: 0;
  margin: 2px 0 0;
}
.cz-depart-when > span {
  min-width: 0;
  font-size: clamp(.92rem, 3.4vw, 1.08rem) !important;
  font-weight: 800 !important;
  line-height: 1.35 !important;
  letter-spacing: .035em !important;
  text-transform: none !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}
.cz-depart-time {
  max-width: 100%;
  font-size: clamp(2.45rem, 13vw, 5.35rem) !important;
  line-height: .98 !important;
  letter-spacing: -.045em !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
}
.cz-depart-detail {
  grid-area: detail;
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
  gap: 9px !important;
  width: 100%;
  min-width: 0;
}
.cz-depart-detail > span {
  display: block !important;
  min-width: 0;
  padding: 11px 13px !important;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 15px;
  background: color-mix(in srgb, var(--cc-surface, #10233c) 88%, transparent);
  font-size: clamp(.82rem, 3.1vw, .98rem) !important;
  font-weight: 750 !important;
  line-height: 1.35 !important;
  letter-spacing: .025em !important;
  text-transform: none !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}
.cz-depart-warning,
.cz-depart-hero > .cz-mini-status {
  grid-area: warning !important;
  position: static !important;
  inset: auto !important;
  z-index: auto !important;
  width: 100%;
  min-width: 0;
  margin: 0 !important;
  padding: 13px 15px !important;
  border-radius: 16px;
  line-height: 1.45 !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}
.cz-depart-hero h2 {
  min-width: 0;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
}
@media (max-width: 720px) {
  .cz-departure { gap: 14px !important; }
  .cz-depart-hero {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-areas:
      "eyebrow"
      "status"
      "when"
      "time"
      "route"
      "detail"
      "warning" !important;
    gap: 12px !important;
    padding: 20px 18px !important;
  }
  .cz-depart-hero-head { display: contents !important; }
  .cz-depart-hero-head > span { grid-area: eyebrow; }
  .cz-depart-status {
    grid-area: status;
    justify-self: start !important;
    max-width: 100%;
    white-space: normal !important;
    text-align: left !important;
  }
  .cz-depart-detail { grid-template-columns: minmax(0, 1fr) !important; }
  .cz-depart-kpis { grid-template-columns: minmax(0, 1fr) !important; }
  .cz-depart-kpis > div { min-height: 92px !important; }
}
`;

update('client/src/components/v1406/premium-layout.css', (source) => source.includes('CrewCheck v14.3.38 — auditoria visual da Saída Inteligente') ? source : `${source.trimEnd()}\n${departureAuditCss}\n`);

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
fs.mkdirSync('client/public', { recursive: true });
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Histórico mensal preservado e Saída Inteligente sem sobreposição no Android.' }, null, 2)}\n`, 'utf8');

console.log(`[v14338] CrewCheck ${VERSION}: junho/julho/agosto permanecem no histórico e a Saída Inteligente respeita fluxo vertical, quebra de texto e largura mobile.`);
