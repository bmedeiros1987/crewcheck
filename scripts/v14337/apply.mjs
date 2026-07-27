import fs from 'node:fs';

const VERSION = '14.3.37';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14337] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14337] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

const brandBlock = `function CrewCheckMark({ className = 'cz-logo', size = 26 }: { className?: string; size?: number }) {
  return <span className={className} data-crewcheck-brand="canonical" aria-label="CrewCheck"><Plane size={size}/></span>;
}
function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {
  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));
  return <header className="cz-brand-row">
    <button className="cz-menu-btn" onClick={click} aria-label={back ? 'Voltar ao FlyDeck' : 'Menu'}>{back ? '←' : <Menu size={28}/>}</button>
    <div className="cz-brand-lockup"><CrewCheckMark/><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div></div>
  </header>;
}`;

const bottomNavBlock = `function BottomNav({ view, setView, openMenu, alertCount = 0, alertSignature = '' }: { view: ZeroView; setView: (v: ZeroView) => void; openMenu: () => void; alertCount?: number; alertSignature?: string }) {
  const currentSignature = alertCount > 0 ? (alertSignature || \`count:\${alertCount}\`) : '';
  const [seenSignature, setSeenSignature] = useState(() => storage.get('crewcheck_alerts_seen_signature', ''));
  useEffect(() => {
    if (alertCount === 0) {
      storage.set('crewcheck_alerts_seen_signature', '');
      storage.set('crewcheck_alerts_seen_count', '0');
      setSeenSignature('');
    }
  }, [alertCount]);
  const visibleAlertCount = currentSignature && currentSignature !== seenSignature ? alertCount : 0;
  const markAlertsRead = () => {
    storage.set('crewcheck_alerts_seen_signature', currentSignature);
    storage.set('crewcheck_alerts_seen_count', String(alertCount));
    setSeenSignature(currentSignature);
  };
  const items: Array<[ZeroView, string, any]> = [
    ['cockpit','FlyDeck',HomeIcon],
    ['roster','Escala',CalendarDays],
    ['departure','Saída',Navigation],
    ['alerts','Alertas',Bell],
    ['settings','Menu',Menu],
  ];
  const menuViews: ZeroView[] = ['settings','features','exports','calendar','database','routine','crew','radar','weather','perdiem','salary','reports','wakeup','hotels','presentation','map','mycar','gyms','iflight','updates','plans','community','regulation','bids','admin','maintenance','compare','load','concierge'];
  return <nav className="cz-bottom-nav" aria-label="Navegação principal">{items.map(([v, label, Icon]) => {
    const isMenu = v === 'settings';
    const active = view === v || (isMenu && menuViews.includes(view));
    return <button key={v} className={active ? 'active' : ''} onClick={() => { if (v === 'alerts') markAlertsRead(); isMenu ? openMenu() : setView(v); }}><Icon size={23}/><span>{label}</span>{v === 'alerts' && visibleAlertCount > 0 && <em aria-label={\`\${visibleAlertCount} alerta(s) novo(s)\`}>{visibleAlertCount}</em>}</button>;
  })}</nav>;
}`;

