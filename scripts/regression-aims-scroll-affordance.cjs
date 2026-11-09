const assert=require('node:assert/strict');const {installAimsScrollProbe,waitForAimsScrollAffordance}=require('./lib/aims-scroll-affordance.cjs');
const keys=['window','document','Element','scrollX','scrollY','innerHeight','performance','requestAnimationFrame','getComputedStyle'],saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
class FakeElement {constructor(name){this.name=name;this.isConnected=true;}contains(e){return e===header;}}
let header;
async function scenario({initial=false,rootTop=1000,ancestor=false,mutate=()=>{},timeoutMs=100,noRAF=false,blocked=false}={}){
 let time=0,frame=0;const s={doc:3000,host:3000,hostScroll:3000,targetX:200,zoom:'100%',arrow:null,children:[]};header=new FakeElement('header');const panel=new FakeElement('panel'),root=new FakeElement('root'),host=new FakeElement('host'),viewport=new FakeElement('viewport'),target=new FakeElement('target'),outer=new FakeElement('outer'),nested=new FakeElement('nested');
 const rect=(left,top,width,height)=>({left,top,width,height,bottom:top+height});header.getBoundingClientRect=()=>rect(0,0,320,60);panel.getBoundingClientRect=()=>rect(0,60,320,2808);target.textContent='QA9029';target.getBoundingClientRect=()=>rect(s.targetX,400,40,24);viewport.scrollLeft=0;viewport.scrollTop=0;viewport.getBoundingClientRect=()=>rect(0,300,296,400);root.scrollTop=rootTop;Object.defineProperty(root,'scrollHeight',{get:()=>s.doc});outer.scrollTop=900;outer.clientHeight=600;outer.scrollHeight=3000;nested.contains=()=>false;host.getBoundingClientRect=()=>rect(0,0,320,s.host);Object.defineProperty(host,'scrollHeight',{get:()=>s.hostScroll});Object.defineProperty(host,'children',{get:()=>[header,panel,...s.children,...(s.arrow?[s.arrow]:[])]});Object.defineProperty(host,'lastElementChild',{get:()=>s.arrow||panel});host.querySelector=()=>s.arrow;header.closest=()=>host;
 const arrow=(present,extra=0)=>{s.arrow=present?new FakeElement('arrow'):null;if(s.arrow)s.arrow.getBoundingClientRect=()=>({...rect(272,2880,48,48+extra),bottom:2928+extra});s.doc=3000;s.host=s.doc;s.hostScroll=s.doc;};if(initial)arrow(true);
 let listener;const doc={scrollingElement:root,addEventListener:(type,fn)=>{assert.equal(type,'scroll');listener=fn;},querySelector:sel=>sel==='.cz-app > .cz-global-header'?header:sel==='.cc-doc-viewport'?viewport:sel==='.cc-doc-toolbar output'?{textContent:s.zoom}:blocked?{}:null,querySelectorAll:()=>[target]};
 for(const [k,v]of Object.entries({window:{},document:doc,Element:FakeElement,scrollX:0,scrollY:0,innerHeight:640,performance:{now:()=>time},getComputedStyle:e=>({display:'block',position:e===s.arrow?(s.arrowFlow?'static':'fixed'):'relative',transform:'none',boxSizing:'border-box',minHeight:'640px',paddingTop:'0px',paddingBottom:e===host?'100px':'0px',borderTopWidth:'0px',borderBottomWidth:'0px',marginBottom:e===s.arrow?'12px':e===panel&&!s.arrow?'32px':'0px'}),requestAnimationFrame:fn=>{if(!noRAF)queueMicrotask(()=>{time+=10;frame++;mutate({s,frame,arrow,panel});fn();});}}))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
 installAimsScrollProbe();listener({target:ancestor?outer:doc});if(ancestor){listener({target:nested});assert.equal(window.__qaAimsPageScroller,outer,'nested pan cannot replace the page/app ancestor');}
 return waitForAimsScrollAffordance({timeoutMs});
}
(async()=>{try{
 const inserted=await scenario({mutate:({frame,arrow})=>{if(frame===2)arrow(true);}});assert.equal(inserted.transition,true);assert.equal(inserted.deltaDoc,0);assert.equal(inserted.deltaHost,0);assert.equal(inserted.stableFrames,2);
 const removed=await scenario({initial:true,rootTop:0,mutate:({frame,arrow})=>{if(frame===1)arrow(false);}});assert.equal(removed.present,false);assert.equal(removed.deltaDoc,0);
 const nested=await scenario({ancestor:true,rootTop:0,mutate:({frame,arrow})=>{if(frame===1)arrow(true);}});assert.equal(nested.expected,true);
 await assert.rejects(scenario(),/did not complete within/);
 await assert.rejects(scenario({noRAF:true,timeoutMs:5}),/did not complete within/);
 await assert.rejects(scenario({blocked:true}),/closed overlays/);
 await assert.rejects(scenario({mutate:({s,frame})=>{if(frame===1)s.targetX++;}}),/layout or scroll changed unexpectedly/);
 await assert.rejects(scenario({mutate:({s,frame})=>{if(frame===1)s.zoom='150%';}}),/layout or scroll changed unexpectedly/);
 await assert.rejects(scenario({mutate:({s,frame})=>{if(frame===1)s.doc+=40;}}),/extent changed during floating arrow update/);
 await assert.rejects(scenario({mutate:({s,frame})=>{if(frame===1)s.host+=.25;}}),/extent changed during floating arrow update/);
 await assert.rejects(scenario({mutate:({s,frame,arrow})=>{if(frame===1){arrow(true);s.arrowFlow=true;}}}),/must not enter document flow/);
 await assert.rejects(scenario({mutate:({s,frame,arrow})=>{if(frame===1){arrow(true);s.doc+=20;}}}),/extent changed during floating arrow update/);
 await assert.rejects(scenario({mutate:({s,frame,arrow})=>{if(frame===1){arrow(true);s.doc+=20;s.host+=20;s.hostScroll+=20;}}}),/extent changed during floating arrow update/);
 await assert.rejects(scenario({mutate:({s,frame,panel})=>{if(frame===1)panel.getBoundingClientRect=()=>({left:0,top:60,width:320,height:2941});}}),/layout or scroll changed unexpectedly/);
 await assert.rejects(scenario({mutate:({frame,arrow})=>arrow(true,frame%2)}),/did not complete within/);
 console.log('PASS AIMS observable arrow readiness: insertion/removal/ancestor scroller; bounded timeout/stopped RAF; blocked overlays; layout/zoom/any extent change/continuous mutation rejected');
}finally{for(const k of keys){const d=saved.get(k);if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}})().catch(e=>{console.error(e);process.exitCode=1;});
