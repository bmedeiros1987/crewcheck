import fs from 'node:fs';

const VERSION = '14.3.93';
const homeFile = 'client/src/pages/Home.tsx';
const rosterFile = 'client/src/components/v1391/RosterLaunchView.tsx';
const databaseFile = 'client/src/lib/databaseClient.ts';
const offlineFile = 'client/src/lib/offlineSync.ts';

for (const file of [homeFile, rosterFile, databaseFile, offlineFile]) {
  if (!fs.existsSync(file)) throw new Error(`[v14393] arquivo ausente: ${file}`);
}

// Mobile P0: local-first persistence is only durable across reinstall once a later
// online opportunity can observe that cloud persistence failed. Keep the local copy,
// but propagate authenticated network failures so offlineSync can retry them.
let database = fs.readFileSync(databaseFile, 'utf8');
const localFallbackOld = `  try {
    const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
      method: 'POST',
      body: JSON.stringify(onlinePayload),
    });
    return result.roster || localSummary;
  } catch {
    return localSummary;
  }`;
const localFallbackNew = `  try {
    const result = await jsonFetch<{ ok: boolean; roster: SavedRosterSummary }>('/api/rosters', {
      method: 'POST',
      body: JSON.stringify(onlinePayload),
    });
    return result.roster || localSummary;
  } catch (error) {
    (error as any).localSummary = localSummary;
    throw error;
  }`;
if (!database.includes('(error as any).localSummary = localSummary;')) {
  if (!database.includes(localFallbackOld)) throw new Error('[v14393] fallback local de saveRosterAnalysis não encontrado.');
  database = database.replace(localFallbackOld, localFallbackNew);
}
fs.writeFileSync(databaseFile, database, 'utf8');

// The roster POST is account-active. Replaying newest first would end with an older
// publication active. Replay oldest -> newest so the last user import remains the
// final account truth after reconnection.
let offline = fs.readFileSync(offlineFile, 'utf8');
const retryQueueOld = '  const queue = [...readQueue(), ...backfill];';
const retryQueueNew = `  const queue = [...readQueue(), ...backfill]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));`;
if (!offline.includes(".sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));")) {
  if (!offline.includes(retryQueueOld)) throw new Error('[v14393] fila offline de escalas não encontrada.');
  offline = offline.replace(retryQueueOld, retryQueueNew);
}
fs.writeFileSync(offlineFile, offline, 'utf8');

let home = fs.readFileSync(homeFile, 'utf8');
const authImportOld = "import { authFetch, getStoredUser, logout } from '@/lib/authClient';";
const authImportNew = "import { authFetch, getStoredUser, getToken, logout } from '@/lib/authClient';";
if (!home.includes(authImportNew)) {
  if (!home.includes(authImportOld)) throw new Error('[v14393] import de autenticação do Home não encontrado.');
  home = home.replace(authImportOld, authImportNew);
}
const databaseImport = "import { saveRosterAnalysis, listSavedRosters, openSavedRoster, openActiveRoster, getDatabaseStatus } from '@/lib/databaseClient';";
const offlineImport = "import { syncPendingRosters } from '@/lib/offlineSync';";
if (!home.includes(offlineImport)) {
  if (!home.includes(databaseImport)) throw new Error('[v14393] import de databaseClient do Home não encontrado.');
  home = home.replace(databaseImport, `${databaseImport}\n${offlineImport}`);
}

const syncMarker = "const reconcileActiveRoster = async (reason: 'mount' | 'focus' | 'visible' | 'online' | 'interval') =>";
if (!home.includes(syncMarker)) {
  const legacyEffect = /\n\s*useEffect\(\(\) => \{\n\s*\/\/ A escala ativa pertence à conta, não ao cache deste dispositivo\.[\s\S]*?\n\s*\}, \[\]\);/;
  if (!legacyEffect.test(home)) throw new Error('[v14393] efeito legado de escala ativa não encontrado.');
  legacyEffect.lastIndex = 0;
  const replacement = `
  useEffect(() => {
    // A escala ativa pertence à conta, não ao cache deste dispositivo.
    let alive = true;
    let syncing = false;

    const reconcileActiveRoster = async (reason: 'mount' | 'focus' | 'visible' | 'online' | 'interval') => {
      if (!alive || syncing) return;
      syncing = true;
      try {
        if (getToken()) {
          const pendingSync = await syncPendingRosters().catch(() => ({ synced: 0, remaining: 0, errors: [] }));
          if (pendingSync.synced > 0) {
            console.info('[crewcheck:active-roster-sync]', { reason, status: 'local-history-uploaded', synced: pendingSync.synced, remaining: pendingSync.remaining });
          }
        }
        const active = await openActiveRoster();
        if (!alive || !active?.roster?.days?.length) return;

        const serverRevision = rosterFingerprint(active.roster);
        const hasLocalRoster = Array.isArray(bundle.roster.days) && bundle.roster.days.length > 0;
        const localRevision = hasLocalRoster ? rosterFingerprint(bundle.roster) : '';
        if (serverRevision === localRevision) return;

        const compliance = active.compliance || analyzeSafe(active.roster);
        saveRoster(active.roster, 'Escala ativa sincronizada');
        setBundle({ roster: active.roster, compliance, source: 'Escala ativa sincronizada' });
        console.info('[crewcheck:active-roster-sync]', { reason, changed: true, localRevision: localRevision || null, serverRevision });
      } catch (error: any) {
        const code = String(error?.code || '').toUpperCase();
        const remote = code === 'ACTIVE_ROSTER_CONFLICT' ? error?.remoteCandidate : null;
        if (alive && remote?.roster?.days?.length) {
          const remoteRevision = rosterFingerprint(remote.roster);
          const hasLocalRoster = Array.isArray(bundle.roster.days) && bundle.roster.days.length > 0;
          const localRevision = hasLocalRoster ? rosterFingerprint(bundle.roster) : '';
          if (remoteRevision !== localRevision) {
            // Keep the displaced same-period publication available to the
            // existing planned-vs-current comparison before account truth wins.
            preservePlannedRosterBeforeImport(bundle, remote.roster);
            const compliance = remote.compliance || analyzeSafe(remote.roster);
            saveRoster(remote.roster, 'Escala ativa sincronizada');
            setBundle({ roster: remote.roster, compliance, source: 'Escala ativa sincronizada' });
            console.info('[crewcheck:active-roster-sync]', {
              reason,
              changed: true,
              status: 'account-conflict-reconciled',
              localRevision: localRevision || null,
              serverRevision: remoteRevision,
            });
          }
          return;
        }
        console.warn('[crewcheck:active-roster-sync]', { reason, changed: false, status: 'unavailable', code: code || null });
      } finally {
        syncing = false;
      }
    };

    void reconcileActiveRoster('mount');
    const onFocus = () => { void reconcileActiveRoster('focus'); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcileActiveRoster('visible');
    };
    const onOnline = () => { void reconcileActiveRoster('online'); };
    const intervalId = window.setInterval(() => { void reconcileActiveRoster('interval'); }, 60000);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bundle.roster]);`;
  home = home.replace(legacyEffect, replacement);
}

