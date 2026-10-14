import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the actual materialized Home handler/listener and actual guard functions.
// Only parser/DB/network/React effects and authentication storage are synthetic.
const homePath = process.env.SHARE_WEB_HOME || 'client/src/pages/Home.tsx';
const source = fs.readFileSync(homePath, 'utf8');
const fixed = source.includes('function captureSharedPdfImport(');
const bound = source.includes('sharedPdfAccountReceipt(payload)');
function between(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert(a >= 0 && b > a, 'real function boundaries must exist');
  return text.slice(a, b);
}
const handler = between(source, '  async function handleFile(inputEvent:', '  async function copyCurrentSummarySilently(');
const saveFunction = between(source, 'function saveRoster(roster:', 'type PlannedRosterSnapshot');
const listener = between(source, '    const consumeNativePdf = async', '    const onNativePdf =');
const capture = fixed ? between(source, '  function captureSharedPdfImport(', '  useEffect(() => {\n    let alive = true;') : '';
const plannedGuard = fs.readFileSync('client/src/lib/plannedRosterStore.ts','utf8').split('let importRevision = 0;')[1];
const choiceGuard = between(fs.readFileSync('client/src/lib/rosterStartup.ts','utf8'), 'let choiceEpoch = 0;', '// Capture a read fence');
const pdf = Buffer.from('%PDF-1.7\nSynthetic roster only\n');
const durable = {filename:'Synthetic.pdf',shareId:'synthetic-share-1',byteLength:pdf.length,transport:'android-private-inbox'};
const legacy = {filename:'Synthetic.pdf',shareId:'synthetic-share-1',dataBase64:pdf.toString('base64')};
const pwa = {sourceFileName:'Synthetic.pdf',shareId:'pwa:synthetic-share-1',dataBase64:pdf.toString('base64')};
let checks = 0;
const failures = [];
const results = [];
async function scenario(name, payload, options = {}) {
  const state = {owner:'owner-A',token:'token-A',revision:'p0',parse:0,save:0,bundle:0,acks:[],chunks:0,toasts:[],active:'original-roster',confirmed:false,...options};
  const suppliedPdf=options.largePdf?Buffer.concat([pdf,Buffer.alloc(400000)]):pdf;
  if(options.largePdf)payload={...payload,byteLength:suppliedPdf.length};
  const values = new Map(options.persistedValues || []);
  const listeners = new Map();
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>{if((state.storageFailure&&k===state.owner)||(state.bindingStorageFailure&&k.startsWith('crewcheck:shared-pdf-account:')))throw new Error('Synthetic storage blocked');values.set(k,String(v));if(k===state.owner&&String(v).includes('sourceFileName'))state.active='imported-roster';}};
  const window = {atob:x=>{state.decodes=(state.decodes||0)+1;return atob(x);},localStorage:storage,setTimeout:fn=>fn(),addEventListener:(n,fn)=>{const a=listeners.get(n)||[];a.push(fn);listeners.set(n,a);},dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e);},AndroidCrewCheckNative:{
    readSharedPdfChunk:(id,offset,length)=>{state.chunks++;assert.equal(id,payload.shareId);if(state.onChunk)state.onChunk(state);if(state.badChunk)return '';if(state.oversizedChunk)return Buffer.alloc(Number(length)+1).toString('base64');return suppliedPdf.subarray(Number(offset),Number(offset)+Number(length)).toString('base64');},
    acknowledgeSharedPdf:id=>{state.acks.push(id);if(state.ackReplacePending)window.__crewcheckPendingNativePdf={...durable,shareId:'new-share-after-late-ACK'};if(state.ackFailure)return false;if(state.ackPromise)return Promise.resolve(true);return true;},
  },__crewcheckPendingNativePdf:payload};
  if(options.noBridge)delete window.AndroidCrewCheckNative;
  else if(options.noAck)delete window.AndroidCrewCheckNative.acknowledgeSharedPdf;
  if(options.pwaRuntime){
    window.btoa=btoa;window.location={href:options.pwaUrl||'https://synthetic.crewcheck.invalid/?crewcheckSharedPdf=synthetic-share-1'};
    window.history={state:null,replaceState:(_state,_title,url)=>{window.location.href=new URL(url,window.location.href).href;}};
  }
  const toast = Object.fromEntries(['message','error','success','info'].map(k=>[k,x=>state.toasts.push([k,x])]));
  const context = vm.createContext({module:{exports:{}},window,localStorage:storage,sessionStorage:storage,crypto:{randomUUID:()=>String(Math.random())},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},File,Uint8Array,Set,console,alive:true,nativePdfClaimsRef:{current:new Set()},
    financialRateSession:()=>state.owner&&state.token?state.owner+':'+state.token:null,getStoredUser:()=>state.owner?{id:state.owner}:null,startupOwner:()=>state.owner,getToken:()=>state.token,clearEpoch:()=>'',startupKey:()=>state.owner,readChoiceRevision:k=>storage.getItem(k),
    publicationOwner:()=>state.owner,currentPublicationReview:()=>({publication:{revision:state.revision}}),
    beginRosterChoice:undefined,toast,fileRef:{current:{value:'x'}},setBusy:()=>{},bundle:{roster:{year:2032,month:10,days:[]}},
    parsePDFResilient:async()=>{state.parse++;if(state.onParse)state.onParse(state);if(state.replacePending)window.__crewcheckPendingNativePdf={...durable,shareId:'other-share'};if(state.invalidate==='planned')vm.runInContext('beginOwnedPlannedImport()',context);if(state.invalidate==='choice')vm.runInContext('beginRosterChoice()',context);if(state.parserFailure)throw new Error('Synthetic parser failure');return {roster:{year:2032,month:10,days:state.empty?[]:[{date:'2032-10-13'}]},source:'synthetic'};},
    confirmRosterImport:async()=>{if(state.onConfirm)state.onConfirm(state);state.confirmed=!state.cancel;return {ok:!state.cancel,hasFuture:true,summaryText:'synthetic',periodLabel:'synthetic'};},
    preservePlannedRosterBeforeImport:()=>null,sameRosterPeriod:()=>false,compareRosters:()=>null,
    buildCanonicalRosterEvents:x=>x,normalizeRosterDays:x=>x,recordPublication:async()=>{if(state.onPublication)state.onPublication(state);},
    analyzeSafe:()=>{state.save++;return {};},ROSTER_CACHE_SCHEMA:'synthetic',startupIntentRevision:()=>'',recomputeComplianceWithRegulatoryHistory:async()=>{if(state.onCompliance)state.onCompliance(state);if(state.complianceFailure)throw new Error('Synthetic compliance failure');return {compliance:{}};},
    getGymRecommendations:()=>[],storage:{set:()=>{}},setBundle:()=>{state.bundle++;if(state.cleanupOnCommit)context.alive=false;},publishCrewCheckNotice:()=>{},
    syncRosterWithTelegramConcierge:async()=>{},saveRosterAnalysis:async()=>{},syncPlatformRoster:async()=>{},setView:()=>{},setLocation:()=>{},sanitizePdfImportError:x=>x.message,
  });
  if(bound){
    const binding=fs.readFileSync('client/src/lib/sharedPdfAccountBinding.ts','utf8').replace(/^import .*;\n/m,'');
    vm.runInContext(transformSync(binding,{loader:'ts',format:'cjs'}).code,context);
  }
  const code = 'let importRevision = 0;'+plannedGuard+'\n'+choiceGuard+'\n'+capture+'\n'+saveFunction+'\n'+handler+'\n'+listener+'\nglobalThis.consume=consumeNativePdf;globalThis.importHandler=handleFile;';
  vm.runInContext(transformSync(code,{loader:'ts',format:'cjs',target:'es2022'}).code,context);
  let pwaConsumer;
  if(options.pwaRuntime){
    const runtime=fs.readFileSync(process.env.SHARE_WEB_PWA || 'client/src/lib/pwaSharedPdfRuntime.ts','utf8').replace(/^import .*;\n/m,'');
    context.fetch=async()=>{if(state.offline)throw new Error('Synthetic offline');state.pwaFetches=(state.pwaFetches||0)+1;return new Response(new Blob([suppliedPdf]),{headers:{'x-crewcheck-filename':'Synthetic.pdf'}});};
    Object.assign(context,{URL,Response,Blob,TextDecoder});
    vm.runInContext(transformSync(runtime.slice(0,runtime.lastIndexOf("if (typeof window"))+'\nglobalThis.consumePwa=consumePwaSharedPdf;',{loader:'ts',format:'cjs'}).code,context);
    const imports=[];window.addEventListener('crewcheck:native-pdf',e=>imports.push(context.consume(e.detail)));
    delete window.__crewcheckPendingNativePdf;
    pwaConsumer=context.consumePwa;await pwaConsumer();await Promise.all(imports);
  }else if(options.onlyReceipt){ /* Bootstrap captures the receipt even without Home. */ }else if(options.manual)state.result=await context.importHandler({target:{files:[new File([suppliedPdf],'Synthetic.pdf',{type:'application/pdf'})]}});
  else await context.consume(payload);
  const first = {parse:state.parse,save:state.save,bundle:state.bundle,acks:state.acks.length,pending:Boolean(window.__crewcheckPendingNativePdf),claims:context.nativePdfClaimsRef.current.size};
  if(options.concurrentSameId)await Promise.all([context.consume(payload),context.consume(payload)]);
  if(options.concurrentDistinct){
    state.cancel=false;
    const next={...payload,shareId:'synthetic-share-2'};context.nativePdfClaimsRef.current=new Set();
    window.__crewcheckPendingNativePdf=next;
    await Promise.all([context.consume(payload),context.consume(next)]);
  }
  if(options.retry){state.parserFailure=false;state.cancel=false;state.empty=false;state.complianceFailure=false;state.badChunk=false;state.oversizedChunk=false;state.ackFailure=false;await context.consume(payload);}
  if(options.replayLifecycle){
    // Replaced effect keeps the React ref; a successful finalized payload is absent.
    context.alive=true;
    if(window.__crewcheckPendingNativePdf)await context.consume(window.__crewcheckPendingNativePdf);
    // A reload has a new ref. Only the pending pointer can request a replay here.
    context.nativePdfClaimsRef.current=new Set();
    if(window.__crewcheckPendingNativePdf)await context.consume(window.__crewcheckPendingNativePdf);
    if(pwaConsumer)await pwaConsumer();
  }
  results.push({name,first,after:{parse:state.parse,save:state.save,bundle:state.bundle,acks:state.acks.length,pending:Boolean(window.__crewcheckPendingNativePdf)}});
  return {state,first,window,values,context,pwaConsumer};
}
function check(condition, label) {checks++;if(!condition)failures.push(label);if(!process.env.SHARE_WEB_OBSERVE)assert(condition,label);}
let r=await scenario('durable metadata reaches actual importer',durable);
check(r.state.parse===1&&r.state.save===1&&r.state.bundle===1&&r.state.acks.length===1&&!r.window.__crewcheckPendingNativePdf,'durable contract must import and ACK after commit');
r=await scenario('multiple bounded chunks',durable,{largePdf:true});
check(r.state.chunks===3&&r.state.save===1&&r.state.acks.length===1,'multi-chunk transport must import exact assembled PDF');
r=await scenario('legacy Base64 remains compatible',legacy);
check(r.state.parse===1&&r.state.save===1&&r.state.acks[0]===legacy.shareId,'legacy must still import');
for (const [name, opts] of [['parser failure',{parserFailure:true}],['confirmation cancelled',{cancel:true}],['empty roster',{empty:true}],['compliance failure',{complianceFailure:true}],['bad native chunk',{badChunk:true}]]) {
  r=await scenario(name,name==='bad native chunk'?durable:legacy,{...opts,retry:true});
  check(r.first.save===0&&r.first.bundle===0&&r.first.acks===0&&r.first.pending&&r.first.claims===0,name+' must preserve roster/pending and release retry claim');
  check(r.state.save===1&&r.state.bundle===1&&r.state.acks.length===1&&!r.window.__crewcheckPendingNativePdf,name+' same share retry must commit');
}
for (const phase of ['onChunk','onParse','onConfirm','onPublication','onCompliance']) {
  r=await scenario('account changes '+phase,phase==='onChunk'?durable:legacy,{[phase]:s=>{s.owner='owner-B';s.token='token-B';}});
  check(r.state.save===0&&r.state.bundle===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'account change '+phase+' must not commit/ACK');
}
r=await scenario('token rotation while parsing',legacy,{onParse:s=>{s.token='token-B';}});
check(r.state.save===0&&r.state.acks.length===0,'token rotation must reject');
for(const invalidate of ['planned','choice']) {
 r=await scenario('newer '+invalidate+' import while parsing',legacy,{invalidate});
 check(r.state.save===0&&r.state.bundle===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'newer '+invalidate+' choice must reject stale import');
}
r=await scenario('successful bundle effect cleanup still ACKs',durable,{cleanupOnCommit:true});
check(r.state.bundle===1&&r.state.acks.length===1,'normal effect cleanup after commit must not lose ACK');
r=await scenario('duplicate successful event suppressed',legacy,{retry:true});
check(r.state.parse===1&&r.state.acks.length===1,'success duplicate must be suppressed');
r=await scenario('canonical storage unavailable',durable,{storageFailure:true});
check(r.state.bundle===0&&r.state.active==='original-roster'&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'unconfirmed durable local save must retain pending');
r=await scenario('native ACK rejection keeps pending',durable,{ackFailure:true});
check(r.state.save===1&&r.window.__crewcheckPendingNativePdf&&r.first.claims===0,'false ACK must retain pending and allow retry');
r=await scenario('pending replaced by a different share before ACK',legacy,{replacePending:true});
check(r.state.acks.length===1&&r.window.__crewcheckPendingNativePdf?.shareId==='other-share','ACK must not clear another pending share');
r=await scenario('oversized native chunk rejected',durable,{oversizedChunk:true});
check(r.state.parse===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'oversized chunk must fail closed');
r=await scenario('manual picker success preserved',legacy,{manual:true});
check(r.state.result===true&&r.state.save===1&&r.state.bundle===1&&r.state.acks.length===0,'manual picker keeps canonical success without native ACK');
r=await scenario('manual picker cancellation preserved',legacy,{manual:true,cancel:true});
check(r.state.result===false&&r.state.save===0&&r.state.bundle===0,'manual cancellation preserves active roster');
for(const [name,payload,options] of [
 ['PWA without Android bridge',pwa,{noBridge:true,pwaRuntime:true}],
 ['PWA with unrelated Android bridge',pwa,{}],
 ['legacy APK without ACK method',legacy,{noAck:true}],
 ['legacy payload without bridge',legacy,{noBridge:true}],
]) {
 r=await scenario(name,payload,{...options,retry:true,replayLifecycle:true});
 check(r.first.parse===1&&r.first.save===1&&!r.first.pending&&r.first.claims===1,name+' finalized after canonical commit');
 check(r.state.parse===1&&r.state.save===1&&r.state.acks.length===0&&!r.window.__crewcheckPendingNativePdf,name+' must dedupe repeated event/effect and have no reload replay');
 if(options.pwaRuntime)check(r.state.pwaFetches===1&&!new URL(r.window.location.href).searchParams.has('crewcheckSharedPdf'),'real PWA runtime removes consumed query so reload does not fetch/reimport');
}
for(const payload of [{...durable,byteLength:35*1024*1024+1},{...durable,byteLength:0},{...durable,byteLength:1.5},{...durable,transport:'unsupported'},{...legacy,dataBase64:Buffer.from('not a PDF').toString('base64')}]) {
 r=await scenario('invalid native metadata/PDF rejected',payload);
 check(r.state.parse===0&&r.state.save===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'invalid transport must not reach parser/ACK');
}
// Retained-share ownership, including a fresh VM simulating a document reload.
for(const failure of ['cancel','parserFailure']) {
 const initial=await scenario('A retains '+failure,durable,{[failure]:true});
 const foreign=await scenario('B attempts retained '+failure,durable,{owner:'owner-B',token:'token-B',persistedValues:initial.values});
 check(foreign.state.chunks===0&&foreign.state.parse===0&&(foreign.state.decodes||0)===0&&foreign.state.save===0&&foreign.state.acks.length===0,'other account cannot read/decode/parse/upload retained '+failure+' after reload');
 const same=await scenario('A returns to retained '+failure,durable,{persistedValues:initial.values,token:'new-token-same-owner'});
 check(same.state.chunks===1&&same.state.parse===1&&same.state.save===1&&same.state.acks.length===1,'same account can retry retained '+failure+' after reload');
}
for(const payload of [durable,legacy,pwa]) {
 const anonymous=await scenario('received while logged out',payload,{owner:null,token:null,onlyReceipt:true});
 const loggedIn=await scenario('login must not adopt unowned receipt',payload,{persistedValues:anonymous.values});
 check(loggedIn.state.chunks===0&&loggedIn.state.parse===0&&(loggedIn.state.decodes||0)===0&&loggedIn.state.acks.length===0,'unowned share cannot be silently adopted after login/reload');
}
r=await scenario('binding storage unavailable',durable,{bindingStorageFailure:true});
check(r.state.chunks===0&&r.state.parse===0&&r.state.acks.length===0,'unpersistable account binding fails before file read');
r=await scenario('legacy has no stable identity',{filename:'Synthetic.pdf',dataBase64:pdf.toString('base64')});
check(r.state.parse===0&&(r.state.decodes||0)===0&&r.state.acks.length===0,'unidentified legacy payload requires manual picker instead of unsafe account replay');
const cancelledPwa=await scenario('PWA A cancellation before reopening',pwa,{cancel:true,pwaRuntime:true,noBridge:true});
r=await scenario('PWA B reopening retained ID',pwa,{owner:'owner-B',token:'token-B',persistedValues:cancelledPwa.values,pwaRuntime:true,noBridge:true});
check((r.state.pwaFetches||0)===0&&r.state.parse===0,'PWA account check precedes SW fetch/blob read');
const offlinePwa=await scenario('PWA A offline intake',pwa,{offline:true,pwaRuntime:true,noBridge:true});
r=await scenario('PWA same account returns online',pwa,{persistedValues:offlinePwa.values,pwaRuntime:true,noBridge:true,pwaUrl:offlinePwa.window.location.href});
check(r.state.pwaFetches===1&&r.state.parse===1&&r.state.save===1,'PWA same account can retry unconsumed SW entry after offline reopen');
r=await scenario('same share repeated concurrently',legacy,{cancel:true,concurrentSameId:true});
check(r.state.parse===2&&r.state.save===0&&r.state.acks.length===0,'duplicate simultaneous same-ID claims cannot run two parsers');
r=await scenario('newer distinct share supersedes earlier parser',legacy,{cancel:true,concurrentDistinct:true});
check(r.state.save===1&&r.state.acks.length===1&&r.state.acks[0]==='synthetic-share-2','only the newer concurrent share can commit/ACK');
r=await scenario('late ACK sees a newer pending share',durable,{ackReplacePending:true});
check(r.state.acks.length===1&&r.window.__crewcheckPendingNativePdf?.shareId==='new-share-after-late-ACK','late ACK cannot clear the newer pending JS share');
r=await scenario('unexpected async ACK is not accepted',durable,{ackPromise:true});
check(r.state.acks.length===1&&r.window.__crewcheckPendingNativePdf&&r.first.claims===0,'only synchronous native true finalizes private inbox');
const ackFailed=await scenario('native ACK failed after canonical commit',durable,{ackFailure:true});
r=await scenario('retry ACK after reload without reparse',durable,{persistedValues:ackFailed.values});
check(r.state.chunks===0&&r.state.parse===0&&r.state.save===0&&r.state.acks.length===1&&!r.window.__crewcheckPendingNativePdf,'committed same-owner receipt retries only ACK after reload');
r=await scenario('B cannot finalize A committed receipt',durable,{owner:'owner-B',token:'token-B',persistedValues:ackFailed.values});
check(r.state.chunks===0&&r.state.parse===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'foreign account cannot read OR ACK a committed receipt');
const expired=await scenario('native TTL expired PDF cannot be read',durable,{badChunk:true});
check(expired.state.parse===0&&expired.state.acks.length===0,'expired native PDF missing chunk cannot become a fresh import');
// Only opaque account IDs and version are persisted, never auth tokens/PDF data.
for(const [key,value] of r.values)if(key.startsWith('crewcheck:shared-pdf-account:')) {
 const receipt=JSON.parse(value);check(['owner,version','committed,owner,version'].includes(Object.keys(receipt).sort().join(','))&&!value.includes('token-')&&!value.includes('PDF'),'binding metadata is minimal');
}
if(process.env.SHARE_WEB_REPORT)fs.writeFileSync(process.env.SHARE_WEB_REPORT,JSON.stringify({homePath,fixed,bound,checks,failures,results},null,2)+'\n');
console.log(`Android shared PDF web: ${checks} assertions, ${failures.length} failures (${fixed?'fixed':'baseline'} actual Home functions, synthetic data only).`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
