import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the actual materialized Home handler/listener and actual guard functions.
// Only parser/DB/network/React effects and authentication storage are synthetic.
const homePath = process.env.SHARE_WEB_HOME || 'client/src/pages/Home.tsx';
const source = fs.readFileSync(homePath, 'utf8');
const fixed = source.includes('function captureSharedPdfImport(');
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
const legacy = {...durable,dataBase64:pdf.toString('base64')};
let checks = 0;
const failures = [];
const results = [];
async function scenario(name, payload, options = {}) {
  const state = {owner:'owner-A',token:'token-A',revision:'p0',parse:0,save:0,bundle:0,acks:[],chunks:0,toasts:[],active:'original-roster',confirmed:false,...options};
  const suppliedPdf=options.largePdf?Buffer.concat([pdf,Buffer.alloc(400000)]):pdf;
  if(options.largePdf)payload={...payload,byteLength:suppliedPdf.length};
  const values = new Map();
  const listeners = new Map();
  const storage = {getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(state.storageFailure&&k===state.owner)throw new Error('Synthetic storage blocked');values.set(k,String(v));if(k===state.owner&&String(v).includes('sourceFileName'))state.active='imported-roster';}};
  const window = {atob,localStorage:storage,setTimeout:fn=>fn(),addEventListener:(n,fn)=>{const a=listeners.get(n)||[];a.push(fn);listeners.set(n,a);},dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e);},AndroidCrewCheckNative:{
    readSharedPdfChunk:(id,offset,length)=>{state.chunks++;assert.equal(id,payload.shareId);if(state.onChunk)state.onChunk(state);if(state.badChunk)return '';if(state.oversizedChunk)return Buffer.alloc(Number(length)+1).toString('base64');return suppliedPdf.subarray(Number(offset),Number(offset)+Number(length)).toString('base64');},
    acknowledgeSharedPdf:id=>{state.acks.push(id);if(state.ackFailure)return false;return true;},
  },__crewcheckPendingNativePdf:payload};
  const toast = Object.fromEntries(['message','error','success','info'].map(k=>[k,x=>state.toasts.push([k,x])]));
  const context = vm.createContext({module:{exports:{}},window,localStorage:storage,sessionStorage:storage,crypto:{randomUUID:()=>String(Math.random())},CustomEvent:class{constructor(type){this.type=type}},File,Uint8Array,Set,console,alive:true,nativePdfClaimsRef:{current:new Set()},
    financialRateSession:()=>state.owner+':'+state.token,startupOwner:()=>state.owner,getToken:()=>state.token,clearEpoch:()=>'',startupKey:()=>state.owner,readChoiceRevision:k=>storage.getItem(k),
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
  const code = 'let importRevision = 0;'+plannedGuard+'\n'+choiceGuard+'\n'+capture+'\n'+saveFunction+'\n'+handler+'\n'+listener+'\nglobalThis.consume=consumeNativePdf;globalThis.importHandler=handleFile;';
  vm.runInContext(transformSync(code,{loader:'ts',format:'cjs',target:'es2022'}).code,context);
  if(options.manual)state.result=await context.importHandler({target:{files:[new File([suppliedPdf],'Synthetic.pdf',{type:'application/pdf'})]}});
  else await context.consume(payload);
  const first = {parse:state.parse,save:state.save,bundle:state.bundle,acks:state.acks.length,pending:Boolean(window.__crewcheckPendingNativePdf),claims:context.nativePdfClaimsRef.current.size};
  if(options.retry){state.parserFailure=false;state.cancel=false;state.empty=false;state.complianceFailure=false;state.badChunk=false;state.oversizedChunk=false;state.ackFailure=false;await context.consume(payload);}
  results.push({name,first,after:{parse:state.parse,save:state.save,bundle:state.bundle,acks:state.acks.length,pending:Boolean(window.__crewcheckPendingNativePdf)}});
  return {state,first,window};
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
check(r.state.acks.length===1&&r.window.__crewcheckPendingNativePdf.shareId==='other-share','ACK must not clear another pending share');
r=await scenario('oversized native chunk rejected',durable,{oversizedChunk:true});
check(r.state.parse===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'oversized chunk must fail closed');
r=await scenario('manual picker success preserved',legacy,{manual:true});
check(r.state.result===true&&r.state.save===1&&r.state.bundle===1&&r.state.acks.length===0,'manual picker keeps canonical success without native ACK');
r=await scenario('manual picker cancellation preserved',legacy,{manual:true,cancel:true});
check(r.state.result===false&&r.state.save===0&&r.state.bundle===0,'manual cancellation preserves active roster');
for(const payload of [{...durable,byteLength:35*1024*1024+1},{...durable,byteLength:0},{...durable,byteLength:1.5},{...durable,transport:'unsupported'},{...legacy,dataBase64:Buffer.from('not a PDF').toString('base64')}]) {
 r=await scenario('invalid native metadata/PDF rejected',payload);
 check(r.state.parse===0&&r.state.save===0&&r.state.acks.length===0&&r.window.__crewcheckPendingNativePdf,'invalid transport must not reach parser/ACK');
}
if(process.env.SHARE_WEB_REPORT)fs.writeFileSync(process.env.SHARE_WEB_REPORT,JSON.stringify({homePath,fixed,checks,failures,results},null,2)+'\n');
console.log(`Android shared PDF web: ${checks} assertions, ${failures.length} failures (${fixed?'fixed':'baseline'} actual Home functions, synthetic data only).`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
