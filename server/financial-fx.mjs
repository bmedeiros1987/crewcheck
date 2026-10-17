import {validFxQuote} from '../shared/financialFx.mjs';
export const FINANCIAL_FX_PATH='/api/platform/finance/exchange-rates';
export const FINANCIAL_FX_CURRENCIES=['USD','EUR','GBP','JPY','KWD','ARS','CLP','COP','MXN','PEN','UYU','PYG','BOB'];
const ENDPOINT='https://api.frankfurter.dev/v2/rates?base=BRL&quotes='+FINANCIAL_FX_CURRENCIES.join(',')+'&expand=providers';
const DAY=86400000;
// Public currency pairs only; no user/account/amount/ledger data reaches provider.
// One shared in-process daily cache and in-flight request, no paid cron or key.
export function createFinancialFxService({fetchImpl=globalThis.fetch,now=()=>Date.now(),timeoutMs=5000}={}){
 let cache=null,pending=null,retryAfter=0;
 async function refresh(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetchImpl(ENDPOINT,{method:'GET',headers:{accept:'application/json'},signal:controller.signal,redirect:'error'});
   if(!response.ok||Number(response.headers?.get('content-length')||0)>262144)throw Error('FX unavailable');
   const text=await response.text();if(text.length>262144)throw Error('FX response too large');const rows=JSON.parse(text);
   if(!Array.isArray(rows)||rows.length<1||rows.length>FINANCIAL_FX_CURRENCIES.length)throw Error('FX invalid rows');
   const today=new Date(now()).toISOString().slice(0,10),retrievedAt=new Date(now()).toISOString(),quotes={};
   for(const row of rows){
    if(row.base!=='BRL'||!FINANCIAL_FX_CURRENCIES.includes(row.quote)||quotes[row.quote]||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0)throw Error('FX invalid pair');
    const rate=String(row.rate).includes('e')?row.rate.toFixed(12).replace(/0+$/,'').replace(/\.$/,''):String(row.rate);
    const quote={base:'BRL',quote:row.quote,rate,asOf:row.date,source:'Frankfurter v2 · composição diária',method:'blended_daily',retrievedAt,contributors:Array.isArray(row.providers)?row.providers.filter(p=>typeof p.key==='string'&&/^[A-Z0-9_]{1,24}$/.test(p.key)&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&p.date<=row.date).map(p=>({key:p.key,asOf:p.date})):[]};
    if(!validFxQuote(quote,today))throw Error('FX invalid observation');if(Date.parse(today+'T00:00:00Z')-Date.parse(quote.asOf+'T00:00:00Z')>7*DAY)continue;quotes[row.quote]=quote;
   }
   if(!Object.keys(quotes).length)throw Error('FX observations expired');
   cache={state:'available',quotes,retrievedAt,provider:'Frankfurter v2',method:'blended_daily'};retryAfter=0;
  }catch{retryAfter=now()+300000;}
  finally{clearTimeout(timer);}
 }
 return {async read(){
  const age=cache?now()-Date.parse(cache.retrievedAt):Infinity;
  if(age>=DAY&&now()>=retryAfter){pending??=refresh().finally(()=>{pending=null;});await pending;}
  if(!cache||now()-Date.parse(cache.retrievedAt)>7*DAY)return {state:'unavailable',quotes:{},provider:'Frankfurter v2',method:'blended_daily'};
  const today=new Date(now()).toISOString().slice(0,10),quotes=Object.fromEntries(Object.entries(cache.quotes).filter(([,q])=>Date.parse(today+'T00:00:00Z')-Date.parse(q.asOf+'T00:00:00Z')<=7*DAY));
  if(!Object.keys(quotes).length)return {state:'unavailable',quotes:{},provider:'Frankfurter v2',method:'blended_daily'};
  return structuredClone({...cache,quotes,state:now()-Date.parse(cache.retrievedAt)>=DAY?'stale':'available'});
 }};
}
const send=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
export function createFinancialFxHandler({enabled=()=>false,identityProvider,service=createFinancialFxService()}={}){
 return async(req,res,url)=>{
  if(url.pathname!==FINANCIAL_FX_PATH)return false;
  if(req.method!=='GET'){res.setHeader('Allow','GET');send(res,405,{ok:false,state:'unavailable',code:'METHOD_NOT_ALLOWED'});return true;}
  const identity=await identityProvider(req);
  if(identity?.authenticated!==true||identity.role!=='owner'||!identity.ownerId){send(res,403,{ok:false,state:'unavailable',code:'FINANCIAL_OWNER_REQUIRED'});return true;}
  if(url.search){send(res,400,{ok:false,state:'unavailable',code:'FINANCIAL_FX_INVALID_QUERY'});return true;}
  if(!enabled()){send(res,503,{ok:false,state:'unavailable',code:'FINANCIAL_FX_NOT_ENABLED'});return true;}
  const result=await service.read();send(res,result.state==='unavailable'?503:200,{ok:result.state!=='unavailable',...result});return true;
 };
}
