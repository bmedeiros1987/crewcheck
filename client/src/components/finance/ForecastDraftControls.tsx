import {useEffect,useRef,useState} from 'react';
import {Save,RotateCcw,Trash2} from 'lucide-react';
import {captureAuthSession} from '@/lib/authClient';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {deriveForecastPlan,readForecastDraft,readLatestForecastDraft,saveForecastDraft,removeForecastDraft} from '@/lib/financialForecastDrafts';

type Values=Record<string,string|boolean|string[]>;
type Props={kind:'vacation'|'thirteenth';session:string|null;guard:ReturnType<typeof captureAuthSession>|null;draftRevision:number;values:Values;onRestore:(values:Values)=>void};
const failure=(status:string)=>status==='conflict'?'O preenchimento mudou em outra aba. Reutilize antes de salvar.':status==='invalid'?'Não foi possível validar este preenchimento.':status==='missing'?'Nenhum preenchimento disponível nesta conta.':status==='stale'?'A conta mudou. Abra a simulação novamente.':'Não foi possível acessar o preenchimento neste aparelho.';

export default function ForecastDraftControls({kind,session,guard,draftRevision,values,onRestore}:Props){
 const planId=deriveForecastPlan(kind,values),label=kind==='thirteenth'?'13º':'férias';
 const currentDraft=useRef({kind,session,planId,draftRevision});
 currentDraft.current={kind,session,planId,draftRevision};
 const [state,setState]=useState<{session:string|null;guard:Props['guard'];planId:string|null;revision:string|null;busy:boolean;message:string}>({session:null,guard:null,planId:null,revision:null,busy:false,message:''});
 const live=Boolean(guard?.token&&guard.isCurrent()&&session&&session===financialRateSession());
 const stateCurrent=live&&state.session===session&&state.planId===planId&&state.guard?.isCurrent();
 const busy=Boolean(stateCurrent&&state.busy),message=stateCurrent?state.message:'';
 useEffect(()=>{
  if(!guard?.isCurrent()||!session||session!==financialRateSession())return;
  // Keep the revision seen when this period was opened. Typing must not silently
  // accept a newer version written by another tab.
  if(state.session===session&&state.planId===planId&&state.guard?.isCurrent())return;
  const found=planId?readForecastDraft(kind,planId,{guard,session}):null;
  if(!guard.isCurrent()||session!==financialRateSession())return;
  setState({session,guard,planId,revision:found?.status==='found'?found.record.revision:null,busy:false,message:found&&['invalid','unavailable'].includes(found.status)?failure(found.status):''});
 },[kind,planId,session,guard]);
 async function save(){
  if(!live||!guard||!session||!planId||busy)return;
  const captured=guard,expected=stateCurrent&&state.planId===planId?state.revision:null;
  setState({session,guard:captured,planId,revision:expected,busy:true,message:''});
  const result=await saveForecastDraft(kind,values,expected,{guard:captured,session});
  if(!captured.isCurrent()||session!==financialRateSession()||currentDraft.current.kind!==kind||currentDraft.current.planId!==planId)return;
  setState({session,guard:captured,planId,revision:result.status==='saved'?result.record.revision:expected,busy:false,message:result.status==='saved'?(currentDraft.current.draftRevision===draftRevision?'Preenchimento salvo neste aparelho.':'Preenchimento anterior salvo. Há alterações não salvas.'):failure(result.status)});
 }
 function restore(){
  if(!live||!guard||!session||busy)return;
  const captured=guard,result=readLatestForecastDraft(kind,{guard:captured,session});
  if(!captured.isCurrent()||session!==financialRateSession())return;
  if(result.status!=='found'){setState({session,guard:captured,planId,revision:stateCurrent?state.revision:null,busy:false,message:failure(result.status)});return;}
  onRestore(result.record.values);
  if(!captured.isCurrent()||session!==financialRateSession())return;
  setState({session,guard:captured,planId:result.record.planId,revision:result.record.revision,busy:false,message:`Preenchimento do aparelho · salvo em ${new Date(result.record.savedAt).toLocaleDateString('pt-BR')}. Confira fontes e enquadramento novamente.`});
 }
 async function remove(){
  if(!live||!guard||!session||!planId||busy||!stateCurrent||!state.revision)return;
  const captured=guard,expected=state.revision;
  setState({...state,guard:captured,busy:true,message:''});
  const result=await removeForecastDraft(kind,planId,expected,{guard:captured,session});
  if(!captured.isCurrent()||session!==financialRateSession()||currentDraft.current.kind!==kind||currentDraft.current.planId!==planId)return;
  setState({session,guard:captured,planId,revision:result.status==='removed'||result.status==='missing'?null:expected,busy:false,message:result.status==='removed'||result.status==='missing'?'Preenchimento deste período removido.':failure(result.status)});
 }
 return <div data-forecast-draft-controls>
  <div className="cc-forecast-draft-actions" role="group" aria-label={`Preenchimento local de ${label}`}>
   <button type="button" onClick={()=>void save()} disabled={!live||!planId||busy} aria-label={`Salvar preenchimento de ${label}`} title={planId?'Salvar neste aparelho':'Informe ano ou período aquisitivo para salvar'}><Save aria-hidden="true"/> Salvar</button>
   <button type="button" onClick={restore} disabled={!live||busy} aria-label={`Reutilizar último preenchimento de ${label}`}><RotateCcw aria-hidden="true"/> Reutilizar último</button>
  </div>
  <small>Preenchimento opcional, só nesta conta e aparelho. Não altera a folha.</small>
  <p role="status" aria-live="polite">{message}</p>
  <details><summary>Gerenciar preenchimento</summary><button type="button" onClick={()=>void remove()} disabled={!stateCurrent||!state.revision||busy} aria-label={`Apagar preenchimento de ${label}`}><Trash2 aria-hidden="true"/> Apagar este período</button></details>
 </div>;
}
