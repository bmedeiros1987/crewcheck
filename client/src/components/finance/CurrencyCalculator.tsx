import {useFinancialFx,FinancialFxSourceControl} from './FinancialFxProvider';
import {getStoredUser,getToken} from '@/lib/authClient';
import {useEffect,useState} from 'react';
import {Calculator} from 'lucide-react';
import {readFinancialFxReferences} from '@/lib/financialFxReference';
import {convertFinancialMinor,parseFinancialDecimal,decimalToMinor} from '@shared/financialFx.mjs';
import {formatFinancialMinor} from '@shared/financialMoney.mjs';
import {FinancialPrivacyToggle,useFinancialPrivacy} from './FinancialPrivacy';
import './persistent-history.css';
// One shared route for menu and the allowance shortcut. Ephemeral simulation only.
export default function CurrencyCalculator(){
 const privacy=useFinancialPrivacy(),fx=useFinancialFx();
 const sessionKey=()=>{const user=getStoredUser(),token=getToken();return user&&token&&!['visitor','guest'].includes(user.role||'')?[user.id,user.email,token].join(':'):'';};
 const key=sessionKey(),empty=(session:string)=>({key:session,amount:'',from:'USD',to:'BRL',rate:'',asOf:''});
 const [draft,setDraft]=useState(()=>empty(key));
 const current=draft.key===key?draft:empty(key);
 const {amount,from,to,rate,asOf}=current;
 const update=(changes:Partial<typeof current>)=>setDraft(previous=>({...((previous.key===key)?previous:empty(key)),...changes,key}));
 useEffect(()=>{const reset=()=>setDraft(empty(sessionKey()));const storage=(e:StorageEvent)=>{if(e.key===null||['crewcheck_auth_user','crewcheck_auth_token'].includes(e.key))reset();};for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(event,reset);window.addEventListener('storage',storage);return()=>{for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.removeEventListener(event,reset);window.removeEventListener('storage',storage);};},[]);
 const today=new Date().toISOString().slice(0,10),decimal=parseFinancialDecimal(amount),minor=decimal===null?null:decimalToMinor(decimal,from),manual=parseFinancialDecimal(rate);
 const directQuote=rate?{base:from,quote:to,rate:manual||'',asOf,source:'Referência informada para esta simulação'}:undefined;
 const result=minor===null?null:convertFinancialMinor({amountMinor:minor,from,to,quotes:fx.quotes,today,directQuote});
 if(!key)return <section className="cc-currency-calculator" aria-label="Calculadora de moedas"><h1>Calculadora de moedas</h1><p>Entre na conta proprietária para usar suas referências.</p></section>;
 return <section className="cc-currency-calculator" aria-label="Calculadora de moedas"><header><Calculator aria-hidden="true"/><h1>Calculadora de moedas</h1><FinancialPrivacyToggle/></header><p>Simulação · não confirma pagamento.</p>
 <label>Valor ({from})<input aria-label="Valor a converter" inputMode="decimal" autoComplete="off" value={privacy.hidden?'':amount} onChange={e=>update({amount:e.target.value})} placeholder={privacy.hidden?'Valor oculto':'Ex.: 1.234,56'}/></label>
 <div className="cc-currency-pair"><label>Moeda de origem<select aria-label="Moeda de origem" value={from} onChange={e=>{update({from:e.target.value,rate:'',asOf:''});}}>{['BRL','USD','EUR','GBP','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label><label>Moeda de destino<select aria-label="Moeda de destino" value={to} onChange={e=>{update({to:e.target.value,rate:'',asOf:''});}}>{['BRL','USD','EUR','GBP','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label></div>
 <details><summary>Ver cálculo</summary><FinancialFxSourceControl/><details><summary>Informar cotação para esta simulação</summary><label>1 {from} em {to}<input aria-label="Cotação da simulação" inputMode="decimal" autoComplete="off" value={privacy.hidden?'':rate} onChange={e=>update({rate:e.target.value})} placeholder={privacy.hidden?'Valor oculto':'Ex.: 5,20'}/></label><label>Data da cotação<input type="date" aria-label="Data da cotação" value={asOf} max={today} onChange={e=>update({asOf:e.target.value})}/></label></details>{result?.references?.map((q:any,index:number)=><p key={index}>{q.source} · {q.asOf}{q.asOf<today?' · data anterior à consulta':''} · 1 {q.base||from} = {privacy.amount(q.rate)} {q.quote||to}{q.retrievedAt?` · consulta ${q.retrievedAt}`:''}</p>)}</details>
 <div role="status"><h2>Resultado estimado</h2><strong>{privacy.hidden?'Valor oculto':!amount?'Informe um valor':minor===null?'Valor ou precisão inválida':result?.amountMinor===null?'Cotação/data indisponível ou incompatível':formatFinancialMinor(result?.amountMinor,to)||'Não calculável'}</strong>{fx.mode==='automatic'&&!rate&&fx.state!=='available'&&<p role="status">{fx.state==='stale'?'Cotação em cache; atualização indisponível.':fx.state==='loading'?'Consultando câmbio…':'Cotação automática indisponível.'}</p>}</div>
 <p>Sem IOF, tarifas ou garantia de taxa executável. A simulação não é salva no histórico.</p>
 </section>;
}
