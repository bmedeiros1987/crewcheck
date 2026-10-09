import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import { getStoredUser, getToken } from '@/lib/authClient';
import { listSavedRosters, openSavedRoster, financialRosterCrewIdentity, type SavedRosterSummary } from '@/lib/databaseClient';
import type { CrewRoster } from '@/lib/pdfParser';
import { financialMonths, financialRange, latestFinancialPeriods, validFinancialDay, type FinancialRange } from '@/lib/financialHistoryPeriods';
import { financialComparisonPeriods } from '@/lib/financialComparisonPeriods';
import './financial-history.css';

const monthOf = (roster: CrewRoster) => `${roster.year}-${String(roster.month).padStart(2,'0')}`;
const label = (month: string) => new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(month + '-01T12:00:00Z'));
const money = (value: number, currency: string) => new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value);
function session() {
  const user = getStoredUser(), token = getToken();
  return user && token && (user.id || user.email) && !['visitor','guest'].includes(user.role || '') ? `${user.id || user.email}:${token}` : '';
}

export default function FinancialHistoryExplorer<S>({ roster, calculate, metric, rangeMetric, mode, weeks, periodMetric, render }: {
  roster: CrewRoster; calculate: (roster: CrewRoster) => S; metric: (snapshot: S) => Record<string, number>;
  rangeMetric?: (snapshot: S, range: FinancialRange) => Record<string, number>;
  mode: 'allowance' | 'salary'; render: (state: { snapshots: Array<{ roster: CrewRoster; snapshot: S; source: string }>; range: FinancialRange; missing: string[]; controls: ReactNode; graph: ReactNode; coverageReady: boolean; requestRange: (range:FinancialRange)=>void }) => ReactNode;
  periodMetric?: (snapshots: S[], range: FinancialRange, missing: string[]) => Record<string,number>;
  weeks?: (snapshots: S[], range: FinancialRange) => Array<{ range: FinancialRange; value: string }>;
}) {
  const owner = session(), initialMonth = monthOf(roster), crew = financialRosterCrewIdentity(roster);
  const [authRevision, setAuthRevision] = useState(0), [calculationRevision,setCalculationRevision] = useState(0);
  const [kind, setKind] = useState<FinancialRange['kind']>('month');
  const [month, setMonth] = useState(initialMonth), [day,setDay] = useState(initialMonth + '-01');
  const [from,setFrom] = useState(initialMonth + '-01'), [to,setTo] = useState(initialMonth + '-01');
  const [inventory,setInventory] = useState<SavedRosterSummary[]>([]), [conflicts,setConflicts] = useState<string[]>([]);
  const [loaded,setLoaded] = useState<Array<{roster:CrewRoster;source:string}>>([]);
  const [coverageReady,setCoverageReady]=useState(false);
  const [requestedPeriods,setRequestedPeriods]=useState<string[]>([]);
  const [busy,setBusy] = useState(false), [notice,setNotice] = useState(''), [expanded,setExpanded] = useState(false), [currency,setCurrency] = useState('BRL');
  const [comparison,setComparison]=useState<'month'|'week'>('month');
  const epoch = useRef(0), fetching = useRef(new Set<string>());
  const account = String(getStoredUser()?.id || getStoredUser()?.email || '');
  const bound = useRef({ account, roster });
  if (roster !== bound.current.roster) bound.current = { account, roster };
  const range = useMemo(()=>financialRange(kind,month,day,from,to),[kind,month,day,from,to]);
  const comparisonRange=useMemo(()=>kind==='year'||kind==='custom'?range:financialRange(comparison==='month'?'year':'month',month,'','',''),[kind,range,comparison,month]);
  const current = useMemo(()=>({roster, snapshot:calculate(roster), source:'Escala selecionada'}),[roster,calculate,authRevision,calculationRevision]);
  const snapshots = useMemo(()=>[...(!conflicts.includes(initialMonth)&&!inventory.some(item=>`${item.year}-${String(item.month).padStart(2,'0')}`===initialMonth)?[current]:[]),...loaded.filter(item=>!conflicts.includes(monthOf(item.roster))).map(item=>({...item,snapshot:calculate(item.roster)}))],[current,loaded,initialMonth,calculate,authRevision,calculationRevision,inventory,conflicts]);
  const months = [...new Set([initialMonth,...inventory.map(item=>`${item.year}-${String(item.month).padStart(2,'0')}`)])].filter(value=>validFinancialDay(value+'-01')).sort();
  const missing = financialMonths(range).filter(period=>!snapshots.some(item=>monthOf(item.roster)===period));
  useEffect(()=>{const refresh=()=>setCalculationRevision(value=>value+1);window.addEventListener('crewcheck:financial-config-changed',refresh);return()=>window.removeEventListener('crewcheck:financial-config-changed',refresh);},[]);
  useEffect(()=>{
    const changed=()=>{epoch.current++;fetching.current.clear();setLoaded([]);setInventory([]);setConflicts([]);setCoverageReady(false);setNotice('Sessão alterada; histórico financeiro atualizado.');setAuthRevision(value=>value+1);};
    window.addEventListener('crewcheck:auth-changed',changed);window.addEventListener('crewcheck:auth-expired',changed);
    const storage=(event:StorageEvent)=>{if(['crewcheck_auth_user','crewcheck_auth_token'].includes(event.key || ''))changed();};window.addEventListener('storage',storage);
    return ()=>{epoch.current++;window.removeEventListener('crewcheck:auth-changed',changed);window.removeEventListener('crewcheck:auth-expired',changed);window.removeEventListener('storage',storage);};
  },[]);
  useEffect(()=>{
    const version=++epoch.current;setLoaded([]);fetching.current.clear();setInventory([]);setConflicts([]);setCoverageReady(false);setMonth(initialMonth);setDay(initialMonth+'-01');
    if(!owner||!crew)return;
    setBusy(true);setNotice('');
    listSavedRosters(72,false,{preserveRevisions:true}).then(items=>{
      if(version!==epoch.current||session()!==owner)return;
      const latest=latestFinancialPeriods(items,crew,financialRosterCrewIdentity);setInventory(latest.items);setConflicts(latest.conflicts);setCoverageReady(true);
      if(items.length>=72)setNotice('Histórico limitado às 72 escalas retornadas; não representa todos os períodos da conta.');
    }).catch(()=>{if(version===epoch.current&&session()===owner)setNotice('Não foi possível consultar outros meses. A escala selecionada continua disponível.');})
      .finally(()=>{if(version===epoch.current&&session()===owner)setBusy(false);});
  },[owner,crew,initialMonth,roster,authRevision]);
  useEffect(()=>{
    if(!owner||!crew)return;
    const wanted=[...financialMonths(range),...(expanded?financialMonths(comparisonRange):[]),...requestedPeriods], version=epoch.current;
    const requests=inventory.filter(item=>wanted.includes(`${item.year}-${String(item.month).padStart(2,'0')}`)&&!loaded.some(entry=>monthOf(entry.roster)===`${item.year}-${String(item.month).padStart(2,'0')}`)&&!fetching.current.has(item.id));
    if(!requests.length)return;
    for(const item of requests)fetching.current.add(item.id);
    setBusy(true);
    // Read-only history lookup: never activates, saves or changes the selected roster.
    Promise.allSettled(requests.map(async item=>({roster:(await openSavedRoster(item.id,item)).roster,source:item.sourceFileName || 'Histórico da escala'}))).then(results=>{
      if(version!==epoch.current||session()!==owner)return;
      const accepted=results.flatMap(result=>result.status==='fulfilled'&&financialRosterCrewIdentity(result.value.roster)===crew?[result.value]:[]);
      setLoaded(previous=>[...previous,...accepted]);
      if(results.some(result=>result.status==='rejected'))setNotice('Algumas escalas não estão disponíveis. Seus totais não foram presumidos.');
    }).finally(()=>{if(version===epoch.current&&session()===owner)setBusy(false);});
  },[owner,crew,inventory,expanded,kind,month,day,from,to,initialMonth,loaded,requestedPeriods,comparisonRange]);
  if(!owner || account !== bound.current.account)return <section className="cz-empty-real"><h1>Financeiro da sua conta</h1><p>Entre na conta proprietária e carregue sua escala para consultar valores. Visitantes não têm acesso financeiro.</p></section>;
  if(!validFinancialDay(initialMonth+'-01'))return <section className="cz-empty-real"><h1>Competência não informada</h1><p>Uma escala com mês e ano válidos é necessária.</p></section>;
  if(!crew)return <section className="cz-empty-real"><h1>Identificação da escala pendente</h1><p>Não foi possível vincular o histórico ao tripulante da escala selecionada.</p></section>;
  const periods=financialComparisonPeriods(comparisonRange,comparison);
  const rows=periods.map(({range:period,complete})=>{
    const needed=financialMonths(period), selected=snapshots.filter(item=>needed.includes(monthOf(item.roster)));
    const absent=needed.filter(value=>!selected.some(item=>monthOf(item.roster)===value));
    const values=absent.length?{}:periodMetric?periodMetric(selected.map(item=>item.snapshot),period,absent):comparison==='month'&&selected.length===1?(rangeMetric?rangeMetric(selected[0].snapshot,period):metric(selected[0].snapshot)):{};
    return {range:period,values,absent,fullWeek:complete,title:comparison==='month'?label(period.start.slice(0,7))+(!complete?` (${period.start} até ${period.end})`:''):`${period.start} até ${period.end}`};
  });
  const currencies=[...new Set(rows.flatMap(item=>Object.keys(item.values)))].sort();
  const displayedCurrency=currencies.includes(currency)?currency:currencies[0] || 'BRL';
  const numeric=rows.filter(item=>item.fullWeek&&Number.isFinite(item.values[displayedCurrency]));
  const max=numeric.length>=2?Math.max(...numeric.map(item=>item.values[displayedCurrency])):null;
  const controls=<>
    <section className="cc-roster-period-v1399 cc-financial-period" aria-label="Período financeiro">
      <label><CalendarDays aria-hidden="true"/><span>Competência de referência</span><select aria-label="Competência de referência" value={month} onChange={event=>{setMonth(event.target.value);setDay(event.target.value+'-01');}}>{months.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label><span>Filtro</span><select aria-label="Filtro financeiro" value={kind} onChange={event=>setKind(event.target.value as FinancialRange['kind'])}><option value="week">Semana</option><option value="month">Mês</option><option value="year">Ano</option><option value="custom">Período personalizado</option></select></label>
    </section>
    <section className="cc-roster-zoom cc-financial-range" aria-label="Datas financeiras">
      {kind==='week'&&<label>Dia da semana de trabalho<input type="date" aria-label="Dia da semana de trabalho" value={day} onChange={event=>setDay(event.target.value)}/></label>}
      {kind==='custom'&&<><label>Início<input type="date" aria-label="Início financeiro" value={from} onChange={event=>setFrom(event.target.value)}/></label><label>Fim<input type="date" aria-label="Fim financeiro" value={to} onChange={event=>setTo(event.target.value)}/></label></>}
      <p role="status">{range.valid?`Trabalho: ${range.start} até ${range.end}. `:'Informe um intervalo válido.'}{busy?' Consultando histórico…':''}</p>
      {missing.length>0&&<p>Sem escala para {missing.join(', ')}. Total do intervalo indisponível.</p>}
      {(notice||conflicts.length>0)&&<p>{notice} {conflicts.length>0?'Revisões ambíguas em '+conflicts.join(', ')+': não somadas.':''}</p>}
    </section>
  </>;
  const graph=<details className="cz-toolbox cc-financial-graph" onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary>Demonstrativo e gráficos · previsões</summary>
    <p>Reprocessado pelo motor atual. Previsto não significa recebido. Sem fonte de confirmação de pagamentos; demonstrativos oficiais permanecem separados.</p>
    <label>Comparar por<select aria-label="Agrupamento do gráfico" value={comparison} onChange={event=>setComparison(event.target.value as 'month'|'week')}><option value="month">Mês</option>{mode==='allowance'&&periodMetric&&<option value="week">Semana</option>}</select></label>
    <p>Comparação: {comparisonRange.start} até {comparisonRange.end}. Moeda original: {displayedCurrency}. {comparison==='week'?'Semanas de quarta a terça; recortes parciais identificados.':''}</p>
    {currencies.length>1&&<label>Moeda do gráfico<select aria-label="Moeda do gráfico" value={displayedCurrency} onChange={event=>setCurrency(event.target.value)}>{currencies.map(value=><option key={value}>{value}</option>)}</select></label>}
    {numeric.length<2&&<p>São necessários dois períodos completos com total nesta moeda para comparar barras e variações.</p>}
    <div className="cc-financial-bars" aria-label="Comparativo de previsões por período">
      {rows.map((item,index)=>{
        const value=item.values[displayedCurrency],previous=rows[index-1];
        const delta=item.fullWeek&&previous?.fullWeek&&Number.isFinite(value)&&Number.isFinite(previous.values[displayedCurrency])?value-previous.values[displayedCurrency]:null;
        return <button type="button" key={item.range.start} aria-label={`Abrir ${item.title}`} onClick={()=>{setMonth(item.range.start.slice(0,7));setDay(item.range.start);if(comparison==='month')setKind('month');else{setKind('custom');setFrom(item.range.start);setTo(item.range.end);}}}>
          <span>{item.title}{!item.fullWeek?' · recorte parcial':''}</span>
          {max!==null&&max>0&&item.fullWeek&&Number.isFinite(value)&&<span className="cc-financial-bar-track" aria-hidden="true"><span style={{width:`${Math.max(0,value/max*100)}%`}}/></span>}
          <strong>{item.absent.length?'Ausente · sem escala':Number.isFinite(value)?`Previsto · ${money(value,displayedCurrency)}`:'Total indisponível'}</strong>
          {delta!==null&&<small>Variação ante período anterior: {delta>0?'+':''}{money(delta,displayedCurrency)}</small>}
        </button>;
      })}
    </div>
    <p>{mode==='salary'?'Salário-base e descontos são mensais; nenhuma parcela mensal é distribuída artificialmente por semana.':'Escolha um mês para abrir suas semanas de trabalho. O filtro Semana também está disponível acima.'}</p>
    {kind==='month'&&weeks&&<section className="cc-financial-week-list" aria-label="Semanas da competência"><h3>Semanas da competência</h3><p>Recortes de trabalho dentro do mês, sem atribuir datas de pagamento.</p>{weeks(snapshots.map(item=>item.snapshot),range).map(item=><button type="button" key={item.range.start} onClick={()=>{setKind('custom');setFrom(item.range.start);setTo(item.range.end);}}>{item.range.start} até {item.range.end} · {item.value}</button>)}</section>}
  </details>;
  return <>{render({snapshots,range,missing,controls,graph,coverageReady,requestRange:range=>setRequestedPeriods(financialMonths(range))})}</>;
}