const menuDrawerBlock = `function MenuDrawer({ open, close, view, setView, actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {
  const storedUser = getStoredUser();
  const admin = isAdmin();
  const [profileName] = useState(() => storage.get('crewcheck_profile_display_name', String(storedUser?.name || storedUser?.email || 'Tripulante CrewCheck')));
  const [profileAvatar] = useState(() => storage.get('crewcheck_profile_avatar', ''));
  const initials = profileName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CC';
  function openProfile() { setView('settings'); close(); }
  if (!open) return null;
  type MenuItem = [ZeroView, string, string, any];
  const groups: Array<{ title: string; items: MenuItem[] }> = [
    { title: 'Hoje', items: [
      ['cockpit','FlyDeck','Sequência operacional do dia',HomeIcon],
      ['roster','Escala oficial','Todos os dias e programações',CalendarDays],
      ['compare','Planejado x atual','Mudanças da escala publicada',GitCompareArrows],
    ] },
    { title: 'Preparação', items: [
      ['departure','Saída Inteligente','Quando sair, rota e trânsito',Navigation],
      ['wakeup','Despertador','Alarmes e canais configurados',Bell],
      ['weather','Meteorologia','METAR, TAF e alertas',CloudSun],
      ['presentation','Apresentação','Horário publicado e ajustes',Clock],
      ['mycar','Meu carro','Estacionamento e deslocamento',Car],
    ] },
    { title: 'Em operação', items: [
      ['radar','Radar de voos','Portão, terminal e status',Radar],
      ['alerts','Irregularidades','Alertas confirmados',AlertTriangle],
      ['regulation','Regulamentação','RBAC 117, ACT e limites',ShieldCheck],
      ['load','Carga de trabalho','Horas usadas e disponíveis',BriefcaseBusiness],
    ] },
    { title: 'Escala e planejamento', items: [
      ['import','Importar escala','PDF oficial da empresa',Upload],
      ['iflight','Push iFlight','Importação assistida',Upload],
      ['bids','BIDS / PBS','Preferências da próxima escala',CalendarDays],
      ['map','Mapa do mês','Rotas publicadas',MapIcon],
      ['database','Histórico','Escalas salvas',Database],
    ] },
    { title: 'Financeiro', items: [
      ['perdiem','Diárias','Previsão semanal e mensal',BriefcaseBusiness],
      ['salary','Salário','Produção e adicionais',DollarSign],
      ['crew','Tripulação e função','Composição e adicionais',UserRound],
    ] },
    { title: 'Rotina e apoio', items: [
      ['concierge','Concierge','Perguntas sobre a escala',Send],
      ['hotels','Hotéis','Pernoite e entorno',Hotel],
      ['gyms','Locais próximos','Academias, saúde e serviços',MapIcon],
      ['routine','Rotina','Descanso, treino e preparação',ShieldCheck],
      ['community','Pessoas e visitantes','Compartilhamento e contatos',UserRound],
    ] },
    { title: 'Documentos e conta', items: [
      ['reports','Relatórios','Indicadores existentes',FileText],
      ['calendar','Calendário','Google Calendar e ICS',CalendarDays],
      ['exports','Exportar','PDF e compartilhamento',Share2],
      ['plans','Assinaturas','Plano e franquias',ShieldCheck],
      ['settings','Configurações','Perfil e preferências',Settings],
    ] },
  ];
  if (admin) groups.push({ title: 'Administração', items: [
    ['updates','Atualizações','Hotfix e pacote interno',Upload],
    ['maintenance','Manutenção','Prévia administrativa',Lock],
    ['admin','Admin','Saúde, termos e operação',ShieldCheck],
  ] });
  const jump = (v: ZeroView) => { setView(v); close(); };
  return <div className="cz-menu-overlay" role="dialog" aria-modal="true">
    <button className="cz-menu-backdrop" onClick={close} aria-label="Fechar menu" />
    <aside className="cz-menu-panel" data-crew-menu-panel="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}>
      <header className="cz-menu-header">
        <div className="cz-menu-identity" aria-label="CrewCheck">
          <CrewCheckMark className="cz-menu-brandmark" size={22}/>
          <button className="cz-menu-profile" onClick={openProfile} type="button" aria-label="Abrir perfil">
            <span className="cz-menu-avatar">{profileAvatar ? <img src={profileAvatar} alt="" /> : initials}</span>
            <span><strong>{profileName}</strong><small>{admin ? 'Administrador · Premium Unlimited' : 'Abrir perfil'}</small></span>
          </button>
        </div>
        <button className="cz-menu-close" onClick={close} aria-label="Fechar menu"><X/></button>
      </header>
      <div className="cz-menu-scroll" data-crew-menu-scroll="true">
        {groups.map((group) => <section className="cz-menu-section cz-menu-group" data-menu-group={group.title} key={group.title}><h3>{group.title}</h3>{group.items.map(([v, label, desc, Icon]) => <button key={v} className={view === v ? 'active' : ''} onClick={() => jump(v)}><Icon/><span><strong>{label}</strong><small>{desc}</small></span><ChevronRight/></button>)}</section>)}
      </div>
    </aside>
  </div>;
}`;

