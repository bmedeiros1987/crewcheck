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

if (!source.includes('<HomeLayoutShell slots={slots}/>')) {
  const start = source.indexOf('function Cockpit(');
  const end = source.indexOf('\nfunction rosterCode', start);
  if (start < 0 || end < 0) throw new Error('[p1-home-layout] Cockpit não localizado');
  source = source.slice(0, start) + source.slice(start).replace('function Cockpit(', 'function CrewCheckStandardCockpit(');
  const block = `function Cockpit({ events, compliance, setView, onUpload, openMenu }: { events: ZeroLeg[]; compliance: ComplianceResult | null; setView: (v: ZeroView) => void; onUpload: () => void; openMenu: () => void }) {
  const event = nextFlight(events);
  const loaded = events.some((event) => !event.placeholder);
  const alertCount = actionableComplianceAlerts(compliance).length;
  const dutyLimit = event.kind === 'flight' && !event.placeholder ? getPublishedDutyLimitSummary(event.day, compliance?.legalProfile) : null;
  const counters = loaded && events[0]?.day ? {
    days: new Set(events.map((e) => e.day.date)).size,
    flights: events.filter((e) => e.kind === 'flight').length,
    activities: events.filter((e) => e.kind !== 'flight' && e.canonical?.kind !== 'rest').length,
    rest: events.filter((e) => e.canonical?.kind === 'rest').length,
  } : { days: 0, flights: 0, activities: 0, rest: 0 };
  const slots: HomeLayoutSlot[] = [
    {
      id: 'summary',
      label: 'Resumo operacional',
      description: 'Dias, voos, atividades e alertas.',
      content: <section className="cz-kpi-row">
        <KpiCard icon={CalendarDays} title="Dias publicados" value={String(counters.days)} detail="Datas reais"/>
        <KpiCard icon={Plane} title="Voos" value={String(counters.flights)} detail="Pernas detectadas" tone="blue"/>
        <KpiCard icon={BriefcaseBusiness} title="Atividades" value={String(counters.activities)} detail={'Folgas ' + counters.rest} tone="blue"/>
        <KpiCard icon={Bell} title="Alertas" value={String(alertCount)} detail="Confirmados" tone="pink"/>
      </section>,
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

  return <><Brand onMenu={openMenu}/><section className="cz-title"><small>Cockpit</small><i/></section><HomeLayoutShell slots={slots}/></>;
}
`;
  const wrapperAnchor = source.indexOf('\nfunction rosterCode', start);
  source = source.slice(0, wrapperAnchor) + '\n' + block + source.slice(wrapperAnchor);
}

fs.writeFileSync(path, source, 'utf8');
console.log('[p1-home-layout] modos Padrão, Personalizada e Mista materializados após finalizadores canônicos.');
