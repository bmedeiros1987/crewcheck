import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import Card from'./client/src/components/health/HealthLockscreenCard';const root=createRoot(document.getElementById('root'));window.qa.render=()=>root.render(<Card values={window.qa.values}/>);window.qa.render();`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, jsx: 'automatic', format: 'iife', plugins: [{ name: 'fixture', setup(b) {
 b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'fixture' }));b.onLoad({ filter: /^css$/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' }));
 b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));
} }] });
const { JSDOM } = createRequire(process.env.VISITOR_JSDOM_PACKAGE || import.meta.url)('jsdom');
const cases = ['selection-decode','consent-decode','selection-blob','consent-blob','values-decode','consent-roundtrip','selection-roundtrip','unchanged'];
for (const scenario of cases) {
 const dom = new JSDOM('<div id="root"></div>', { url:'https://fixture.invalid',runScripts:'dangerously',pretendToBeVisual:true }), w=dom.window,d=w.document;
 let decode,blob,downloads=0,canvasReads=0,urls=0;
 w.qa={values:{displayName:'Pessoa sintética',bloodType:'O+',allergies:'FIXTURE_ONLY'}};
 w.fetch=()=>{throw Error('No network allowed');};w.Image=class{decode(){return new Promise(r=>decode=r);}};
 w.HTMLCanvasElement.prototype.getContext=()=>{canvasReads++;return{drawImage(){}};};w.HTMLCanvasElement.prototype.toBlob=callback=>{blob=()=>callback(new w.Blob(['fixture'],{type:'image/png'}));};
 w.URL.createObjectURL=()=>{urls++;return'blob:fixture';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{downloads++;};
 w.eval(bundle.outputFiles[0].text);
 const wait=async(f,label)=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout '+scenario+' '+label);};
 const pause=()=>new Promise(r=>setTimeout(r,20));const button=text=>[...d.querySelectorAll('button')].find(e=>e.textContent===text);
 const selected=()=>[...d.querySelectorAll('fieldset label')].find(e=>e.textContent==='Nome')?.querySelector('input');const consent=()=>[...d.querySelectorAll('label')].find(e=>e.textContent.startsWith('Autorizo salvar'))?.querySelector('input');
 try {
  await wait(selected,'mounted');selected().click();await pause();button('Ver prévia').click();await wait(consent,'preview');consent().click();await wait(()=>!button('Salvar imagem PNG').disabled,'approved');button('Salvar imagem PNG').click();await wait(()=>decode,'decode');
  if(scenario.endsWith('-blob')||scenario==='unchanged'){decode();await wait(()=>blob,'blob');}
  if(scenario.startsWith('selection-')){selected().click();await pause();if(scenario==='selection-roundtrip'){selected().click();await pause();button('Ver prévia').click();await wait(consent,'new preview');consent().click();await pause();}}
  else if(scenario.startsWith('consent-')){consent().click();await pause();if(scenario==='consent-roundtrip'){consent().click();await pause();}}
  else if(scenario==='values-decode'){w.qa.values={...w.qa.values,displayName:'Pessoa sintética alterada'};w.qa.render();await pause();}
  if(!scenario.endsWith('-blob')&&scenario!=='unchanged'){decode();await pause();}
  if(blob)blob();await pause();
  assert.equal(downloads,scenario==='unchanged'?1:0,scenario+': stale selection/consent must not export');
  assert.equal(urls,scenario==='unchanged'?1:0,scenario+': cancelled export must not mint a download URL');
  if(scenario.includes('decode')||scenario.endsWith('roundtrip'))assert.equal(canvasReads,0,scenario+': cancel before canvas after decode');
 } finally {w.close();}
}
console.log('PASS 8 actual HealthLockscreenCard export races: selection/consent changes at decode/toBlob, same-value roundtrips, changed data, unchanged positive control; fake image/canvas/blob/download, no real data or file export.');
