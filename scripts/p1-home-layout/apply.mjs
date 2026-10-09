import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p1-home-layout] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');
if (!source.includes("from '@/components/v1391/HomeRosterPreview'")) source = "import { HomeRosterPreview } from '@/components/v1391/HomeRosterPreview';\n" + source;

const importLine = "import { HomeLayoutShell, type HomeLayoutSlot } from '@/components/v1391/HomeLayoutShell';";
if (!source.includes(importLine)) {
  const typeAnchor = '\ntype ZeroView =';
  if (!source.includes(typeAnchor)) throw new Error('[p1-home-layout] limite estrutural dos imports não localizado');
  source = source.replace(typeAnchor, `\n${importLine}\n${typeAnchor.slice(1)}`);
}

if (!source.includes('function PersonalizedCockpit(')) {
  const start = source.indexOf('function Cockpit(');
  const end = source.indexOf('\nfunction rosterCode', start);
  if (start < 0 || end < 0) throw new Error('[p1-home-layout] Cockpit não localizado');
  const cockpit = source.slice(start, end);
  const returnStart = cockpit.lastIndexOf('  return <>');
  const returnEnd = cockpit.lastIndexOf('</>;');
  if (returnStart < 0 || returnEnd < returnStart) throw new Error('[p1-home-layout] retorno canônico do Cockpit não localizado');
  let wrappedCockpit = cockpit.slice(0, returnStart)
    + '  return <PersonalizedCockpit events={events} compliance={compliance} setView={setView} onUpload={onUpload} openMenu={openMenu} canonicalContent={<>'
    + cockpit.slice(returnStart + '  return <>'.length, returnEnd)
    + '</>} />;'
    + cockpit.slice(returnEnd + '</>;'.length);
  const wrapperProps = 'events={events} compliance={compliance} setView={setView} onUpload={onUpload} openMenu={openMenu} contextOnly';
  wrappedCockpit = wrappedCockpit.replace(/return (<VacationModeCardV14738[^;]+);/, (_, card) => 'return <PersonalizedCockpit ' + wrapperProps + ' canonicalContent={' + card + '}/>;');
  const emptyStart = wrappedCockpit.indexOf('return <>');
  if (emptyStart >= 0) {
    const emptyEnd = wrappedCockpit.indexOf('</>;', emptyStart);
    if (emptyEnd < 0) throw new Error('[p1-home-layout] retorno vazio não localizado');
    wrappedCockpit = wrappedCockpit.slice(0, emptyStart) + 'return <PersonalizedCockpit ' + wrapperProps + ' canonicalContent={'
      + wrappedCockpit.slice(emptyStart + 'return '.length, emptyEnd + 3) + '}/>;' + wrappedCockpit.slice(emptyEnd + 4);
  }
  source = source.slice(0, start) + wrappedCockpit + source.slice(end);
  const block = `function PersonalizedCockpit({ events, compliance, setView, onUpload, openMenu, canonicalContent, contextOnly = false }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void; canonicalContent: React.ReactNode; contextOnly?: boolean }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const dutyLimit = event.kind === 'flight' && !event.placeholder ? getPublishedDutyLimitSummary(event.day, compliance?.legalProfile) : null;
  const slots: HomeLayoutSlot[] = [
    {
      id: 'summary',
      label: 'Resumo operacional',
      description: 'Alertas operacionais e acesso ao painel completo.',
      content: <button className="cz-mini-status cc-operational-alert-link" onClick={() => setView('alerts')}><Bell/><strong>Alertas operacionais</strong><span>{alertCount ? alertCount + ' confirmado(s)' : 'Nenhum alerta confirmado'}</span><ChevronRight/></button>,
    },
    {
      id: 'finance',
      label: 'Atalhos financeiros',
      description: 'Diárias e salário no motor financeiro único.',
      content: <section className="cz-money-row">
        <div onClick={() => setView('perdiem')}><BriefcaseBusiness/><span>Diárias</span><strong>Abrir</strong></div>
        <div onClick={() => setView('salary')}><DollarSign/><span>Salário</span><strong>Financeiro</strong></div>
      </section>,
    },
    {
      id: 'next',
      label: 'Próxima programação',
      description: 'Ação principal e programação canônica.',
      content: contextOnly ? canonicalContent : <>
        <section className="cz-section-head"><h2>Próxima Programação</h2><button onClick={() => setView(loaded ? 'roster' : 'import')}>{loaded ? 'Ver todas' : 'Importar'} <ChevronRight size={18}/></button></section>
        {loaded && !event.placeholder
          ? <FlightCard event={event}/>
          : <article className="cz-empty-real"><Upload/><h2>{loaded ? 'Nenhuma programação futura' : 'Nenhuma escala real carregada'}</h2><p>{loaded ? 'A escala foi carregada, mas não há evento operacional futuro após agora. Confira se o período importado está correto.' : 'Suba o PDF oficial para ativar a escala completa e os recursos operacionais com dados reais.'}</p><button onClick={onUpload}>Importar PDF agora</button></article>}
      </>,
    },
    {
      id: 'limits',
      label: 'Alertas e limites',
      description: 'Alertas operacionais não podem ser ocultados.',
      content: !contextOnly && dutyLimit
        ? <button className="cz-mini-status" onClick={() => setView('regulation')}><ShieldCheck/><strong>Limite desta jornada</strong><span>{dutyLimit.usedHours.toFixed(1).replace('.', ',')} h de {dutyLimit.maxDutyHours.toFixed(1).replace('.', ',')} h · margem {Math.max(0, dutyLimit.remainingHours).toFixed(1).replace('.', ',')} h</span><ChevronRight/></button>
        : null,
    },
    {
      id: 'smart',
      label: 'Próxima ação inteligente',
      description: 'Contexto da programação sem recalcular regras.',
      content: contextOnly ? null : <SmartCard event={event} setView={setView}/>,
    },
  ];

  return <HomeLayoutShell slots={slots} quickRoster={<HomeRosterPreview events={events} onNavigate={setView}/>} standardContent={canonicalContent} shortcuts={<HomeFavoriteShortcuts setView={setView} openMenu={openMenu}/>}/>;
}
`;
  const wrapperAnchor = source.indexOf('\nfunction rosterCode', start);
  source = source.slice(0, wrapperAnchor) + '\n' + block + source.slice(wrapperAnchor);
}


