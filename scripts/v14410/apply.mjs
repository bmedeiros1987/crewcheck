import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error('[v14410] Home.tsx ausente.');

const before = fs.readFileSync(homePath, 'utf8');
const marker = "import ContextualJourneyActions from '@/components/context/ContextualJourneyActions';";

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`[v14410] Âncora ausente: ${label}`);
}

function replaceOnce(source, needle, replacement, label) {
  requireText(source, needle, label);
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`[v14410] Âncora ambígua (${count}): ${label}`);
  return source.replace(needle, replacement);
}

function assertMaterialized(source) {
  for (const needle of [
    marker,
    '<ExperienceRuntimeBridge/>',
    '<PulseContextBridge event={event}/>',
    '<ContextualJourneyActions event={event}',
    '<ExperiencePreferencesCard/>',
    'const visibleNav = nav.filter',
    "window.addEventListener('crewcheck:go-back'",
    "url.searchParams.set('view', view)",
  ]) requireText(source, needle, needle);
}

if (before.includes(marker)) {
  assertMaterialized(before);
  console.log('[v14410] UX contextual/adaptativa já materializada; no-op seguro.');
  process.exit(0);
}

let next = before;

next = replaceOnce(
  next,
  "import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';",
  "import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';\nimport ContextualJourneyActions from '@/components/context/ContextualJourneyActions';\nimport ExperiencePreferencesCard from '@/components/context/ExperiencePreferencesCard';\nimport ExperienceRuntimeBridge from '@/components/context/ExperienceRuntimeBridge';\nimport PulseContextBridge from '@/components/context/PulseContextBridge';\nimport { isCrewViewVisible, loadExperiencePreferences } from '@/lib/experiencePreferences';\nimport { clearCrewContext, loadCrewContext } from '@/lib/contextualNavigation';",
  'imports contextuais',
);

next = replaceOnce(
  next,
  "function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {\n  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));",
  "function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {\n  const click = onMenu || (back ? (() => window.dispatchEvent(new Event('crewcheck:go-back'))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));",
  'voltar contextual do Brand',
);

next = replaceOnce(
  next,
  "function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {\n  const storedUser = getStoredUser();\n  const admin = isAdmin();",
  "function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {\n  const storedUser = getStoredUser();\n  const admin = isAdmin();\n  const experience = loadExperiencePreferences();",
  'preferência no MenuDrawer',
);

next = replaceOnce(
  next,
  "  const jump = (v: ZeroView) => { setView(v); close(); };",
  "  const visibleNav = nav.filter(([target]) => isCrewViewVisible(target, experience, admin));\n  const jump = (v: ZeroView) => { setView(v); close(); };",
  'filtro adaptativo do menu',
);

next = replaceOnce(next, '{nav.map(([v, label, desc, Icon]) =>', '{visibleNav.map(([v, label, desc, Icon]) =>', 'render do menu adaptativo');

for (const [oldText, newText] of [
  ["['cockpit','Cockpit','Próxima programação',HomeIcon]", "['cockpit','Hoje','Seu dia e próxima programação',HomeIcon]"],
  ["['load','Carga de trabalho','Horas usadas x limites',BriefcaseBusiness]", "['load','Horas e limites','Uso acumulado e margem disponível',BriefcaseBusiness]"],
  ["['radar','Radar de voos','Portão e status',Radar]", "['radar','Portão e operação','Status, portão e aeronave',Radar]"],
  ["['presentation','Gerenciador de apresentação','Hotel/local e ajuste manual',Clock]", "['presentation','Apresentação','Horário, hotel e local',Clock]"],
  ["['hotels','Hotéis','Pernoite e entorno',Hotel]", "['hotels','Pernoite','Hotel, quarto e entorno',Hotel]"],
  ["['salary','Salário','Previsões e adicionais',DollarSign]", "['salary','Ganhos e salário','Previsões e adicionais',DollarSign]"],
]) {
  if (next.includes(oldText)) next = next.replace(oldText, newText);
}

const detailsActions = `    <div className="cz-tool-actions" style={{ marginTop: 14 }}>
      <button onClick={() => setView('presentation')}><Clock/> Gerenciador de apresentação</button>
      <button onClick={() => setView('departure')}><Car/> Saída</button>
      <button onClick={() => setView('radar')}><Radar/> Radar</button>
      <button onClick={() => setView('weather')}><CloudSun/> Meteo</button>
      <button onClick={() => setView('map')}><MapIcon/> Mapa do mês</button>
      <button onClick={() => setView('perdiem')}><BriefcaseBusiness/> Diárias</button>
      <button onClick={() => setView('salary')}><DollarSign/> Salário</button>
    </div>`;
