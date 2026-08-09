import fs from 'node:fs';

const VERSION = '14.3.93';
const homeFile = 'client/src/pages/Home.tsx';
const rosterFile = 'client/src/components/v1391/RosterLaunchView.tsx';

for (const file of [homeFile, rosterFile]) {
  if (!fs.existsSync(file)) throw new Error(`[v14393] arquivo ausente: ${file}`);
}

let home = fs.readFileSync(homeFile, 'utf8');
const syncMarker = "const reconcileActiveRoster = async (reason: 'mount' | 'focus' | 'visible' | 'interval') =>";
if (!home.includes(syncMarker)) {
  const legacyEffect = /\n\s*useEffect\(\(\) => \{\n\s*\/\/ A escala ativa pertence à conta, não ao cache deste dispositivo\.[\s\S]*?\n\s*\}, \[\]\);/;
  if (!legacyEffect.test(home)) throw new Error('[v14393] efeito legado de escala ativa não encontrado.');
  legacyEffect.lastIndex = 0;
  const replacement = `
  useEffect(() => {
    // A escala ativa pertence à conta, não ao cache deste dispositivo.
    let alive = true;
    let syncing = false;

    const reconcileActiveRoster = async (reason: 'mount' | 'focus' | 'visible' | 'interval') => {
      if (!alive || syncing) return;
      syncing = true;
      try {
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
      } catch {
        console.warn('[crewcheck:active-roster-sync]', { reason, changed: false, status: 'unavailable' });
      } finally {
        syncing = false;
      }
    };

    void reconcileActiveRoster('mount');
    const onFocus = () => { void reconcileActiveRoster('focus'); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reconcileActiveRoster('visible');
    };
    const intervalId = window.setInterval(() => { void reconcileActiveRoster('interval'); }, 60000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bundle.roster]);`;
  home = home.replace(legacyEffect, replacement);
}

for (const required of [syncMarker, 'rosterFingerprint(active.roster)', "window.addEventListener('focus'", "document.addEventListener('visibilitychange'", '60000']) {
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
  if (!roster.includes(hotelActionOld)) throw new Error('[v14393] ação legada de hotel não encontrada.');
  roster = roster.replace(hotelActionOld, hotelActionNew);
}

if (!roster.includes("return 'Descanso na base';")) throw new Error('[v14393] rótulo humano de descanso na base ausente.');
if (roster.includes('Descanso publicado${code ?')) throw new Error('[v14393] código técnico ainda pode vazar no descanso.');
fs.writeFileSync(rosterFile, roster, 'utf8');

console.log(`[v14393] CrewCheck ${VERSION}: escala ativa reconcilia entre canais e descanso na base usa linguagem humana.`);
