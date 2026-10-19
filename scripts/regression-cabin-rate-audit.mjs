import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const m=loadClientModules({files:['client/src/lib/financialPayrollPeriods.ts','client/src/lib/financialReferenceCatalog.ts','client/src/lib/cabinSalaryRateReference.ts'],prefix:'synthetic-cabin-rate-audit-'});
try{
 const {cabinSalaryRateReference:reference}=m.load('cabinSalaryRateReference');
 for(const tz of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=tz;
  const result=reference('2026-10');assert.equal(result.rateMonth,'2026-11');
  assert.equal(result.referenceEffectiveFrom,'2025-12-01');assert.equal(result.referenceEffectiveTo,'2026-11-30');
  assert.match(result.description,/produção 2026-10 · mês tarifário 2026-11/);
  assert.match(result.description,/intervalo desta referência derivada: 2025-12 a 2026-11/);assert.doesNotMatch(result.description,/referência vigente/);
  assert.equal(reference('2025-11'),null,'cross-ACT operational cycle is not backfilled');
  const first=reference('2025-12'),prior=reference('2026-09');
  assert.equal(first.rateMonth,'2026-01');assert.equal(prior.rateMonth,'2026-10');
  for(const key of ['dayKm','nightKm','reserveHour','standbyHour','excessHour'])assert.equal(first[key],result[key],'same bounded reference, no future index: '+key);
  assert.equal(reference('2026-12'),null,'unknown future reference stays unknown');
  assert.equal(result.dayKm,585475941/1e10);assert.equal(result.nightKm,1170951882/1e10);
  assert.equal(result.reserveHour,49768875/1e6);assert.equal(result.standbyHour,16589625/1e6);
  assert.equal(reference('2026-11'),null,'December2026 index is not extrapolated');assert.equal(reference('2032-05'),null);assert.equal(reference('invalid'),null);
 }
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='loadActCompensationConfig');assert(fn);
 let overrides={},learned={};
 const scope=vm.createContext({cabinSalaryRateReference:reference,resolveActFinancialRules:()=>({profileLabel:'Comissário(a) - ACT 2025/2027',legalReference:'ACT3.2.7/3.2.8',salary:{dayKm:.057349,nightKm:.114698,reserveHour:48.75,standbyHour:16.25}}),rosterFinancialDate:r=>r.year+'-'+String(r.month).padStart(2,'0')+'-01',readOptionalNumberSetting:k=>overrides[k]??null,readNumberSetting:(k,d)=>d,confirmedRateValueAt:k=>learned[k]??null,readMonthlyFinancialSettings:()=>null,applyMonthlySalaryInputs:x=>x});
 vm.runInContext(ts.transpileModule(fn.getText(ast)+'\nglobalThis.load=loadActCompensationConfig',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const actual=scope.load({year:2026,month:10});assert.equal(actual.dayKmMetric,reference('2026-10').dayKm);assert.notEqual(actual.dayKmMetric,.057349,'counterproof: previous printed rate understated the derived reference');
 overrides={crewcheck_act_day_km_metric_brl:2};learned={'salary.nightKm':3};const personal=scope.load({year:2026,month:10});assert.equal(personal.dayKmMetric,2);assert.equal(personal.nightKmMetric,3,'reviewed rates are never indexed a second time');assert.equal(personal.reserveHourMetric,reference('2026-10').reserveHour);
 overrides={};learned={};assert(Number.isNaN(scope.load({year:2026,month:11}).dayKmMetric));
 const productionStatements=[];
 function collect(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['dayProduction','nightProduction','production'].includes(d.name.getText(ast))))productionStatements.push(n.getText(ast));ts.forEachChild(n,collect);}
 const calc=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='calculateSalary');collect(calc);
 const selected=productionStatements.filter(s=>s.includes('dayKm === 0')||s.includes('nightKm === 0')||s.includes('timeKnown ? dayProduction + nightProduction'));assert.equal(selected.length,3);
 for(const [dayKm,nightKm,dayRateApplied,nightRateApplied,expected] of [[1000,0,1,NaN,1000],[0,1000,NaN,2,2000],[1000,1,1,NaN,NaN]]){const c=vm.createContext({dayKm,nightKm,dayRateApplied,nightRateApplied,timeKnown:true});vm.runInContext(selected.join('\n')+'\nglobalThis.result=production',c);assert(Object.is(c.result,expected));}
 console.log('PASS independent ACT/IBGE integer counterproof + actual Home loader3TZ: 2.09% once for bounded M+1 default reference; personal/reviewed precedence, unknown future index, exact tariff precision; no writes.');
}finally{m.cleanup();}