const cockpitBlock = `function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {
  const event = nextFlight(events);
  const departureEvent = nextDepartureEvent(events);
  const loaded = events.some((item) => !item.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((item) => item.day.date)).size,
    flights: events.filter((item) => item.kind === 'flight').length,
    activities: events.filter((item) => item.kind !== 'flight' && item.canonical?.kind !== 'rest').length,
    rest: events.filter((item) => item.canonical?.kind === 'rest').length,
  } : { days: 0, flights: 0, activities: 0, rest: 0 };
  const steps: Array<{ label: string; detail: string; view: ZeroView; ready: boolean; action: string }> = [
    { label: 'Confirmar programação', detail: loaded ? \`\${rosterEventTitle(event)} · \${programDateLabel(event)}\` : 'Importe a escala oficial', view: loaded ? 'roster' : 'import', ready: loaded, action: loaded ? 'Revisar' : 'Importar' },
    { label: 'Apresentação e limites', detail: loaded ? \`Apresentação \${event.presentation || 'a confirmar'} · confira regulamentação\` : 'Aguardando escala', view: 'regulation', ready: loaded, action: 'Conferir' },
    { label: 'Preparar saída', detail: loaded ? 'Rota, trânsito, margem e despertador' : 'Aguardando programação', view: 'departure', ready: loaded, action: 'Planejar' },
    { label: 'Acompanhar operação', detail: event.kind === 'flight' ? \`\${event.flightNumber} · radar e meteorologia\` : 'Radar disponível para voos publicados', view: event.kind === 'flight' ? 'radar' : 'weather', ready: loaded && event.kind === 'flight', action: 'Acompanhar' },
    { label: 'Revisar próxima etapa', detail: 'Pernoite, diárias, descanso e próxima programação', view: 'hotels', ready: loaded, action: 'Revisar' },
  ];

  return <><Brand onMenu={openMenu}/><section className="cz-title"><small>FlyDeck</small><i/></section>
    <section className="cz-flydeck-flow" aria-label="Sequência operacional CrewCheck">
      <header><div><small>COPILOTO CRONOLÓGICO</small><h1>Sua operação em ordem</h1><p>Um passo por vez, sempre usando a mesma escala oficial.</p></div><span>{loaded ? 'ESCALA ATIVA' : 'AGUARDANDO ESCALA'}</span></header>
      <div>{steps.map((step, index) => <button key={step.label} onClick={() => setView(step.view)} data-ready={step.ready}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{step.label}</strong><small>{step.detail}</small></span><em>{step.action}</em><ChevronRight/></button>)}</div>
    </section>
    <section className="cz-section-head"><h2>Próxima programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver escala' : 'Importar'} <ChevronRight size={18}/></button></section>
    {loaded && !event.placeholder ? <FlightCard event={event}/> : <article className="cz-empty-real"><Upload/><h2>{loaded ? 'Nenhuma programação futura' : 'Nenhuma escala real carregada'}</h2><p>{loaded ? 'A escala foi carregada, mas não há evento operacional futuro após agora. Confira se o período importado está correto.' : 'Suba o PDF oficial para ativar o FlyDeck com dados reais.'}</p><button onClick={onUpload}>Importar PDF agora</button></article>}
    <SmartCard event={departureEvent} setView={setView}/>
    <section className="cz-kpi-row"><KpiCard icon={CalendarDays} title="Dias publicados" value={String(counters.days)} detail="Datas reais"/><KpiCard icon={Plane} title="Voos" value={String(counters.flights)} detail="Pernas detectadas" tone="blue"/><KpiCard icon={BriefcaseBusiness} title="Atividades" value={String(counters.activities)} detail={\`Folgas \${counters.rest}\`} tone="blue"/><KpiCard icon={Bell} title="Alertas" value={String(alertCount)} detail="Confirmados" tone="pink"/></section>
    <section className="cz-money-row"><div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>Abrir</strong></div><div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>Financeiro</strong></div></section>
  </>;
}`;