if (!source.includes('function HomeFavoriteShortcuts(')) {
  const menuStart = source.indexOf('function MenuDrawer(');
  const menuEnd = source.indexOf('\nfunction ', menuStart + 1);
  const canonicalMenu = source.slice(menuStart, menuEnd);
  const entries = [...canonicalMenu.matchAll(/\['([^']+)','([^']+)','([^']+)',([A-Za-z0-9_]+)\]/g)];
  if (entries.length !== 40) throw new Error('[p1-home-layout] catálogo canônico incompleto');
  const tuples = entries.map((entry) => `['${entry[1]}','${entry[2]}',${entry[4]}]`).join(',\n');
  const shortcutBlock = `function HomeFavoriteShortcuts({ setView, openMenu }: { setView: (v: ZeroView) => void; openMenu: () => void }) {
    const accountId = getStoredUser()?.id || null;
    const catalog: Array<[ZeroView, string, any]> = [${tuples}];
    const allowed = catalog.filter(([id]) => isAdmin() || !['updates','maintenance','admin'].includes(id));
    const favorites = readMenuFavorites(window.localStorage, accountId, allowed.map(([id]) => id));
    const shortcuts = favorites.map(id => allowed.find(([viewId]) => viewId === id)).filter((item): item is [ZeroView, string, any] => Boolean(item));
    return <section className="cc-home-shortcuts" aria-label="Seus atalhos"><header><div><small>SEUS FAVORITOS</small><h2>Atalhos do dia</h2></div><button type="button" onClick={openMenu}>Editar no menu</button></header><div>{shortcuts.map(([id,label,Icon]) => <button key={id} type="button" onClick={() => setView(id)}><Icon aria-hidden="true"/><span>{label}</span></button>)}</div>{!shortcuts.length && <p>Escolha seus favoritos no menu para começar.</p>}</section>;
  }
`;
  const shortcutAnchor = source.indexOf('\nfunction rosterCode');
  source = source.slice(0, shortcutAnchor) + '\n' + shortcutBlock + source.slice(shortcutAnchor);
}


fs.writeFileSync(path, source, 'utf8');
console.log('[p1-home-layout] visual modes materialized; canonical alerts unchanged');
