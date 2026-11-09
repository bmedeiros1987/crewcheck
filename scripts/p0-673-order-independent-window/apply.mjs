import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
const marker = 'P0_673_ORDER_INDEPENDENT_ROSTER_WINDOW';
const historyEvent = 'crewcheck:roster-history-updated';

if (!fs.existsSync(path)) throw new Error(`[${marker}] Home.tsx ausente`);
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('openRosterDisplayWindow')) {
  throw new Error(`[${marker}] requer a janela histórica #662/#664 já materializada`);
}

if (!source.includes(marker)) {
  const before = `  const [rosterWindow, setRosterWindow] = useState<CrewRoster>(() => bundle.roster);
  useEffect(() => {
    let alive = true;
    const refreshRosterWindow = () => {
      const primary = bundle.roster;
      setRosterWindow(primary);
      void openRosterDisplayWindow(primary)
        .then((windowRoster) => { if (alive) setRosterWindow(windowRoster); })
        .catch(() => { if (alive) setRosterWindow(primary); });
    };
    refreshRosterWindow();
    window.addEventListener('${historyEvent}', refreshRosterWindow);
    return () => {
      alive = false;
      window.removeEventListener('${historyEvent}', refreshRosterWindow);
    };
  }, [bundle.roster]);`;

  const after = `  const [rosterWindow, setRosterWindow] = useState<CrewRoster>(() => bundle.roster);
  const rosterWindowRequestRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const refreshRosterWindow = () => {
      const primary = bundle.roster;
      const requestId = ++rosterWindowRequestRef.current;
      void openRosterDisplayWindow(primary)
        .then((windowRoster) => {
          if (alive && requestId === rosterWindowRequestRef.current) setRosterWindow(windowRoster);
        })
        .catch(() => {
          if (alive && requestId === rosterWindowRequestRef.current) setRosterWindow(primary);
        });
    };
    refreshRosterWindow();
    window.addEventListener('${historyEvent}', refreshRosterWindow);
    return () => {
      alive = false;
      rosterWindowRequestRef.current += 1;
      window.removeEventListener('${historyEvent}', refreshRosterWindow);
    };
  }, [bundle.roster]);`;

  if (!source.includes(before)) throw new Error(`[${marker}] bloco de refresh #664 não localizado`);
  source = source.replace(before, after);

  const saveCall = `saveRosterAnalysis({ roster, compliance: newCompliance, gym: newGym, sourceFileName: file.name } as any),`;
  const saveWithSettledRefresh = `saveRosterAnalysis({ roster, compliance: newCompliance, gym: newGym, sourceFileName: file.name } as any).finally(() => {
          // databaseClient emits a history event during persistence, while React can
          // still hold the previous active bundle. Rebuild once more on the next task
          // after the new competence has settled into the UI bundle.
          window.setTimeout(() => {
            try { window.dispatchEvent(new CustomEvent('${historyEvent}')); } catch {}
          }, 0);
        }),`;
  if (!source.includes(saveCall)) throw new Error(`[${marker}] chamada de persistência da importação não localizada`);
  source = source.replace(saveCall, saveWithSettledRefresh);

  const anchor = 'const DEFAULT_VERSION =';
  const idx = source.indexOf(anchor);
  if (idx < 0) throw new Error(`[${marker}] âncora de versão ausente`);
  source = `${source.slice(0, idx)}// ${marker}: never publish a partial/stale historical window; import order is irrelevant.\n${source.slice(idx)}`;
}

for (const fragment of [
  marker,
  'const rosterWindowRequestRef = useRef(0);',
  'const requestId = ++rosterWindowRequestRef.current;',
  'requestId === rosterWindowRequestRef.current',
  `.finally(() => {`,
  `window.dispatchEvent(new CustomEvent('${historyEvent}'))`,
]) {
  if (!source.includes(fragment)) throw new Error(`[${marker}] contrato ausente: ${fragment}`);
}

const refreshStart = source.indexOf('const refreshRosterWindow = () => {');
const openStart = source.indexOf('void openRosterDisplayWindow(primary)', refreshStart);
if (refreshStart < 0 || openStart < 0) throw new Error(`[${marker}] refresh materializado não localizado`);
const preOpenSlice = source.slice(refreshStart, openStart);
if (preOpenSlice.includes('setRosterWindow(primary);')) {
  throw new Error(`[${marker}] refresh ainda encolhe a Escala antes da materialização histórica`);
}

// Presentation-only provenance. Keep the original loader, visual window and
// startup account/token fences intact; failed/cancelled reads never reactivate it.
if (source.includes('function acceptBrowserRadarWindow(') && !source.includes('P0_673_RADAR_PRESENTATION_WINDOW')) {
  const start = source.indexOf('  const [rosterWindow, setRosterWindow]');
  const end = source.indexOf('  }, [bundle.roster]);', start);
  if (start < 0 || end < start) throw new Error(`[${marker}] browser window effect absent`);
  let block = source.slice(start, end);
  const replace = (before, after) => {
    if (!block.includes(before)) throw new Error(`[${marker}] browser window anchor absent: ${before}`);
    block = block.replace(before, after);
  };
  replace('    let alive = true;', '    let alive = true;\n    let lastBrowserWindowRead: ReturnType<typeof invalidateBrowserRadarWindow> | null = null;');
  replace('      void openRosterDisplayWindow(primary)', `      // P0_673_RADAR_PRESENTATION_WINDOW: revoke before awaiting any publication.
      const browserWindowRead = invalidateBrowserRadarWindow(primary, JSON.stringify(primary));
      lastBrowserWindowRead = browserWindowRead;
      void openRosterDisplayWindow(primary)`);
  replace('        .then((windowRoster) => {', `        .then((windowRoster) => {
          if (alive && requestId === rosterWindowRequestRef.current) acceptBrowserRadarWindow(browserWindowRead, windowRoster);`);
  replace('      rosterWindowRequestRef.current += 1;', `      rosterWindowRequestRef.current += 1;
      if (lastBrowserWindowRead === browserRadarContext) invalidateBrowserRadarWindow(bundle.roster, JSON.stringify(bundle.roster));`);
  source = source.slice(0, start) + block + source.slice(end);
  const activeOnly = "  setBrowserRadarContext(alertRosterOwned(bundle.roster)?rosterReadRevision:'');";
  if (!source.includes(activeOnly)) throw new Error(`[${marker}] browser active-only revision anchor absent`);
  source = source.replace(activeOnly, '  syncBrowserRadarWindow(bundle.roster, rosterReadRevision);');
}

fs.writeFileSync(path, source, 'utf8');
console.log(`[${marker}] refresh histórico monotônico e pós-persistência aplicado.`);