next = replaceOnce(
  next,
  detailsActions,
  `    <ContextualJourneyActions event={event} sourceView="roster" onNavigate={(target) => setView(target as ZeroView)} />`,
  'ações excessivas do detalhe da escala',
);

next = replaceOnce(
  next,
  "const [view, setView] = useState<ZeroView>(() => new URLSearchParams(window.location.search).has('connect') ? 'community' : normalizeInitialView(sessionStorage.getItem('crewcheck_force_view_once') || sessionStorage.getItem('crewcheck_initial_view')));",
  "const [view, setView] = useState<ZeroView>(() => new URLSearchParams(window.location.search).has('connect') ? 'community' : normalizeInitialView(new URLSearchParams(window.location.search).get('view') || sessionStorage.getItem('crewcheck_force_view_once') || sessionStorage.getItem('crewcheck_initial_view')));",
  'view inicial linkável',
);

next = replaceOnce(
  next,
  '  useWeatherLandingMonitor(flightEvent);',
  `  useWeatherLandingMonitor(flightEvent);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      const context = loadCrewContext();
      if (context?.target === view && context.eventId) url.searchParams.set('ctx', context.eventId);
      else url.searchParams.delete('ctx');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {}
  }, [view]);`,
  'sincronização de deep link',
);

next = replaceOnce(
  next,
  "    const refreshPresentation = () => setPresentationRevision((value) => value + 1);",
  "    const refreshPresentation = () => setPresentationRevision((value) => value + 1);\n    const returnToContext = () => { const context = loadCrewContext(); const target = normalizeInitialView(context?.sourceView || 'cockpit'); clearCrewContext(); setView(target); };",
  'retorno ao contexto',
);

next = replaceOnce(
  next,
  "    window.addEventListener('crewcheck:set-view', setViewFromEvent as EventListener);",
  "    window.addEventListener('crewcheck:set-view', setViewFromEvent as EventListener);\n    window.addEventListener('crewcheck:go-back', returnToContext as EventListener);",
  'listener de voltar',
);

next = replaceOnce(
  next,
  "return () => { window.removeEventListener('crewcheck:open-menu', open); window.removeEventListener('crewcheck:set-view', setViewFromEvent as EventListener); window.removeEventListener('crewcheck:theme-change', syncTheme); window.removeEventListener('crewcheck:presentation-updated', refreshPresentation); };",
  "return () => { window.removeEventListener('crewcheck:open-menu', open); window.removeEventListener('crewcheck:set-view', setViewFromEvent as EventListener); window.removeEventListener('crewcheck:go-back', returnToContext as EventListener); window.removeEventListener('crewcheck:theme-change', syncTheme); window.removeEventListener('crewcheck:presentation-updated', refreshPresentation); };",
  'cleanup do voltar contextual',
);

next = replaceOnce(next, '    <div className="cz-wallpaper"/>', '    <div className="cz-wallpaper"/>\n    <ExperienceRuntimeBridge/>', 'bridge da experiência');
next = replaceOnce(next, '    <CrewCheckPulse/>', '    <CrewCheckPulse/>\n    <PulseContextBridge event={event}/>', 'Pulse contextual');

next = replaceOnce(
  next,
  "    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)} alertCount={actionableComplianceAlerts(compliance).length} alertSignature={complianceAlertSignature(compliance)}/>",
  "    {view === 'settings' && <ExperiencePreferencesCard/>}\n    <BottomNav view={view} setView={setView} openMenu={() => setDrawer(true)} alertCount={actionableComplianceAlerts(compliance).length} alertSignature={complianceAlertSignature(compliance)}/>",
  'preferência adaptativa nas configurações',
);

if (next.includes("[['cockpit','Cockpit',HomeIcon]")) next = next.replace("[['cockpit','Cockpit',HomeIcon]", "[['cockpit','Hoje',HomeIcon]");

assertMaterialized(next);
fs.writeFileSync(homePath, next, 'utf8');
console.log('[v14410] UX contextual/adaptativa materializada: menos menu fixo, ações por jornada, Pulse acionável, deep link e retorno ao contexto.');
