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
  const nativeState=options.nativeState || {id:payload.shareId,owner:state.owner||'',phase:state.owner?'unclaimed':'blocked'};
  const trace=[];
  const listeners = new Map();
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>{if((state.failWriteAhead&&String(v).includes('\"phase\":\"committing\"'))||(state.failCommitMarker&&String(v).includes('\"committed\":true'))||(state.storageFailure&&k===state.owner)||(state.bindingStorageFailure&&k.startsWith('crewcheck:shared-pdf-account:')))throw new Error('Synthetic storage blocked');values.set(k,String(v));if(k===state.owner&&String(v).includes('sourceFileName'))state.active='imported-roster';}};
  const window = {confirm:()=>{trace.push('explicit-claim');return !state.denyClaim;},atob:x=>{state.decodes=(state.decodes||0)+1;return atob(x);},localStorage:storage,setTimeout:fn=>fn(),addEventListener:(n,fn)=>{const a=listeners.get(n)||[];a.push(fn);listeners.set(n,a);},dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e);},AndroidCrewCheckNative:{
    readSharedPdfChunk:(id,offset,length)=>{state.chunks++;assert.equal(id,payload.shareId);if(state.onChunk)state.onChunk(state);if(state.badChunk)return '';if(state.oversizedChunk)return Buffer.alloc(Number(length)+1).toString('base64');return suppliedPdf.subarray(Number(offset),Number(offset)+Number(length)).toString('base64');},
    acknowledgeSharedPdf:id=>{state.acks.push(id);if(state.ackReplacePending)window.__crewcheckPendingNativePdf={...durable,shareId:'new-share-after-late-ACK'};if(state.ackFailure)return false;if(state.ackPromise)return Promise.resolve(true);return true;},
    sharedPdfStatus:()=>JSON.stringify({shareId:nativeState.id,owner:nativeState.owner,phase:nativeState.phase,ownershipProtocol:state.noProtocol?undefined:'mainframe-host-session-v2'}),
    reportSharedPdfSession:()=>true,
    blockSharedPdf:id=>{if(id!==nativeState.id||nativeState.owner)return false;nativeState.phase='blocked';return true;},
    claimSharedPdf:(id,account)=>{trace.push('native-claim');if(id!==nativeState.id||account!==nativeState.owner||nativeState.phase!=='unclaimed')return false;nativeState.phase='claimed';return true;},
    beginSharedPdfCommit:(id,account)=>{if(id!==nativeState.id||account!==nativeState.owner||nativeState.phase!=='claimed')return false;nativeState.phase='committing';if(state.onNativeBegin)state.onNativeBegin(state);return true;},
    confirmSharedPdfCommit:(id,account)=>{if(state.failNativeConfirm||id!==nativeState.id||account!==nativeState.owner||nativeState.phase!=='committing')return false;nativeState.phase='committed';return true;},
    readClaimedSharedPdfChunk:(id,account,offset,length)=>{trace.push('chunk');if(id!==nativeState.id||account!==nativeState.owner||nativeState.phase!=='claimed')throw new Error('read before claim');return window.AndroidCrewCheckNative.readSharedPdfChunk(id,offset,length);},
    acknowledgeClaimedSharedPdf:(id,account)=>{if(id!==nativeState.id||account!==nativeState.owner||nativeState.phase!=='committed')return false;return window.AndroidCrewCheckNative.acknowledgeSharedPdf(id);},
  },__crewcheckPendingNativePdf:payload};
  if(options.noBridge)delete window.AndroidCrewCheckNative;
  else if(options.noAck)delete window.AndroidCrewCheckNative.acknowledgeSharedPdf;
  if(options.pwaRuntime){
    window.btoa=btoa;window.location={href:options.pwaUrl||'https://synthetic.crewcheck.invalid/?crewcheckSharedPdf=synthetic-share-1'};
    window.history={state:null,replaceState:(_state,_title,url)=>{window.location.href=new URL(url,window.location.href).href;}};
  }
  const toast = Object.fromEntries(['message','error','success','info'].map(k=>[k,(x,options)=>{state.toasts.push([k,x,Boolean(options?.action)]);if(state.selectManual&&options?.action)options.action.onClick();}]));
  const context = vm.createContext({module:{exports:{}},window,localStorage:storage,sessionStorage:storage,crypto:{randomUUID:()=>String(Math.random())},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},File,Uint8Array,Set,console,alive:true,nativePdfClaimsRef:{current:new Set()},nativePdfRequestsRef:{current:new Set()},
    financialRateSession:()=>state.owner&&state.token?state.owner+':'+state.token:null,getStoredUser:()=>state.owner?{id:state.owner}:null,startupOwner:()=>state.owner,getToken:()=>state.token,clearEpoch:()=>'',startupKey:()=>state.owner,readChoiceRevision:k=>storage.getItem(k),
    publicationOwner:()=>state.owner,currentPublicationReview:()=>({publication:{revision:state.revision}}),
    beginRosterChoice:undefined,toast,fileRef:{current:{value:'x',click:()=>{state.manualOpen=(state.manualOpen||0)+1;}}},setBusy:()=>{},bundle:{roster:{year:2032,month:10,days:[]}},
    parsePDFResilient:async()=>{state.parse++;if(state.onParse)state.onParse(state);if(state.replacePending)window.__crewcheckPendingNativePdf={...durable,shareId:'other-share'};if(state.invalidate==='planned')vm.runInContext('beginOwnedPlannedImport()',context);if(state.invalidate==='choice')vm.runInContext('beginRosterChoice()',context);if(state.parserFailure)throw new Error('Synthetic parser failure');return {roster:{year:2032,month:10,days:state.empty?[]:[{date:'2032-10-13'}]},source:'synthetic'};},
    confirmRosterImport:async()=>{if(state.onConfirm)state.onConfirm(state);state.confirmed=!state.cancel;return {ok:!state.cancel,hasFuture:true,summaryText:'synthetic',periodLabel:'synthetic'};},
    preservePlannedRosterBeforeImport:()=>null,sameRosterPeriod:()=>false,compareRosters:()=>null,
    buildCanonicalRosterEvents:x=>x,normalizeRosterDays:x=>x,recordPublication:async()=>{if(state.onPublication)state.onPublication(state);},
    analyzeSafe:()=>{state.save++;return {};},ROSTER_CACHE_SCHEMA:'synthetic',startupIntentRevision:()=>'',recomputeComplianceWithRegulatoryHistory:async()=>{if(state.onCompliance)state.onCompliance(state);if(state.complianceFailure)throw new Error('Synthetic compliance failure');return {compliance:{}};},
    getGymRecommendations:()=>[],storage:{set:()=>{}},setBundle:()=>{state.bundle++;if(state.cleanupOnCommit)context.alive=false;},publishCrewCheckNotice:()=>{},
    syncRosterWithTelegramConcierge:async()=>{},saveRosterAnalysis:async()=>{},syncPlatformRoster:async()=>{},setView:()=>{},setLocation:()=>{},sanitizePdfImportError:x=>x.message,
  });
  context.sharedPdfChannelStatus=()=>window.AndroidCrewCheckNative ? JSON.parse(window.AndroidCrewCheckNative.sharedPdfStatus()) : null;
  context.refreshSharedPdfChannelStatus=async()=>context.sharedPdfChannelStatus();
  window.CrewCheckPdfChannel=options.noBridge?undefined:{postMessage(){}};
  context.sharedPdfChannelCall=async(op,id,fields={})=>{
    const bridge=window.AndroidCrewCheckNative;if(!bridge)return false;
    const method={claim:'claimSharedPdf',block:'blockSharedPdf',begin:'beginSharedPdfCommit',confirm:'confirmSharedPdfCommit',ack:'acknowledgeClaimedSharedPdf'}[op];
    if(op==='read')return bridge.readClaimedSharedPdfChunk(id,state.owner,fields.offset,fields.length);
    return method?bridge[method](id,state.owner):false;
  };
  if(bound){
    const binding=fs.readFileSync(process.env.SHARE_WEB_BINDING || 'client/src/lib/sharedPdfAccountBinding.ts','utf8').replace(/^import .*;\n/gm,'');
    vm.runInContext(transformSync(binding,{loader:'ts',format:'cjs'}).code,context);
  }
  const code = 'let importRevision = 0;'+plannedGuard+'\n'+choiceGuard+'\n'+capture+'\n'+saveFunction+'\n'+handler+'\n'+listener+'\nglobalThis.consume=consumeNativePdf;globalThis.importHandler=handleFile;';
  vm.runInContext(transformSync(code,{loader:'ts',format:'cjs',target:'es2022'}).code,context);
  let pwaConsumer;
  if(!options.pwaRuntime && payload.shareId?.startsWith('pwa:') && typeof context.registerPwaSharedPdfReceipt==='function')context.registerPwaSharedPdfReceipt(payload.shareId);
  if(options.pwaRuntime){
    const runtime=fs.readFileSync(process.env.SHARE_WEB_PWA || 'client/src/lib/pwaSharedPdfRuntime.ts','utf8').replace(/^import .*;\n/gm,'');
    context.fetch=async()=>{if(state.onPwaFetch)state.onPwaFetch(state);if(state.offline)throw new Error('Synthetic offline');state.pwaFetches=(state.pwaFetches||0)+1;return new Response(new Blob([suppliedPdf]),{headers:{'x-crewcheck-filename':'Synthetic.pdf'}});};
    Object.assign(context,{URL,Response,Blob,TextDecoder});
    vm.runInContext(transformSync(runtime.slice(0,runtime.lastIndexOf("if (typeof window"))+'\nglobalThis.consumePwa=consumePwaSharedPdf;',{loader:'ts',format:'cjs'}).code,context);
    const imports=[];window.addEventListener('crewcheck:native-pdf',e=>imports.push(context.consume(e.detail)));
    delete window.__crewcheckPendingNativePdf;
    pwaConsumer=context.consumePwa;await pwaConsumer();await Promise.all(imports);
  }else if(options.onlyReceipt){ /* Bootstrap captures the receipt even without Home. */ }else if(options.manual)state.result=await context.importHandler({target:{files:[new File([suppliedPdf],'Synthetic.pdf',{type:'application/pdf'})]}});
  else if(options.initialConcurrent)await Promise.all([context.consume(payload),context.consume(payload)]);
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
  return {state,first,window,values,context,pwaConsumer,nativeState,trace};
}
function check(condition,label){checks++;if(!condition)failures.push(label);if(!process.env.SHARE_WEB_OBSERVE)assert(condition,label);}
let r=await scenario('new receipt explicit claim before reading',durable);
check(r.state.parse===1&&r.state.save===1&&r.state.acks.length===1&&!r.window.__crewcheckPendingNativePdf,'claimed receipt imports and ACKs committed canonical save');
check(r.trace.indexOf('explicit-claim')>=0&&r.trace.indexOf('explicit-claim')<r.trace.indexOf('chunk'),'explicit claim precedes first chunk');
r=await scenario('claim declined',durable,{denyClaim:true});
check(r.state.parse===0&&r.state.chunks===0&&r.state.acks.length===0,'declining claim does not read or parse');
for(const payload of [durable,legacy]){
 r=await scenario('old APK unknown source requires manual picker',payload,{noProtocol:true});
 check(r.state.parse===0&&r.state.chunks===0&&(r.state.decodes||0)===0&&r.state.acks.length===0,'unknown native source never binds current login');
}
r=await scenario('legacy no-ID offers manual selection',{filename:'Synthetic.pdf',dataBase64:pdf.toString('base64')},{noProtocol:true,selectManual:true});
check(r.state.parse===0&&(r.state.manualOpen||0)===1,'unknown no-ID payload offers a usable manual picker without reading it');
for(const failure of ['cancel','parserFailure']){
 const initial=await scenario('A retains '+failure,durable,{[failure]:true});
 const other=await scenario('B resumes same receipt',durable,{owner:'owner-B',token:'token-B',persistedValues:initial.values,nativeState:initial.nativeState});
 check(other.state.chunks===0&&other.state.parse===0&&other.state.acks.length===0,'B cannot read A retained '+failure);
 const alias={...durable,shareId:'new-id-same-file'};
 const recaptured=await scenario('new ID without proven native ownership',alias,{owner:'owner-B',token:'token-B',persistedValues:initial.values,noProtocol:true});
 check(recaptured.state.chunks===0&&recaptured.state.parse===0&&(recaptured.state.decodes||0)===0,'new unknown ID cannot bypass ownership');
 const same=await scenario('A returns with rotated token',durable,{token:'new-token',persistedValues:initial.values,nativeState:initial.nativeState});
 check(same.state.parse===1&&same.state.save===1&&same.state.acks.length===1,'same owner can retry a noncommitted failed attempt');
}
const anonymous=await scenario('receipt while signed out',durable,{owner:null,token:null,onlyReceipt:true});
r=await scenario('later login cannot adopt unowned receipt',durable,{persistedValues:anonymous.values,nativeState:anonymous.nativeState});
check(r.state.chunks===0&&r.state.parse===0&&r.state.acks.length===0,'signed-out receipt stays blocked after recreation/login');
const beforeLogin=await scenario('known A delivery observed during logout',durable,{owner:null,token:null,onlyReceipt:true,nativeState:{id:durable.shareId,owner:'owner-A',phase:'unclaimed'}});
r=await scenario('A reclaims after observing its receipt signed out',durable,{persistedValues:beforeLogin.values,nativeState:beforeLogin.nativeState});
check(r.state.parse===1&&r.state.save===1,'logout does not replace an authoritative A owner with an unowned web receipt');
for(const value of ['true','false',1,null]){
 const values=new Map([['crewcheck:shared-pdf-account:v1:'+encodeURIComponent(durable.shareId),JSON.stringify({version:2,kind:'native',owner:'owner-A',phase:'claimed',committed:value})]]);
 r=await scenario('malformed committed marker',durable,{persistedValues:values});
 check(r.state.parse===0&&r.state.chunks===0,'committed is a strict boolean');
}
r=await scenario('write-ahead marker fails',durable,{failWriteAhead:true});
check(r.state.save===0&&r.state.bundle===0&&r.state.acks.length===0,'marker failure before canonical mutation preserves active roster');
for(const options of [{failNativeConfirm:true},{failCommitMarker:true}]){
 const initial=await scenario('commit confirmation failure',durable,{...options,ackFailure:true});
 check(initial.state.save===1&&initial.state.bundle===1&&initial.window.__crewcheckPendingNativePdf,'canonical saved but pending preserved on confirmation failure');
 const reopened=await scenario('reopen uncertain commit',durable,{persistedValues:initial.values,nativeState:initial.nativeState});
 check(reopened.state.parse===0&&reopened.state.save===0&&reopened.state.chunks===0,'uncertain commit must not automatically reparse after reload');
 if(options.failNativeConfirm)check(reopened.state.acks.length===0,'unconfirmed native commit is quarantined');
 else check(reopened.state.acks.length===1,'durable native confirmation recovers failed web marker with ACK-only retry');
}
const ackFailed=await scenario('ACK failure after committed save',durable,{ackFailure:true});
r=await scenario('ACK-only retry after reload',durable,{persistedValues:ackFailed.values,nativeState:ackFailed.nativeState});
check(r.state.parse===0&&r.state.save===0&&r.state.acks.length===1,'committed receipt never reparses for ACK retry');
r=await scenario('foreign ACK attempt',durable,{owner:'owner-B',token:'token-B',persistedValues:ackFailed.values,nativeState:ackFailed.nativeState});
check(r.state.parse===0&&r.state.acks.length===0,'B cannot ACK A committed receipt');
for(const phase of ['onChunk','onParse','onConfirm','onPublication','onCompliance']){
 r=await scenario('account changes '+phase,durable,{[phase]:s=>{s.owner='owner-B';s.token='token-B';}});
 check(r.state.save===0&&r.state.bundle===0&&r.state.acks.length===0,'async account guard '+phase+' preserved');
}
r=await scenario('account changes while native write-ahead commits',durable,{onNativeBegin:s=>{s.owner='owner-B';s.token='token-B';}});
check(r.state.save===0&&r.state.bundle===0&&r.state.acks.length===0,'native bridge return cannot commit under a changed account');
for(const options of [{badChunk:true},{oversizedChunk:true},{bindingStorageFailure:true}]){
 r=await scenario('unreadable/invalid pending file',durable,options);
 check(r.state.parse===0&&r.state.acks.length===0,'invalid source/storage never parses or ACKs');
}
r=await scenario('late ACK after pending replacement',durable,{ackReplacePending:true});
check(r.window.__crewcheckPendingNativePdf?.shareId==='new-share-after-late-ACK','old ACK preserves new pending pointer');
r=await scenario('same-ID concurrent delivery',durable,{cancel:true,concurrentSameId:true});
check(r.state.parse===2&&r.state.save===0,'simultaneous duplicate claims do not run simultaneous parsers');
r=await scenario('initial duplicate delivery during async status',durable,{initialConcurrent:true});
check(r.state.parse===1&&r.state.save===1&&r.state.acks.length===1,'initial async duplicates share one import/ACK');
r=await scenario('manual picker remains available',legacy,{manual:true});
check(r.state.result===true&&r.state.save===1&&r.state.acks.length===0,'manual picker imports through current guarded canonical handler');
for(const failure of ['cancel','parserFailure']){
 const first=await scenario('PWA retains '+failure,pwa,{pwaRuntime:true,noBridge:true,[failure]:true});
 const retained=first.window.__crewcheckPendingNativePdf;
 check(Boolean(retained)&&first.state.pwaFetches===1&&first.state.save===0,'single-use PWA keeps bytes after '+failure);
 const other=await scenario('B cannot retry A PWA '+failure,retained,{noBridge:true,owner:'owner-B',token:'token-B',persistedValues:first.values});
 check(other.state.parse===0&&(other.state.decodes||0)===0&&other.state.save===0,'PWA retry cannot be reassigned A to B '+failure);
 const same=await scenario('A retries retained PWA '+failure,retained,{noBridge:true,token:'rotated-A',persistedValues:first.values});
 check(same.state.parse===1&&same.state.save===1&&!same.window.__crewcheckPendingNativePdf&&(same.state.pwaFetches||0)===0,'A retries original PWA bytes without fetching consumed SW '+failure);
}
r=await scenario('PWA real bootstrap',pwa,{pwaRuntime:true,noBridge:true,retry:true,replayLifecycle:true});
check(r.state.parse===1&&r.state.save===1&&r.state.pwaFetches===1&&!r.window.__crewcheckPendingNativePdf,'PWA completion remains single-use without native ACK');
r=await scenario('PWA owner changes while fetching source',pwa,{pwaRuntime:true,noBridge:true,onPwaFetch:s=>{s.owner='owner-B';s.token='token-B';}});
check(r.state.parse===0&&(r.state.decodes||0)===0&&r.state.save===0&&!r.window.__crewcheckPendingNativePdf,'PWA source delivery must recheck account before emitting PDF data');
const pwaMarker=await scenario('PWA commit-marker persistence fails',pwa,{pwaRuntime:true,noBridge:true,failCommitMarker:true});
r=await scenario('PWA uncertain commit after reload',pwa,{persistedValues:pwaMarker.values,noBridge:true});
check(r.state.parse===0&&r.state.save===0,'PWA uncertain commit is quarantined, never automatically imported twice');
const offline=await scenario('PWA offline fetch',pwa,{pwaRuntime:true,noBridge:true,offline:true});
r=await scenario('PWA online reopening',pwa,{pwaRuntime:true,noBridge:true,pwaUrl:offline.window.location.href,persistedValues:offline.values});
check(r.state.parse===1&&r.state.save===1,'same account can reopen unconsumed PWA entry after offline fetch');
if(process.env.SHARE_WEB_REPORT)fs.writeFileSync(process.env.SHARE_WEB_REPORT,JSON.stringify({homePath,fixed,bound,checks,failures,results},null,2)+'\n');
console.log(`Shared PDF claim web: ${checks} checks, ${failures.length} failures, synthetic I/O only.`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