for (const required of [
  syncMarker,
  'rosterFingerprint(active.roster)',
  "window.addEventListener('focus'",
  "window.addEventListener('online'",
  "document.addEventListener('visibilitychange'",
  '60000',
  authImportNew,
  offlineImport,
  'if (getToken()) {',
  "await syncPendingRosters().catch(() => ({ synced: 0, remaining: 0, errors: [] }));",
]) {
  if (!home.includes(required)) throw new Error(`[v14393] contrato de sincronização ausente: ${required}`);
}
fs.writeFileSync(homeFile, home, 'utf8');

let roster = fs.readFileSync(rosterFile, 'utf8');

const restTitleOld = `  if (mode === 'rest') {\n    if (/(DO|DOF|DOP|OFF)/.test(code)) return \`Folga publicada\${code ? \` · \${code}\` : ''}\`;\n    return \`Descanso publicado\${code ? \` · \${code}\` : ''}\`;\n  }`;
const restTitleNew = `  if (mode === 'rest') {\n    if (/DESCANSO_BASE_CONTINUIDADE/.test(code)) return 'Descanso na base';\n    if (/(DO|DOF|DOP|OFF)/.test(code)) return \`Folga publicada\${code ? \` · \${code}\` : ''}\`;\n    return 'Descanso publicado';\n  }`;
if (!roster.includes("return 'Descanso na base';")) {
  if (!roster.includes(restTitleOld)) throw new Error('[v14393] título legado de descanso não encontrado.');
  roster = roster.replace(restTitleOld, restTitleNew);
}

const restSummaryOld = `{mode === 'rest' && <p className="cc-roster-summary-v1397">{event.subtitle || 'Código e dia preservados conforme a escala publicada.'}</p>}`;
const restSummaryNew = `{mode === 'rest' && <p className="cc-roster-summary-v1397">{atBase ? 'Período de descanso na base entre programações.' : event.subtitle || 'Descanso preservado conforme a escala publicada.'}</p>}`;
if (!roster.includes('Período de descanso na base entre programações.')) {
  if (!roster.includes(restSummaryOld)) throw new Error('[v14393] resumo legado de descanso não encontrado.');
  roster = roster.replace(restSummaryOld, restSummaryNew);
}

const hotelChipOld = `{event.hotel && <span><Hotel/> {event.hotel}</span>}`;
const hotelChipNew = `{event.hotel && !atBase && <span><Hotel/> {event.hotel}</span>}`;
if (!roster.includes('event.hotel && !atBase')) {
  if (!roster.includes(hotelChipOld)) throw new Error('[v14393] chip legado de hotel não encontrado.');
  roster = roster.replace(hotelChipOld, hotelChipNew);
}

const hotelActionOld = `{(mode === 'stay' || event.hotel) && <button type="button" onClick={() => setView('presentation')}><Building2/> Hotel e apresentação</button>}`;
const hotelActionNew = `{(mode === 'stay' || event.hotel) && !atBase && <button type="button" onClick={() => setView('presentation')}><Building2/> Hotel e apresentação</button>}`;
if (!roster.includes("(mode === 'stay' || event.hotel) && !atBase")) {
  if (!roster.includes(hotelActionOld)) throw new Error('[v14393] ação legada de hotel não encontrado.');
  roster = roster.replace(hotelActionOld, hotelActionNew);
}

if (!roster.includes("return 'Descanso na base';")) throw new Error('[v14393] rótulo humano de descanso na base ausente.');
if (roster.includes('Descanso publicado${code ?')) throw new Error('[v14393] código técnico ainda pode vazar no descanso.');
fs.writeFileSync(rosterFile, roster, 'utf8');

console.log(`[v14393] CrewCheck ${VERSION}: escala local pendente sobe antes da verdade ativa da conta; reconexão entre canais e descanso na base permanecem canônicos.`);