const css = `
/* CrewCheck v14.3.37 — FlyDeck cronológico, menu anticaos e marca canônica */
.cz-menu-scroll { display: grid; gap: 14px; }
.cz-menu-group { border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); padding-top: 12px; }
.cz-menu-group:first-child { border-top: 0; padding-top: 0; }
.cz-menu-group h3 { letter-spacing: .12em; text-transform: uppercase; font-size: .72rem; opacity: .72; }
.cz-flydeck-flow { margin: 18px 0 22px; padding: 18px; border-radius: 26px; background: color-mix(in srgb, var(--card, #101827) 92%, transparent); border: 1px solid color-mix(in srgb, currentColor 12%, transparent); box-shadow: 0 18px 60px rgba(0,0,0,.18); }
.cz-flydeck-flow > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 14px; }
.cz-flydeck-flow > header small { letter-spacing: .14em; font-weight: 800; opacity: .68; }
.cz-flydeck-flow > header h1 { margin: 4px 0 6px; font-size: clamp(1.35rem, 4vw, 2rem); }
.cz-flydeck-flow > header p { margin: 0; opacity: .74; }
.cz-flydeck-flow > header > span { white-space: nowrap; font-size: .72rem; font-weight: 900; padding: 8px 11px; border-radius: 999px; background: rgba(34,211,238,.13); color: #22d3ee; }
.cz-flydeck-flow > div { display: grid; gap: 9px; }
.cz-flydeck-flow button { width: 100%; display: grid; grid-template-columns: 42px minmax(0,1fr) auto 20px; align-items: center; gap: 12px; text-align: left; border: 1px solid color-mix(in srgb, currentColor 10%, transparent); border-radius: 18px; padding: 12px 14px; background: color-mix(in srgb, var(--card, #111827) 88%, transparent); color: inherit; }
.cz-flydeck-flow button:hover, .cz-flydeck-flow button:focus-visible { border-color: rgba(34,211,238,.55); transform: translateY(-1px); }
.cz-flydeck-flow button > b { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 13px; background: rgba(99,102,241,.16); color: #a5b4fc; }
.cz-flydeck-flow button[data-ready="true"] > b { background: rgba(34,211,238,.16); color: #22d3ee; }
.cz-flydeck-flow button span { min-width: 0; display: grid; gap: 3px; }
.cz-flydeck-flow button strong, .cz-flydeck-flow button small { overflow-wrap: anywhere; }
.cz-flydeck-flow button small { opacity: .7; }
.cz-flydeck-flow button em { font-style: normal; font-size: .78rem; font-weight: 800; opacity: .8; }
[data-crewcheck-brand="canonical"] svg { display: block; }
@media (max-width: 560px) {
  .cz-flydeck-flow { padding: 14px; border-radius: 22px; }
  .cz-flydeck-flow > header { display: grid; }
  .cz-flydeck-flow > header > span { justify-self: start; }
  .cz-flydeck-flow button { grid-template-columns: 38px minmax(0,1fr) 18px; }
  .cz-flydeck-flow button em { display: none; }
}
`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: FlyDeck cronológico, navegação por rotina e marca canônica';`);
  next = replaceBlock(next, 'function Brand(', 'function complianceAlertSignature(', brandBlock, 'marca do cabeçalho');
  next = replaceBlock(next, 'function BottomNav(', 'function KpiCard(', bottomNavBlock, 'navegação inferior');
  next = replaceBlock(next, 'function MenuDrawer(', 'function Cockpit(', menuDrawerBlock, 'menu agrupado');
  next = replaceBlock(next, 'function Cockpit(', 'function rosterCode(', cockpitBlock, 'FlyDeck cronológico');
  return next;
});

update('client/src/index.css', (source) => source.includes('CrewCheck v14.3.37 — FlyDeck cronológico') ? source : `${source.trimEnd()}\n${css}\n`);
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

fs.mkdirSync('client/public/brand', { recursive: true });
const brandSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="CrewCheck"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#07111f"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect width="512" height="512" rx="118" fill="url(#g)"/><circle cx="256" cy="256" r="158" fill="url(#a)" opacity=".16"/><path d="M370 146c-18-9-53 1-80 28l-42 42-96-21-25 25 76 44-34 39-41-5-20 20 52 30 30 52 20-20-5-41 39-34 44 76 25-25-21-96 42-42c27-27 37-62 28-80-8-7-20-5-42 8Z" fill="#f8fafc"/><path d="M370 146c-18-9-53 1-80 28l-42 42-96-21-25 25 76 44-34 39-41-5-20 20 52 30 30 52 20-20-5-41 39-34 44 76 25-25-21-96 42-42c27-27 37-62 28-80-8-7-20-5-42 8Z" fill="none" stroke="#22d3ee" stroke-width="8" stroke-linejoin="round" opacity=".5"/></svg>`;
fs.writeFileSync('client/public/brand/crewcheck-mark.svg', brandSvg, 'utf8');
fs.writeFileSync('client/public/brand/crewcheck-play-store-source.svg', brandSvg, 'utf8');
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'FlyDeck cronológico, navegação organizada e marca canônica.' }, null, 2)}\n`, 'utf8');

console.log(`[v14337] CrewCheck ${VERSION}: FlyDeck cronológico, menu agrupado, barra inferior em cinco destinos e marca canônica aplicada.`);
