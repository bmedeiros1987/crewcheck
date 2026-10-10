import {useEffect,useRef,useState} from 'react';
import {parsePDF} from '@/lib/pdfParser';
import {getToken,getStoredUser} from '@/lib/authClient';
import {minimalVoluntaryReceipt,type VoluntaryReceipt} from '@/lib/freeDaySources';
const scope='free-day-voluntary-review-v1';
type ReviewState={revision:number;consent:boolean;expiresAt:string|null;review:{sourceStatus:string;state:string;reason:string|null;delayMinutes:number|null;possibleAmount:null}|null};
export function FreeDaySourceConsent({session,bound}:{session:string;bound:boolean}) {
  const [before,setBefore]=useState<VoluntaryReceipt|null>(null),[after,setAfter]=useState<VoluntaryReceipt|null>(null);
  const [state,setState]=useState<ReviewState|null>(null),[date,setDate]=useState(''),[confirmed,setConfirmed]=useState(false),[consent,setConsent]=useState(false);
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const generation=useRef(0),mounted=useRef(true);
  const identity=()=>JSON.stringify([getToken(),getStoredUser()?.id,getStoredUser()?.email]);
  const initialIdentity=useRef(identity());
  const fresh=(g:number,key:string)=>mounted.current && generation.current===g && identity()===key && initialIdentity.current===key;
  useEffect(()=>{
    mounted.current=true; initialIdentity.current=identity();
    const reset=()=>{generation.current++;setBefore(null);setAfter(null);setState(null);setConfirmed(false);setConsent(false);setDate('');setBusy(false);setMessage('Sessão alterada. Reabra a revisão nesta conta.');};
    const storage=(e:StorageEvent)=>{if (!e.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(e.key)) reset();};
    window.addEventListener('crewcheck:auth-changed',reset);window.addEventListener('crewcheck:auth-expired',reset);window.addEventListener('storage',storage);
    const g=generation.current,key=identity();
    if(bound && getToken()) void fetch('/api/notifications/free-day-sources',{headers:{authorization:`Bearer ${getToken()}`},cache:'no-store'}).then(async r=>{const body=await r.json();if(fresh(g,key)){if(r.ok)setState(body);else setMessage(body.code || 'Revisão indisponível.');}}).catch(()=>{if(fresh(g,key))setMessage('Revisão indisponível.');});
    return ()=>{mounted.current=false;generation.current++;window.removeEventListener('crewcheck:auth-changed',reset);window.removeEventListener('crewcheck:auth-expired',reset);window.removeEventListener('storage',storage);};
  },[session,bound]);
  const select=async(file:File|undefined,side:'before'|'after')=>{
    if(!file || !bound || identity()!==initialIdentity.current)return;
    const g=generation.current,key=identity();setBusy(true);setConfirmed(false);setConsent(false);setMessage('');
    try {
      if(file.size>15*1024*1024)throw Error('Selecione um PDF de até 15 MB.');
      const bytes=await file.arrayBuffer(),roster=await parsePDF(file),receipt=await minimalVoluntaryReceipt(roster,bytes);
      if(fresh(g,key)){(side==='before'?setBefore:setAfter)(receipt);setMessage('PDF lido localmente. Confira os inícios e fusos abaixo.');}
    }catch(e){if(fresh(g,key)){(side==='before'?setBefore:setAfter)(null);setMessage(e instanceof Error?e.message:'PDF inválido.');}}finally{if(fresh(g,key))setBusy(false);}
  };
  const submit=async(action:'review'|'revoke')=>{
    if(!bound || !state || identity()!==initialIdentity.current)return;
    const g=generation.current,key=identity(),token=getToken();setBusy(true);
    try {
      const body={scope,action,expectedRevision:state.revision,...(action==='review'?{before,after,sequenceDate:date,confirmed,consent}:{})};
      const r=await fetch('/api/notifications/free-day-sources',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await r.json();
      if(fresh(g,key)){if(!r.ok){setState(null);throw Error(result.code || 'Revisão indisponível. Reabra a tela.');}setState(result);if(action==='revoke'){setBefore(null);setAfter(null);setConfirmed(false);setConsent(false);setDate('');}setMessage(action==='revoke'?'Consentimento revogado e recibos removidos.':'Revisão simulada salva. Nenhuma mensagem enviada.');}
    }catch(e){if(fresh(g,key))setMessage(e instanceof Error?e.message:'Revisão indisponível.');}finally{if(fresh(g,key))setBusy(false);}
  };
  if(!bound)return null;
  return <details data-free-day-source-consent><summary>Revisar duas publicações e consentimento para alertas</summary>
    <p>Selecione voluntariamente os PDFs anterior e revisado. A leitura ocorre neste dispositivo; serão enviados somente hashes, período, identidade pseudonimizada e datas/horários/fusos de folga. Os PDFs, nomes e texto integral não serão enviados por esta revisão.</p>
    <p>Fonte declarada → conferida por você. Origem oficial verificada: indisponível. Telegram: vínculo não verificado; envio desabilitado, inclusive com o app fechado.</p>
    {(['before','after'] as const).map(side=><div key={side}><label>{side==='before'?'Publicação anterior':'Publicação revisada'}<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{void select(e.target.files?.[0],side);e.target.value='';}} /></label>
      {(side==='before'?before:after) && <div><p>Período {(side==='before'?before:after)!.period} · hash {(side==='before'?before:after)!.documentHash.slice(0,12)}</p><ul>{(side==='before'?before:after)!.starts.map(s=><li key={s.date}>{s.date}: {s.literal?`${s.clock} · UTC${s.offset!>=0?'+':''}${s.offset!/60}`:'Início literal ou fuso pendente'}</li>)}</ul></div>}</div>)}
    <label>Data de início da sequência nas duas versões<input type="date" value={date} onChange={e=>{setDate(e.target.value);setConfirmed(false);}} /></label>
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />Conferi identidade, período, início literal e fuso das duas publicações.</label>
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />Autorizo nesta conta a preparação de alertas de postergação por 30 dias, usando estes dados mínimos. Entendo que o envio ainda está desabilitado.</label>
    <p>Os recibos expiram em 30 dias; a exclusão física ocorre no próximo acesso após expirar. Revogar remove os dois recibos desta revisão. A revisão anterior será substituída se eu salvar outra comparação.</p>
    <button type="button" disabled={busy || !state || !before || !after || !date || !confirmed || !consent} onClick={()=>void submit('review')}>Salvar revisão simulada</button>
    <button type="button" disabled={busy || !state?.consent} onClick={()=>void submit('revoke')}>Revogar e remover recibos</button>
    {state?.review && <p data-source-review-result>Fonte: conferida pelo usuário; origem oficial não verificada. {state.review.delayMinutes===null?`Pendência: ${state.review.reason}`:`Variação: ${state.review.delayMinutes} minutos (${state.review.state}).`} Valor: pendente. Entrega: não realizada.</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
