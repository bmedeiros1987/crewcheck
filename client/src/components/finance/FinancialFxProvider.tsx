import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {authFetch,getStoredUser,getToken} from '@/lib/authClient';
import {readFinancialFxReferences,type FxQuote} from '@/lib/financialFxReference';
import {validFxQuote} from '@shared/financialFx.mjs';
type Mode='automatic'|'manual';
type Data={state:'available'|'stale'|'unavailable'|'loading';quotes:Record<string,FxQuote>};
type ContextValue=Data&{mode:Mode;setMode:(mode:Mode)=>void};
const Context=createContext<ContextValue|null>(null);
let cached:Data|null=null,cacheUntil=0,pending:Promise<Data>|null=null;
async function automatic(revalidate=false):Promise<Data>{
 if(cached&&Date.now()<cacheUntil&&(!revalidate||cached.state==='unavailable'))return cached;
 if(!pending){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 pending=authFetch<any>('/api/platform/finance/exchange-rates',{signal:controller.signal}).then(body=>{
  if(!['available','stale'].includes(body?.state)||body.method!=='blended_daily'||!body.quotes||typeof body.quotes!=='object')throw Error('Invalid FX response');
  const quotes:Record<string,FxQuote>={},today=new Date().toISOString().slice(0,10);
  for(const [currency,raw] of Object.entries(body.quotes)){const q=raw as any;if(!/^[A-Z]{3}$/.test(currency)||q.base!=='BRL'||q.quote!==currency||q.method!=='blended_daily'||typeof q.retrievedAt!=='string'||!Number.isFinite(Date.parse(q.retrievedAt))||Date.parse(q.retrievedAt)>Date.now()+60000||!validFxQuote(q,today)||Date.parse(today+'T00:00:00Z')-Date.parse(q.asOf+'T00:00:00Z')>7*86400000)throw Error('Invalid FX quote');quotes[currency]=q;}
  cached={state:body.state,quotes};cacheUntil=Date.now()+1800000;return cached;
 }).catch(()=>{cached={state:'unavailable',quotes:{}};cacheUntil=Date.now()+300000;return cached;}).finally(()=>{clearTimeout(timer);pending=null;});}
 return pending;
}
function key(){const user=getStoredUser(),token=getToken();return user&&token&&!['visitor','guest'].includes(user.role||'')?[user.id,user.email,token].join(':'):'';}
export function FinancialFxProvider({children}:{children:ReactNode}){
 const [,refresh]=useState(0),owner=key(),manual=readFinancialFxReferences(),initial:Mode=Object.keys(manual).length?'manual':'automatic';
 const [selection,setSelection]=useState({owner,mode:initial}),[remote,setRemote]=useState<{owner:string;data:Data}>({owner:'',data:{state:'loading',quotes:{}}});
 const mode=selection.owner===owner?selection.mode:initial;
 useEffect(()=>{const reset=()=>refresh(n=>n+1);for(const e of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:financial-config-changed','storage'])window.addEventListener(e,reset);return()=>{for(const e of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:financial-config-changed','storage'])window.removeEventListener(e,reset);};},[]);
 useEffect(()=>{let current=true;
  const revalidate=()=>{if(!owner||mode!=='automatic'||document.visibilityState==='hidden')return;
   // Revalidate at access boundaries, never by a polling timer. The server's
   // daily cache still bounds upstream cost; an OFF response clears old quotes.
   setRemote({owner,data:{state:'loading',quotes:{}}});
   void automatic(true).then(data=>{if(current&&key()===owner)setRemote({owner,data});});
  };
  revalidate();window.addEventListener('focus',revalidate);document.addEventListener('visibilitychange',revalidate);
  return()=>{current=false;window.removeEventListener('focus',revalidate);document.removeEventListener('visibilitychange',revalidate);};
 },[owner,mode]);
 const data:Data=!owner?{state:'unavailable',quotes:{}}:mode==='manual'?{state:Object.keys(manual).length?'available':'unavailable',quotes:manual}:remote.owner===owner?remote.data:{state:'loading',quotes:{}};
 return <Context.Provider value={{...data,mode,setMode:mode=>setSelection({owner:key(),mode})}}>{children}</Context.Provider>;
}
export function useFinancialFx():ContextValue{return useContext(Context)||{state:'available',quotes:readFinancialFxReferences(),mode:'manual',setMode:()=>{}};}
export function FinancialFxSourceControl(){const fx=useFinancialFx();return <label className="cc-fx-source"><span>Fonte do câmbio</span><select aria-label="Fonte do câmbio" value={fx.mode} onChange={e=>fx.setMode(e.target.value as Mode)}><option value="automatic">Frankfurter · referência diária</option><option value="manual">Referências informadas nesta conta</option></select>{fx.mode==='automatic'&&<><small role="status">{fx.state==='loading'?'Consultando referência…':fx.state==='stale'?'Cotação em cache; atualização indisponível.':fx.state==='unavailable'?'Cotação automática indisponível.': 'Referência diária; não é cotação em tempo real.'}</small>{Object.entries(fx.quotes).map(([currency,quote])=><small key={currency}>{currency} · {quote.source} · observação {quote.asOf} · consulta {quote.retrievedAt||'não informada'}</small>)}</>}</label>;}
