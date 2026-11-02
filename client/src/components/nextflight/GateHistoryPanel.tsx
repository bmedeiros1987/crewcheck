import {useEffect,useRef,useState} from 'react';
import {originFlightDate} from '../../../../shared/gate-query-day.mjs';
import {type NextFlightLike} from '@/lib/nextFlightGate';
import {readGateHistoryPage,type GateHistoryPage} from '@/lib/gateHistory';
const clock=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'UTC'})+' UTC':'Não fornecido';
export function GateHistoryPanel({event}:{event:NextFlightLike}){
 const raw=event.canonical?.startDateTime||'';
 const planned=Number.isFinite(Date.parse(raw))?new Date(raw).toISOString():'';
 const identity={flight:String(event.flightNumber||'').replace(/\s+/g,'').toUpperCase(),origin:String(event.origin||''),destination:String(event.destination||''),departureDate:originFlightDate(planned,String(event.origin||'')),scheduledDepartureUtc:planned?new Date(planned).toISOString():''};
 const key=JSON.stringify(identity),serial=useRef(0),[page,setPage]=useState<GateHistoryPage|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[legacy,setLegacy]=useState(false);
 useEffect(()=>{const clear=()=>{serial.current++;setPage(null);setMessage('');setBusy(false);};clear();
 const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','storage'];for(const name of events)window.addEventListener(name,clear);
 return()=>{serial.current++;for(const name of events)window.removeEventListener(name,clear);};},[key]);
 async function load(cursor=0,old=false){const request=++serial.current;setBusy(true);setPage(null);setMessage('');
 try{const result=await readGateHistoryPage(identity,cursor,old);if(request!==serial.current)return;setPage(result);setLegacy(result?.legacy===true||old);if(!result)setMessage('Nenhum registro encontrado para esta ocorrência. Isso não confirma portão atual.');}
 catch(error){if(request===serial.current)setMessage(error instanceof Error?error.message:'Histórico indisponível.');}
 finally{if(request===serial.current)setBusy(false);}}
 return <section className="cz-toolbox" aria-label="Histórico de portões"><h2>Histórico de portões</h2><p>{identity.flight} · {identity.origin} → {identity.destination} · {identity.departureDate}. Registros anteriores; não confirmam portão atual.</p>
 <div className="cz-tool-actions"><button onClick={()=>load()} disabled={busy||!planned}>{busy?'Consultando…':'Consultar histórico salvo'}</button><button onClick={()=>load(0,true)} disabled={busy||!planned}>Arquivo anterior</button></div>
 {message&&<p role="status">{message}</p>}
 {page&&<><p>Ordem de registro · {page.total} registro(s){page.legacy?' · conflitos do arquivo anterior não indexados':''}{page.coverage==='stored-current-previous-only'?' · apenas registros preservados no formato anterior':''}</p><ol start={page.cursor*100+1}>{page.observations.map(row=><li key={row.sequence}><strong>Portão {row.gate}</strong> · {row.provider}<br/>Atualização na fonte: {clock(row.sourceUpdatedAt)}<br/>Recebido: {clock(row.receivedAt)}{row.conflicted===true&&' · Registros em conflito'}{row.outOfOrder&&' · Registro fora de ordem temporal'}</li>)}</ol>
 <div className="cz-tool-actions">{page.cursor>0&&<button onClick={()=>load(page.cursor-1,legacy)} disabled={busy}>Registros anteriores</button>}{page.nextCursor!==null&&<button onClick={()=>load(page.nextCursor!,legacy)} disabled={busy}>Próximos registros</button>}</div></>}
 </section>;
}
