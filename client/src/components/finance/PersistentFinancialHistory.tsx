import {financialHistoryComparison} from '@shared/financialHistoryComparison.mjs';
import {formatFinancialMinor,currencyMinorDigits} from '@shared/financialMoney.mjs';
import { useEffect, useState } from 'react';
import { authFetch, captureAuthSession, getStoredUser, getToken } from '@/lib/authClient';
import { validFinancialDay, type FinancialRange } from '@/lib/financialHistoryPeriods';
import { useFinancialPrivacy } from './FinancialPrivacy';
import './persistent-history.css';

type Level='item'|'day'|'week'|'month';
type Status='forecast'|'statement_reported'|'payment_confirmed';
type Entry={id:string;ownerId:string;revision:number;periodStart:string;periodEnd:string;currency:string;amountMinor:number|null;category:string;status:Status;aggregationLevel:Level;paymentDate?:string;amountBasis?:string;expectedPaymentDate?:string;expectedPaymentTimezone?:string};
type History={state:'available'|'no_data'|'incomplete';records:Entry[]};
const categories:Record<string,string>={allowance:'Diárias',advance:'Adiantamento',payroll:'Crédito salarial',vacation:'Crédito de férias'};
const shortStatus:Record<Status,string>={forecast:'Previsto',statement_reported:'Informado',payment_confirmed:'Liquidação informada'};
const statuses:Record<Status,string>={forecast:'Previsão — não confirma pagamento',statement_reported:'Informado no demonstrativo — sem confirmação bancária',payment_confirmed:'Liquidação informada'};
function owner(){const user=getStoredUser();return getToken()&&user&&!['visitor','guest'].includes(user.role||'')?String(user.email||'').trim().toLowerCase():'';}
function decode(raw:any,expectedOwner:string,level:Level,range:FinancialRange):History|null {
  if(raw?.ok!==true||raw.source!=='persisted_financial_ledger'||raw.access!=='allowed'||raw.aggregationLevel!==level||!['available','no_data','incomplete'].includes(raw.state)||!Array.isArray(raw.records)||raw.records.length>10000)return null;
  const ids=new Set<string>();
  for(const entry of raw.records){
    if(!entry||entry.ownerId!==expectedOwner||typeof entry.id!=='string'||!/^[a-f0-9]{64}$/.test(entry.id)||ids.has(entry.id)||!Number.isSafeInteger(entry.revision)||entry.revision<1||!validFinancialDay(entry.periodStart)||!validFinancialDay(entry.periodEnd)||entry.periodStart<range.start||entry.periodEnd>range.end||entry.periodStart>entry.periodEnd||entry.aggregationLevel!==level||(['payroll','vacation'].includes(entry.category)&&(level!=='month'||entry.amountBasis!=='net_credit'))||!['allowance','advance','payroll','vacation'].includes(entry.category)||!Object.hasOwn(statuses,entry.status)||typeof entry.currency!=='string'||currencyMinorDigits(entry.currency)===null||(entry.amountMinor!==null&&!Number.isSafeInteger(entry.amountMinor))||(entry.paymentDate!==undefined&&!validFinancialDay(entry.paymentDate))||(entry.expectedPaymentDate!==undefined&&!validFinancialDay(entry.expectedPaymentDate)))return null;
    ids.add(entry.id);
  }
  if((raw.state==='no_data')!==(raw.records.length===0)&&raw.state!=='incomplete')return null;
  return {state:raw.state,records:raw.records};
}
export default function PersistentFinancialHistory({range,mode,view,comparison='month'}:{range:FinancialRange;mode:'allowance'|'salary';view:'statement'|'charts';comparison?:'month'|'week'}) {
  const privacy=useFinancialPrivacy(),identity=owner(),token=getToken();
  const [selectedLevel,setLevel]=useState<Level>(mode==='salary'?'month':'item');
  const level:Level=view==='charts'?(mode==='salary'?'month':comparison==='month'?'day':'week'):selectedLevel;
  const [revision,refresh]=useState(0),[result,setResult]=useState<{key:string;token:string|null;data:History|null;loading:boolean;error?:string}>({key:'',token:null,data:null,loading:false});
  const [visible,setVisible]=useState(20);
  const requestKey=[identity,mode,level,range.start,range.end,range.valid].join(':');
  useEffect(()=>{const changed=()=>{setResult({key:'',token:null,data:null,loading:false});refresh(n=>n+1);};const storage=(e:StorageEvent)=>{if(e.key===null||['crewcheck_auth_user','crewcheck_auth_token'].includes(e.key))changed();};for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(event,changed);window.addEventListener('storage',storage);return()=>{for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.removeEventListener(event,changed);window.removeEventListener('storage',storage);};},[]);
  useEffect(()=>{
    const session=captureAuthSession(),controller=new AbortController();let live=true;setVisible(20);
    if(!identity||!range.valid){setResult({key:requestKey,token,data:null,loading:false});return;}
    setResult({key:requestKey,token,data:null,loading:true});
    const query=new URLSearchParams({periodStart:range.start,periodEnd:range.end,aggregationLevel:level});
    const timer=setTimeout(()=>controller.abort(),8000);
    authFetch<any>('/api/platform/finance/history?'+query,{method:'GET',signal:controller.signal,cache:'no-store'}).then(raw=>{if(live&&session.isCurrent()&&owner()===identity)setResult({key:requestKey,token,data:decode(raw,identity,level,range),loading:false,error:decode(raw,identity,level,range)?undefined:'INVALID_RESPONSE'});}).catch(error=>{if(live&&session.isCurrent())setResult({key:requestKey,token,data:null,loading:false,error:error?.code==='FINANCIAL_LEDGER_NOT_ENABLED'?'LEDGER_OFF':'LOAD_ERROR'});}).finally(()=>clearTimeout(timer));
    return()=>{live=false;clearTimeout(timer);controller.abort();};
  },[identity,token,revision,level,range.start,range.end,range.valid]);
  const current=result.key===requestKey&&result.token===token?result:null;
  if(!identity)return <p className="cc-financial-history-availability" role="status">Entre na conta proprietária para consultar registros salvos.</p>;
  const allowed=mode==='salary'?['payroll','vacation']:['allowance','advance'];
  const data=current?.data,rows=(data?.records||[]).filter(row=>allowed.includes(row.category));
  const money=(minor:number,currency:string)=>privacy.amount(formatFinancialMinor(minor,currency)||'Não calculável');
  const date=(iso:string)=>iso.split('-').reverse().join('/');
  const {groups:totals,excluded,comparableCurrencies}=financialHistoryComparison(rows,{grouping:comparison,incomplete:data?.state==='incomplete'});
  const width=(item:{currency:string;amountMinor:number|null})=>{const max=Math.max(0,...totals.filter(row=>row.currency===item.currency).flatMap(row=>row.amountMinor===null?[]:[Math.abs(row.amountMinor)]));return max&&item.amountMinor!==null?Math.abs(item.amountMinor)/max*100:0;};
  const message=current?.loading?'Consultando registros…':current?.error==='LEDGER_OFF'?'Histórico salvo indisponível.':!data?'Não foi possível carregar o histórico.':data.state==='incomplete'?'Histórico parcial · conferir registros.':!rows.length?'Sem registros neste período.':'Moeda original · previsto e confirmado separados.';
  return <section className="cc-persisted-finance" aria-label="Histórico financeiro salvo">
    <h3>Histórico salvo</h3>
    <details className="cc-financial-help"><summary aria-label="Entender histórico salvo">?</summary><p>Somente registros persistidos da conta. Períodos sem registros não são zero. Liquidação conforme registro informado, sem consulta bancária; datas não confirmam pagamento. {current?.error==='LEDGER_OFF'?'Consulta persistida desativada; estimativas da escala permanecem separadas.':''}</p></details>
    {view==='statement'&&<label>Registros por<select aria-label="Agrupamento dos registros salvos" value={level} onChange={event=>setLevel(event.target.value as Level)}>{(mode==='salary'?['month']:['item','day','week']).map(value=><option key={value} value={value}>{{item:'Lançamento',day:'Dia',week:'Semana',month:'Mês'}[value]}</option>)}</select></label>}
    <p role="status" data-financial-load-state={current?.loading?'loading':current?.error||data?.state||'unavailable'}>{message}</p>
    {!current?.loading&&!data&&current?.error!=='LEDGER_OFF'&&<button type="button" onClick={()=>refresh(n=>n+1)}>Tentar novamente</button>}

    {data&&rows.length>0&&<>
      {view==='statement'?<ol>{[...rows].sort((a,b)=>b.periodStart.localeCompare(a.periodStart)||a.id.localeCompare(b.id)).slice(0,visible).map(row=><li key={row.id}><div><strong>{categories[row.category]}</strong><span>{date(row.periodStart)} a {date(row.periodEnd)}</span><small>Moeda original: {row.currency}</small><small>{statuses[row.status]} · revisão {row.revision}</small>{row.expectedPaymentDate&&<small>Pagamento previsto: {date(row.expectedPaymentDate)} · {row.expectedPaymentTimezone||'fuso não informado'}</small>}{row.paymentDate&&<small>Data de liquidação informada: {date(row.paymentDate)}</small>}</div><b>{row.amountMinor===null?'Não informado':money(row.amountMinor,row.currency)}</b></li>)}</ol>:<div aria-label="Gráfico de registros salvos">
        <p>{range.start.split('-').reverse().join('/')}–{range.end.split('-').reverse().join('/')} · registros disponíveis</p>
        {!comparableCurrencies.length&&<p>Sem dois períodos na mesma moeda para comparar.</p>}
        {excluded>0&&<p>Registros sem período compatível não foram distribuídos.</p>}
        {totals.map(item=><div className="cc-persisted-finance-bar" data-period={item.period} data-currency={item.currency} data-status={item.status} key={item.period+item.currency+item.category+item.status}>
          <span><strong>{item.period.includes('/')?item.period:item.period.slice(5)+'/'+item.period.slice(0,4)}</strong><small>{categories[item.category]} · {item.currency} · {shortStatus[item.status]}</small></span>
          <b>{item.amountMinor===null?'Não calculável':money(item.amountMinor,item.currency)}</b>
          {!privacy.hidden&&comparableCurrencies.includes(item.currency)&&item.amountMinor!==null&&<span className="cc-persisted-finance-track" data-status={item.status} aria-hidden="true"><span style={{width:`${width(item)}%`}}/></span>}
        </div>)}
      </div>}

      {view==='statement'&&rows.length>visible&&<button type="button" onClick={()=>setVisible(n=>n+20)}>Mostrar mais registros</button>}

    </>}
  </section>;
}
