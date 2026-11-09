import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const source=fs.readFileSync('scripts/v14353/flydeck-premium.snippet','utf8');
const span=source.match(/<span className="cc-flydeck-live" role="group" aria-label=[\s\S]*?<\/span>/)?.[0];assert.ok(span);
const js=ts.transpileModule('exports.render=(nowMs:number)=>('+span+');',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};vm.runInNewContext(js,{exports,React:{createElement:(type,props,...children)=>({type,props,children})},flyDeckLiveClockV14353:n=>n===1?'09:05':'09:06'});
for (const [n,time] of [[1,'09:05'],[2,'09:06']]) {const node=exports.render(n);assert.equal(node.props['aria-label'],`Hora local do aparelho ${time}; não indica atualização da fonte operacional`);assert.equal(node.props['aria-live'],undefined);assert.equal(node.props.role,'group');assert.ok(node.children.includes(time));}
console.log('PASS rendered accessible clock includes visible time, changes consistently, and adds no live region or operational update claim');
