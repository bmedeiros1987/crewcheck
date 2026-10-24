// Diagnostic only: never substitutes for the original full AIMS gate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {execFileSync,spawnSync}=require('node:child_process');
const original=fs.readFileSync('scripts/regression-aims-document-app.cjs','utf8');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const root=path.resolve('artifacts/aims-preaction-compare',sha);fs.mkdirSync(root,{recursive:true});
const snapshot=`()=>({y:scrollY,left:document.querySelector('.cc-doc-viewport').scrollLeft,top:document.querySelector('.cc-doc-viewport').scrollTop,zoom:document.querySelector('.cc-doc-toolbar output').textContent})`;
const anchor="await page.locator('.cc-doc-token button').filter({hasText:'QA9029'}).scrollIntoViewIfNeeded();";
assert.equal(original.split(anchor).length,2,'one exact original pre-action preparation');
const assertions=["assert.ok(Math.abs(after.y-before.y)<=1",'assert.ok(Math.abs(after.left-before.left)<=1)','assert.ok(Math.abs(after.top-before.top)<=1)','assert.equal(after.zoom,before.zoom)'];
for(const assertion of assertions)assert(original.includes(assertion),'original strict assertion exists');
const stable=`await page.evaluate(async()=>{let prior='',same=0;for(let frame=0;frame<120;frame++){await new Promise(r=>requestAnimationFrame(r));const v=document.querySelector('.cc-doc-viewport');const next=JSON.stringify([scrollY,v.scrollLeft,v.scrollTop]);same=next===prior?same+1:0;prior=next;if(same>=3)return;}throw Error('Pre-action scroll did not stabilize');});`;
const trials=[];
for(const mode of ['original','settle','trial'])for(let repeat=1;repeat<=2;repeat++){
 let generated=original;
 assert(generated.includes("for(const theme of ['light','dark'])for(const size of [100,200])for(const width of [320,390])"),'retain all eight cases and original order');
 if(mode!=='original'){
  const prep=`\nconst diagnosticBefore=await page.evaluate(${snapshot});\nconst diagnosticEventsBefore=await page.evaluate(()=>window.__aimsNativeTrace.filter(e=>['pointerdown','mousedown','click'].includes(e.event)).length);\n${mode==='trial'?"await page.locator('.cc-doc-token button').filter({hasText:'QA9029'}).click({trial:true});":''}\n${stable}\nconst diagnosticAfter=await page.evaluate(${snapshot});\nassert.equal(await page.locator('.cc-doc-detail').count(),0,'preparation must not activate the product');\nassert.equal(await page.evaluate(()=>window.__aimsNativeTrace.filter(e=>['pointerdown','mousedown','click'].includes(e.event)).length),diagnosticEventsBefore,'preparation must not dispatch native activation');\nconsole.log('AIMS preparation diagnostic',JSON.stringify({mode:'${mode}',theme,size,width,zoomLabel,diagnosticBefore,diagnosticAfter}));\n`;
  generated=generated.replace(anchor,anchor+prep);
 }
 generated=generated.replace("assert.ok(Math.abs(after.y-before.y)<=1,","console.log('AIMS return diagnostic',JSON.stringify({before,activated,after}));assert.ok(Math.abs(after.y-before.y)<=1,");
 for(const assertion of assertions)assert(generated.includes(assertion),'strict original assertions retained');
 const file=path.resolve('scripts',`.aims-preaction-${mode}-${repeat}.cjs`);fs.writeFileSync(file,generated);
 const run=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:180000,env:process.env,maxBuffer:16*1024*1024});
 const log=(run.stdout||'')+'\n'+(run.stderr||'');fs.writeFileSync(path.join(root,`${mode}-${repeat}.log`),log);
 const records=log.split('\n').flatMap(line=>{for(const marker of ['AIMS preparation diagnostic ','AIMS activation snapshot ','AIMS native event trace ','AIMS return diagnostic ']){const at=line.indexOf(marker);if(at>=0){try{return [{kind:marker.trim(),...JSON.parse(line.slice(at+marker.length))}];}catch{}}}return [];});
 const result={mode,repeat,status:run.status,signal:run.signal,error:run.error?.message,records};trials.push(result);
 console.log('AIMS comparative result',JSON.stringify({ref:sha,mode,repeat,status:run.status,signal:run.signal,preparation:records.filter(r=>r.kind==='AIMS preparation diagnostic'),activation:records.filter(r=>r.kind==='AIMS activation snapshot'),returned:records.filter(r=>r.kind==='AIMS return diagnostic')}));
}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={targetRef:sha,platform:process.platform,node:process.version,assertionTolerancePx:1,diagnosticHarnessHash:hash(__filename),originalHarnessHash:hash('scripts/regression-aims-document-app.cjs'),componentHash:hash('client/src/components/v1391/AimsDocumentView.tsx'),preparedRosterHash:hash('client/src/components/v1391/RosterLaunchView.tsx'),trials};
fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));
// Any original or prepared variant failure keeps this diagnostic run red.
process.exitCode=trials.some(t=>t.status!==0)?1:0;
