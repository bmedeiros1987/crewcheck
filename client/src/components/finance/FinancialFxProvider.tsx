import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {authFetch,getStoredUser,getToken} from '@/lib/authClient';
import {readFinancialFxReferences,type FxQuote} from '@/lib/financialFxReference';
import {validFxQuote} from '@shared/financialFx.mjs';
type Mode='automatic'|'manual';
type FxReason='disabled'|'access'|'temporary'|'invalid';
type Data={reason?:FxReason;state:'available'|'stale'|'unavailable'|'loading';quotes:Record<string,FxQuote>};
type ContextValue=Data&{mode:Mode;setMode:(mode:Mode)=>void};
const Context=createContext<ContextValue|null>(null);
const DAY=86400000;
function usableQuotes(quotes:Record<string,FxQuote>,instant:number){
 const today=new Date(instant).toISOString().slice(0,10);
 return Object.fromEntries(Object.entries(quotes).filter(([,q])=>validFxQuote(q,today)&&typeof q.retrievedAt==='string'&&Number.isFinite(Date.parse(q.retrievedAt))&&Date.parse(q.retrievedAt)<=instant+60000&&instant-Date.parse(q.retrievedAt)<=7*DAY));
}
// Public references are scoped to the requesting session. A failure never renews
// their original retrieval timestamp, and an explicit OFF/access denial clears them.
export function createFinancialFxLoader({request=authFetch<any>,now=()=>Date.now(),timeoutMs=8000}={}){
 let owner='',cached:Data|null=null,cacheUntil=0,pending:Promise<Data>|null=null,generation=0;
 return async function automatic(session:string,revalidate=false):Promise<Data>{
  if(owner!==session){owner=session;cached=null;cacheUntil=0;pending=null;generation++;}
  const at=now(),retained=cached?usableQuotes(cached.quotes,at):{};
  if(cached&&Object.keys(retained).length!==Object.keys(cached.quotes).length)cached={state:'unavailable',reason:'invalid',quotes:{}};
  if(cached&&at<cacheUntil&&(!revalidate||cached.state!=='available'))return cached;
  if(!pending){const revision=generation,previous=cached,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   const task=request('/api/platform/finance/exchange-rates',{signal:controller.signal}).then(body=>{
    if(!['available','stale'].includes(body?.state)||body.method!=='blended_daily'||!body.quotes||typeof body.quotes!=='object'||Array.isArray(body.quotes)||!Object.keys(body.quotes).length)throw {fxInvalid:true};
    const quotes:Record<string,FxQuote>={};
    for(const [currency,raw] of Object.entries(body.quotes)){const q=raw as any;if(!q||typeof q!=='object'||!/^[A-Z]{3}$/.test(currency)||q.base!=='BRL'||q.quote!==currency||q.method!=='blended_daily'||!usableQuotes({[currency]:q},now())[currency])throw {fxInvalid:true};quotes[currency]=q;}
    return {state:body.state,quotes} as Data;
   }).catch(error=>{
    const reason:FxReason=error?.code==='FINANCIAL_FX_NOT_ENABLED'?'disabled':[401,403].includes(error?.status)?'access':error?.fxInvalid||(error?.status>=400&&error?.status<500&&![408,429].includes(error.status))?'invalid':'temporary';
    const quotes=reason==='temporary'&&previous?usableQuotes(previous.quotes,now()):{};
    return Object.keys(quotes).length?{state:'stale',reason,quotes} as Data:{state:'unavailable',reason,quotes:{}} as Data;
   }).then(data=>{if(revision===generation){cached=data;cacheUntil=now()+(data.state==='available'?1800000:300000);}return data;}).finally(()=>{clearTimeout(timer);if(revision===generation)pending=null;});
   pending=task;
  }
  return pending;
 };
}
const automatic=createFinancialFxLoader();
export function financialFxMessage(fx:Data){
 if(fx.state==='loading')return 'Consultando câmbio…';
 if(fx.state==='stale')return 'Cotação em cache; atualização indisponível. Confira a data da referência.';
 if(fx.state==='available')return 'Referência diária; não é cotação em tempo real.';
 return fx.reason==='disabled'?'Cotação automática ainda não está ativada.':fx.reason==='access'?'Entre novamente na sua conta para consultar o câmbio.':fx.reason==='invalid'?'Não foi possível validar a cotação e a data recebidas.':'Cotação automática indisponível no momento.';
}

function key(){const user=getStoredUser(),token=getToken();return user&&token&&!['visitor','guest'].includes(user.role||'')?[user.id,user.email,token].join(':'):'';}
export function FinancialFxProvider({children,accessKey=''}:{children:ReactNode;accessKey?:string}){
 const [,refresh]=useState(0),owner=key(),manual=readFinancialFxReferences(),initial:Mode=Object.keys(manual).length?'manual':'automatic';
 const [selection,setSelection]=useState({owner,mode:initial}),[remote,setRemote]=useState<{owner:string;data:Data}>({owner:'',data:{state:'loading',quotes:{}}});
 const mode=selection.owner===owner?selection.mode:initial;
 useEffect(()=>{const reset=()=>refresh(n=>n+1);for(const e of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:financial-config-changed','storage'])window.addEventListener(e,reset);return()=>{for(const e of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:financial-config-changed','storage'])window.removeEventListener(e,reset);};},[]);
 useEffect(()=>{let current=true;
  const revalidate=()=>{if(!owner||mode!=='automatic'||document.visibilityState==='hidden')return;
   // Revalidate at access boundaries, never by a polling timer. The server's
   // daily cache still bounds upstream cost; an OFF response clears old quotes.
   setRemote({owner,data:{state:'loading',quotes:{}}});
   void automatic(owner,true).then(data=>{if(current&&key()===owner)setRemote({owner,data});});
  };
  revalidate();window.addEventListener('focus',revalidate);document.addEventListener('visibilitychange',revalidate);
  return()=>{current=false;window.removeEventListener('focus',revalidate);document.removeEventListener('visibilitychange',revalidate);};
 },[owner,mode,accessKey]);
 const data:Data=!owner?{state:'unavailable',quotes:{}}:mode==='manual'?{state:Object.keys(manual).length?'available':'unavailable',quotes:manual}:remote.owner===owner?remote.data:{state:'loading',quotes:{}};
 return <Context.Provider value={{...data,mode,setMode:mode=>setSelection({owner:key(),mode})}}>{children}</Context.Provider>;
}
export function useFinancialFx():ContextValue{return useContext(Context)||{state:'available',quotes:readFinancialFxReferences(),mode:'manual',setMode:()=>{}};}
export function FinancialFxSourceControl(){const fx=useFinancialFx();return <label className="cc-fx-source"><span>Fonte do câmbio</span><select aria-label="Fonte do câmbio" value={fx.mode} onChange={e=>fx.setMode(e.target.value as Mode)}><option value="automatic">Frankfurter · referência diária</option><option value="manual">Referências informadas nesta conta</option></select>{fx.mode==='automatic'&&<><small role="status">{financialFxMessage(fx)}</small>{Object.entries(fx.quotes).map(([currency,quote])=><small key={currency}>{currency} · {quote.source} · observação {quote.asOf} · consulta {quote.retrievedAt||'não informada'}</small>)}</>}</label>;}
