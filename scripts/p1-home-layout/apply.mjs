import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p1-home-layout] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

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
  const wrappedCockpit = cockpit.slice(0, returnStart)
    + '  return <PersonalizedCockpit events={events} compliance={compliance} setView={setView} onUpload={onUpload} openMenu={openMenu} canonicalContent={<>'
    + cockpit.slice(returnStart + '  return <>'.length, returnEnd)
    + '</>} />;'
    + cockpit.slice(returnEnd + '</>;'.length);
  source = source.slice(0, start) + wrappedCockpit + source.slice(end);
  const block = `function PersonalizedCockpit({ events, compliance, setView, onUpload, openMenu, canonicalContent }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void; canonicalContent: React.ReactNode }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const dutyLimit = event.kind === 'flight' && !event.placeholder ? getPublishedDutyLimitSummary(event.day, compliance?.legalProfile) : null;
  const slots: HomeLayoutSlot[] = [
    {
      id: 'summary',
      label: 'Resumo operacional',
      description: 'Alertas operacionais e acesso ao painel completo.',
      content: <button className="cz-mini-status" onClick={() => setView('alerts')}><Bell/><strong>Alertas operacionais</strong><span>{alertCount ? alertCount + ' confirmado(s)' : 'Nenhum alerta confirmado'}</span><ChevronRight/></button>,
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
      content: <>
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
      content: dutyLimit
        ? <button className="cz-mini-status" onClick={() => setView('regulation')}><ShieldCheck/><strong>Limite desta jornada</strong><span>{dutyLimit.usedHours.toFixed(1).replace('.', ',')} h de {dutyLimit.maxDutyHours.toFixed(1).replace('.', ',')} h · margem {Math.max(0, dutyLimit.remainingHours).toFixed(1).replace('.', ',')} h</span><ChevronRight/></button>
        : null,
    },
    {
      id: 'smart',
      label: 'Próxima ação inteligente',
      description: 'Contexto da programação sem recalcular regras.',
      content: <SmartCard event={event} setView={setView}/>,
    },
  ];

  return <HomeLayoutShell slots={slots} standardContent={canonicalContent}/>;
}
`;
  const wrapperAnchor = source.indexOf('\nfunction rosterCode', start);
  source = source.slice(0, wrapperAnchor) + '\n' + block + source.slice(wrapperAnchor);
}

fs.writeFileSync(path, source, 'utf8');
console.log('[p1-home-layout] modos Padrão, Personalizada e Mista materializados após finalizadores canônicos.');
