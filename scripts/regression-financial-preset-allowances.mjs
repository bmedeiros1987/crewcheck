import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const data=new Map(),old={window:globalThis.window,localStorage:globalThis.localStorage};
globalThis.window=new EventTarget();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
const h=loadClientModules({files:['client/src/lib/financialActApplicability.ts','client/src/lib/sharedAllowanceResolution.ts'],prefix:'synthetic-preset-allowances-'});
try{
 const j=h.load('financialActApplicability'),r=h.load('sharedAllowanceResolution'),p=h.load('payrollProjectionPeriods');
 data.set('crewcheck_auth_user',JSON.stringify({id:'SYN-A',role:'user'}));data.set('crewcheck_auth_token','SYN-A');
 const args={category:'domestic',slot:'mainMeal',date:'2026-11-04',owned:null,roster:{airline:'LA',rank:'CC'}};
 const resolve=(patch={})=>r.resolveSharedAllowanceSlot({...args,context:j.readFinancialActApplicability(),...patch});
 const main=resolve();assert.equal(main.kind,'forecast');assert.equal(main.value,109.44);assert.equal(main.source,'system_default:admin_enterprise_reference');assert.equal(main.reference.computedFloorMinor,10943,'ACT computed floor must not replace enterprise reference');
 const capturedScope=p.financialPresetScope(args.roster,j.readFinancialActApplicability());assert(capturedScope.allowsMonth('2026-11'));
 data.set('crewcheck_profile_rank','Copiloto');assert.equal(capturedScope.allowsMonth('2026-11'),false,'profile change invalidates the captured cabin scope');assert.equal(resolve().kind,'pending','registered pilot context vetoes a parser cabin default');data.delete('crewcheck_profile_rank');
 data.set('crewcheck_profile_rank','Comissário');assert.equal(resolve({roster:{airline:'LA',rank:'PILOT'}}).kind,'pending','cabin profile cannot override a pilot roster');assert.equal(resolve({roster:{airline:'LA',rank:''}}).kind,'pending','global cabin profile cannot prove unknown roster rank');data.delete('crewcheck_profile_rank');
 assert.equal(resolve({slot:'breakfast'}).value,27.36);assert.equal(resolve({slot:'taxi'}).value,27.36);assert.equal(data.has(j.financialActStorageKey('SYN-A')),false,'preset never saves an owner declaration');
 for(const roster of [{airline:'ZZ',rank:'CC'},{airline:'LA',rank:''},{airline:'LA',rank:'PILOT'}])assert.equal(resolve({roster}).kind,'pending');
 assert.equal(resolve({archiveIssue:'SYNTHETIC unreadable archive'}).kind,'pending');
 const manual=resolve({owned:{value:0,source:'manual',description:'SYNTHETIC explicit zero',version:'SYN-zero'}});assert.equal(manual.value,0);assert.equal(manual.source,'manual');
 const foreign=resolve({category:'argentina'});assert.equal(foreign.kind,'reference');assert.equal(foreign.value,22.05,'foreign floor remains reference only, not a paid international rate');
 assert.equal(resolve({date:'2026-12-04'}).kind,'pending','future index not invented');
 const captured=j.readFinancialActApplicability();data.set(j.financialActStorageKey('SYN-A'),'corrupt');assert.equal(r.resolveSharedAllowanceSlot({...args,context:captured}).kind,'pending','captured default cannot ignore same-owner corrupt bytes');assert.equal(resolve().actCause,'act_invalid');
 const declaration={schema:1,ownerId:'SYN-A',revision:1,events:[{revision:1,from:'2026-11-01',through:'2026-11-30',active:false,confirmed:true,source:'owner_financial_confirmation'}]};data.set(j.financialActStorageKey('SYN-A'),JSON.stringify(declaration));assert.equal(resolve().actCause,'act_revoked');
 data.delete(j.financialActStorageKey('SYN-A'));window.dispatchEvent(new Event('crewcheck:auth-will-change'));data.set('crewcheck_auth_user',JSON.stringify({id:'SYN-B',role:'user'}));data.set('crewcheck_auth_token','SYN-B');window.dispatchEvent(new Event('crewcheck:auth-changed'));assert.equal(r.resolveSharedAllowanceSlot({...args,context:captured}).kind,'pending');
 console.log('PASS synthetic allowance preset: enterprise versus floor, unknown role/company, manual zero, archive/read/revision/account fences, no declaration writes, no future index or international tariff promotion');
}finally{h.cleanup();Object.assign(globalThis,old);}
