import {useEffect,useRef,useState} from 'react';
import {parsePDF} from '@/lib/pdfParser';
import {FreeDaySourceQueue} from './FreeDaySourceQueue';
import {getToken,getStoredUser} from '@/lib/authClient';
import {minimalVoluntaryReceipt,type VoluntaryReceipt} from '@/lib/freeDaySources';
const scope='free-day-voluntary-review-v1';
type ReviewState={revision:number;consent:boolean;expiresAt:string|null;review:{before:{documentHash:string};after:{documentHash:string};sourceStatus:string;state:string;reason:string|null;delayMinutes:number|null;possibleAmount:null}|null};
export function FreeDaySourceConsent({session,bound}:{session:string;bound:boolean}) {
  const [before,setBefore]=useState<VoluntaryReceipt|null>(null),[after,setAfter]=useState<VoluntaryReceipt|null>(null);
  const [state,setState]=useState<ReviewState|null>(null),[date,setDate]=useState(''),[confirmed,setConfirmed]=useState<string|null>(null),[consent,setConsent]=useState<string|null>(null);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const generation=useRef(0),mounted=useRef(true);
  const extraction=useRef({before:0,after:0}),ticket=useRef(0),pendingParses=useRef(new Set<number>());
  const reviewKey=before && after && date ? JSON.stringify([before,after,date]) : null;
  const identity=()=>JSON.stringify([getToken(),getStoredUser()?.id,getStoredUser()?.email]);
  const initialIdentity=useRef(identity());
  const fresh=(g:number,key:string)=>mounted.current && generation.current===g && identity()===key && initialIdentity.current===key;
  useEffect(()=>{
    mounted.current=true; initialIdentity.current=identity();
    const reset=()=>{generation.current++;pendingParses.current.clear();extraction.current={before:0,after:0};setBefore(null);setAfter(null);setState(null);setConfirmed(null);setConsent(null);setDate('');setBusy(false);setMessage('Sessão alterada. Reabra a revisão nesta conta.');};
    const storage=(e:StorageEvent)=>{if (!e.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(e.key)) reset();};
    window.addEventListener('crewcheck:auth-changed',reset);window.addEventListener('crewcheck:auth-expired',reset);window.addEventListener('storage',storage);
    const g=generation.current,key=identity();
    if(bound && getToken()) void fetch('/api/notifications/free-day-sources',{headers:{authorization:`Bearer ${getToken()}`},cache:'no-store'}).then(async r=>{const body=await r.json();if(fresh(g,key)){if(r.ok)setState(body);else setMessage(body.code || 'Revisão indisponível.');}}).catch(()=>{if(fresh(g,key))setMessage('Revisão indisponível.');});
    return ()=>{mounted.current=false;generation.current++;window.removeEventListener('crewcheck:auth-changed',reset);window.removeEventListener('crewcheck:auth-expired',reset);window.removeEventListener('storage',storage);};
  },[session,bound]);
  const select=async(file:File|undefined,side:'before'|'after')=>{
    if(!file || !bound || identity()!==initialIdentity.current)return;
    const g=generation.current,key=identity(),id=++ticket.current;
    extraction.current[side]=id;pendingParses.current.add(id);
    (side==='before'?setBefore:setAfter)(null);setBusy(true);setConfirmed(null);setConsent(null);setMessage('');
    const latest=()=>fresh(g,key) && extraction.current[side]===id;
    try {
      if(file.size>15*1024*1024)throw Error('Selecione um PDF de até 15 MB.');
      const bytes=await file.arrayBuffer(),roster=await parsePDF(file),receipt=await minimalVoluntaryReceipt(roster,bytes);
      if(latest()){(side==='before'?setBefore:setAfter)(receipt);setConfirmed(null);setConsent(null);setMessage('PDF lido localmente. Confira os inícios e fusos abaixo.');}
    }catch(e){if(latest()){(side==='before'?setBefore:setAfter)(null);setConfirmed(null);setConsent(null);setMessage(e instanceof Error?e.message:'PDF inválido.');}}finally{pendingParses.current.delete(id);if(fresh(g,key))setBusy(pendingParses.current.size>0);}
  };
  const submit=async(action:'review'|'revoke')=>{
    if(busy || pendingParses.current.size>0 || !bound || !state || identity()!==initialIdentity.current)return;
    if(action==='review' && (!reviewKey || confirmed!==reviewKey || consent!==reviewKey))return;
    const g=generation.current,key=identity(),token=getToken();setBusy(true);
    try {
      const body={scope,action,expectedRevision:state.revision,...(action==='review'?{before,after,sequenceDate:date,confirmed:confirmed===reviewKey,consent:consent===reviewKey}:{})};
      const r=await fetch('/api/notifications/free-day-sources',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await r.json();
      if(fresh(g,key)){if(!r.ok){setState(null);throw Error(result.code || 'Revisão indisponível. Reabra a tela.');}setState(result);if(action==='revoke'){setBefore(null);setAfter(null);setConfirmed(null);setConsent(null);setDate('');}setMessage(action==='revoke'?'Consentimento revogado e recibos removidos.':'Revisão simulada salva. Nenhuma mensagem enviada.');}
    }catch(e){if(fresh(g,key))setMessage(e instanceof Error?e.message:'Revisão indisponível.');}finally{if(fresh(g,key))setBusy(pendingParses.current.size>0);}
  };
  if(!bound)return null;
  return <details data-free-day-source-consent><summary>Revisar duas publicações e consentimento para alertas</summary>
    <p>Selecione voluntariamente os PDFs anterior e revisado. A leitura ocorre neste dispositivo; serão enviados somente hashes, período, identidade pseudonimizada e datas/horários/fusos de folga. Os PDFs, nomes e texto integral não serão enviados por esta revisão.</p>
    <p>Fonte declarada → conferida por você. Origem oficial verificada: indisponível. O destino existente será conferido no servidor na seção de fila. Envio desabilitado, inclusive com o app fechado.</p>
    {(['before','after'] as const).map(side=><div key={side}><label>{side==='before'?'Publicação anterior':'Publicação revisada'}<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{void select(e.target.files?.[0],side);e.target.value='';}} /></label>
      {(side==='before'?before:after) && <div><p>Período {(side==='before'?before:after)!.period} · hash {(side==='before'?before:after)!.documentHash.slice(0,12)}</p><ul>{(side==='before'?before:after)!.starts.map(s=><li key={s.date}>{s.date}: {s.literal?`${s.clock} · UTC${s.offset!>=0?'+':''}${s.offset!/60}`:'Início literal ou fuso pendente'}</li>)}</ul></div>}</div>)}
    <label>Data de início da sequência nas duas versões<input type="date" value={date} disabled={busy} onChange={e=>{setDate(e.target.value);setConfirmed(null);setConsent(null);}} /></label>
    <label><input type="checkbox" disabled={busy || !reviewKey} checked={Boolean(reviewKey && confirmed===reviewKey)} onChange={e=>setConfirmed(e.target.checked?reviewKey:null)} />Conferi identidade, período, início literal e fuso das duas publicações.</label>
    <label><input type="checkbox" disabled={busy || !reviewKey} checked={Boolean(reviewKey && consent===reviewKey)} onChange={e=>setConsent(e.target.checked?reviewKey:null)} />Autorizo nesta conta a preparação de alertas de postergação por 30 dias, usando estes dados mínimos. Entendo que o envio ainda está desabilitado.</label>
    <p>Os recibos expiram em 30 dias; a exclusão física ocorre ao revogar ou substituir explicitamente esta revisão. Revogar remove os dois recibos desta revisão. A revisão anterior será substituída se eu salvar outra comparação.</p>
    <button type="button" disabled={busy || !state || !before || !after || !reviewKey || confirmed!==reviewKey || consent!==reviewKey} onClick={()=>void submit('review')}>Salvar revisão simulada</button>
    <button type="button" disabled={busy || (!state?.consent && !state?.expiresAt)} onClick={()=>void submit('revoke')}>Revogar e remover recibos</button>
    {state?.review && <p data-source-review-result>Fonte: conferida pelo usuário; origem oficial não verificada. {state.review.delayMinutes===null?`Pendência: ${state.review.reason}`:`Variação: ${state.review.delayMinutes} minutos (${state.review.state}).`} Valor: pendente. Entrega: não realizada.</p>}
    {state?.review && state.consent && <FreeDaySourceQueue session={session} revision={state.revision} blocked={busy || Boolean(before && before.documentHash!==state.review.before?.documentHash) || Boolean(after && after.documentHash!==state.review.after?.documentHash)} />}
    {message && <p role="status">{message}</p>}
  </details>;
}
