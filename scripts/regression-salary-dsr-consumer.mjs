import assert from 'node:assert/strict';
import {build} from 'esbuild';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'salary-dsr-consumer-')),out=path.join(dir,'consumer.cjs');
await build({entryPoints:['client/src/lib/salaryDsrConsumer.ts'],bundle:true,platform:'node',format:'cjs',outfile:out});
try{
 const {consumeSalaryDsr, salaryDsrReceipt}=createRequire(import.meta.url)(out);
 const ownerId='synthetic-owner',month='2026-10',source={ownerId,competence:month,sourceId:'synthetic-report',revision:2,effectiveFrom:month+'-01',effectiveTo:month+'-31'};
 const context={profile:{...source,company:'TAM',role:'cabin',regime:'NB',review:'confirmed',sourceKind:'employer_document'},basisReview:{...source,review:'confirmed'},reportedDsr:{...source,amountMinor:50000,currency:'BRL',status:'confirmed'},sourcePayrollMonth:'2026-11',sourceOperationalMonth:month,derivation:'reconciled_paid_dsr'};
 let current=true;const fence={isCurrent:()=>current};
 const receipt=salaryDsrReceipt(ownerId,month,'actual-inputs-A',fence);
 assert.equal(salaryDsrReceipt(ownerId,month,'actual-inputs-A',fence).revision,receipt.revision);
 const changed=salaryDsrReceipt(ownerId,month,'actual-inputs-B',fence);assert(changed.revision>receipt.revision);
 const parts=['base','fixedAdditions','production','reserve','standby','chief','instructor'].map(key=>({key,amount:null,knownAmount:null,complete:false}));
 const call=(patch={})=>consumeSalaryDsr({ownerId,month,receipt:changed,context,parts,isCurrent:fence.isCurrent,...patch});
 let value=call();assert.equal(value.composition.grossMinor,null);assert.equal(value.observedSubtotalMinor,null);assert.equal(value.composition.reportedDsrMinor,50000);
 value=call({parts:parts.map(p=>p.key==='production'?{...p,knownAmount:123.45}:p)});assert.equal(value.observedSubtotalMinor,12345);assert.equal(value.composition.dsr.amountMinor,null);assert.equal(value.components.find(p=>p.key==='production').amountMinor,null,'observed subtotal is not a complete component');
 value=call({parts:parts.map(p=>p.key==='reserve'?{...p,knownAmount:0}:p)});assert.equal(value.observedSubtotalMinor,0,'explicit known zero stays distinct from absence');assert.equal(value.composition.dsr.amountMinor,null);
 value=call({parts:parts.map(p=>p.key==='reserve'?{...p,knownAmount:NaN}:p)});assert.equal(value.observedSubtotalMinor,null,'NaN cannot become zero');
 value=call({ownerId:'other-owner'});assert.equal(value.composition.reportedDsrMinor,null);
 value=call({month:'2026-09'});assert.equal(value.composition.reportedDsrMinor,null);
 const complete=parts.map(p=>({...p,amount:p.key==='production'?220:0,knownAmount:p.key==='production'?220:0,complete:true}));
 value=call({parts:complete});assert.equal(value.composition.dsr.amountMinor,8000);assert.equal(value.composition.grossMinor,30000);assert.equal(value.observedSubtotalMinor,22000,'reported DSR is not added');
 current=false;value=call();assert.equal(value.current,false);assert.equal(value.observedSubtotalMinor,null);assert.equal(value.composition.reportedDsrMinor,null);assert.equal(salaryDsrReceipt(ownerId,month,'A',fence),null);
 const reloaded=salaryDsrReceipt(ownerId,month,'actual-inputs-B',{isCurrent:()=>true});assert(reloaded.revision>changed.revision,'new context invalidates prior ephemeral receipt');
 console.log('PASS DSR consumer: unknown versus zero, observed positive subtotal, incomplete inventory, complete model delegation, reported separation, owner/month, NaN and ephemeral session revision');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
