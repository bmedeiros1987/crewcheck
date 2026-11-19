import assert from 'node:assert/strict';import {build} from 'esbuild';import {createRequire} from 'node:module';import vm from 'node:vm';import path from 'node:path';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const {outputFiles}=await build({stdin:{contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import Net from './client/src/components/finance/PayrollNetEstimate';export const render=()=>renderToStaticMarkup(<Net gross={5000} complete={true} month="2026-10" paymentMonth="2026-11" compositionKey="synthetic-composition"/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic',alias:{'@':path.join(root,'client/src')},loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'}});
for(const [name,storage]of [['absent',undefined],['denied',{getItem(){throw new Error('SYNTHETIC_STORAGE_DENIED');}}]]){
 const module={exports:{}};
 vm.runInNewContext(outputFiles[0].text,{module,exports:module.exports,require,console,Intl,Date,URL,...(storage?{localStorage:storage}:{})});
 let html;
 assert.doesNotThrow(()=>{html=module.exports.render();},'storage '+name+' must fail closed without breaking rendering');
 assert.match(html,/Pendente para calcular o líquido/);
 assert.match(html,/Líquido individual a confirmar/);
 assert.match(html,/INSS: pendente\. IRRF: pendente/);
 assert.doesNotMatch(html,/data-payroll-standard-net|data-payroll-individual-net|Saldo de ajuste negativo|<input/);
}
console.log('PASS actual net component SSR: absent/denied storage renders pending, never an amount or assumed deduction');
