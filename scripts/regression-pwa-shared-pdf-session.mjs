// Real channel + account binding + single-use PWA bootstrap; synthetic I/O only.
import fs from 'node:fs';import vm from 'node:vm';import {transformSync} from 'esbuild';
const root=process.env.PWA_SESSION_ROOT||process.cwd();let checks=0;const failures=[];
function check(value,label){checks++;if(!value)failures.push(label);}
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
async function fixture(native=false){
 const state={owner:'A',token:'synthetic-A',fetches:0,emitted:0,epoch:0},values=new Map(),listeners=new Map();let serial=0;
 const window={location:{href:'https://synthetic.invalid/?crewcheckSharedPdf=single-use'},history:{state:null,replaceState(_s,_t,url){window.location.href=new URL(url,window.location.href).href;}},btoa,addEventListener(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},__crewcheckPdfDocument:'document-1'};window.top=window;
 if(native){const bridge={onmessage:null,postMessage(raw){const q=JSON.parse(raw);if(q.op==='bind'||q.op==='logout')state.epoch++;const result=q.op==='bind'?state.owner:false;queueMicrotask(()=>bridge.onmessage?.({data:JSON.stringify({id:q.id,document:q.document,epoch:state.epoch,result})}));}};window.CrewCheckPdfChannel=bridge;}
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v))};
 const context=vm.createContext({window,localStorage,getStoredUser:()=>state.owner?{id:state.owner,name:'Synthetic profile'}:null,getToken:()=>state.token,crypto:{randomUUID:()=>String(++serial)},setTimeout,clearTimeout,URL,Response,Blob,Uint8Array,TextDecoder,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},fetch:async()=>{state.fetches++;if(state.fetches>1)throw Error('single-use already consumed');return new Response(new Blob(['%PDF-1.7\nSynthetic only']),{headers:{'x-crewcheck-filename':'Synthetic.pdf'}});}});
 function load(file,tail=''){const source=fs.readFileSync(root+'/'+file,'utf8').replace(/^import .*;\n/gm,'');return vm.runInContext('(function(){const module={exports:{}};'+transformSync(source+tail,{loader:'ts',format:'cjs'}).code+';return module.exports;})()',context);}
 const channel=load('client/src/lib/sharedPdfChannel.ts');Object.assign(context,channel);const binding=load('client/src/lib/sharedPdfAccountBinding.ts');Object.assign(context,binding);
 // Run the real consumer explicitly, without its automatic startup timer.
 let runtime=fs.readFileSync(root+'/client/src/lib/pwaSharedPdfRuntime.ts','utf8').replace(/^import .*;\n/gm,'');if(!runtime.includes('registerPwaSharedPdfReceipt'))throw Error('Prepare canonical source before PWA session regression');runtime=runtime.slice(0,runtime.lastIndexOf("if (typeof window"));
 const consumer=vm.runInContext('(function(){'+transformSync(runtime+'\nglobalThis.consumePwa=consumePwaSharedPdf;',{loader:'ts'}).code+'})()',context);
 window.addEventListener('crewcheck:native-pdf',()=>state.emitted++);await settle();await context.consumePwa();await settle();
 return{state,window,binding,values,event:(type,key)=>window.dispatchEvent({type,key}),payload:window.__crewcheckPendingNativePdf};
}
for(const supported of [false,true]){
 const f=await fixture(supported),payload=f.payload,receiptKey='crewcheck:shared-pdf-account:v1:'+encodeURIComponent(payload.shareId),originalReceipt=f.values.get(receiptKey);check(f.state.fetches===1&&!f.window.location.href.includes('crewcheckSharedPdf'),'single-use source consumed and URL removed '+supported);
 for(const [event,key]of [['storage','crewcheck_auth_user'],['crewcheck:auth-changed'],['crewcheck:pdf-channel-ready']]){
  const emitted=f.state.emitted;f.event(event,key);await settle();check(f.window.__crewcheckPendingNativePdf===payload,'same A/token retains PWA pointer '+supported+' '+event);check(f.state.emitted===emitted,'channel never replays PWA '+supported+' '+event);check(f.binding.sharedPdfAccountReceipt(payload).allowed,'A receipt remains retryable '+supported+' '+event);
 }
 f.event('crewcheck:auth-will-change');f.state.owner='B';f.state.token='synthetic-B';f.event('crewcheck:auth-changed');await settle();check(f.window.__crewcheckPendingNativePdf===payload,'A payload preserved without adoption by B '+supported);check(!f.binding.sharedPdfAccountReceipt(payload).allowed,'B cannot consume A receipt '+supported);check(f.values.get(receiptKey)===originalReceipt,'receipt never reassigned '+supported);
 f.state.owner=null;f.state.token=null;f.event('crewcheck:auth-expired');await settle();check(f.window.__crewcheckPendingNativePdf===payload&&!f.binding.sharedPdfAccountReceipt(payload).allowed,'signed out retains quarantined PWA '+supported);
 f.state.owner='A';f.state.token='synthetic-A-new';f.event('crewcheck:auth-changed');await settle();check(f.window.__crewcheckPendingNativePdf===payload&&f.binding.sharedPdfAccountReceipt(payload).allowed&&f.state.fetches===1,'A returns with original bytes and no second SW fetch '+supported);
 f.window.__crewcheckPendingNativePdf={shareId:'native-receipt',transport:'android-private-inbox'};f.event('crewcheck:auth-changed');await settle();check(!f.window.__crewcheckPendingNativePdf,'native metadata still cleared '+supported);
}
const report={checks,failures};console.log(JSON.stringify(report,null,2));if(process.env.PWA_SESSION_REPORT)fs.writeFileSync(process.env.PWA_SESSION_REPORT,JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
