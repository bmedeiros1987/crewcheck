import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { amilConfirmedProviders, amilCoverage } from '../shared/amil-coverage.mjs';
import { AMIL_DOCUMENTARY_QUERY as selection, AMIL_DOCUMENTARY_CAPTURE as capture, amilDocumentaryReferences, AMIL_DOCUMENTARY_NOTICE } from '../shared/amil-documentary-reference.mjs';
const units = amilDocumentaryReferences(selection);
assert.equal(units.length, 11);
assert.equal(new Set(units.map(unit => unit.id)).size, 11);
assert.ok(units.every(unit => unit.covered === false && unit.coverageStatus === 'unknown' && unit.documentationStatus === 'official_query_reference'));
assert.equal(capture.provenance.receivedAt, '2026-10-09T09:38:00Z');
assert.equal(capture.provenance.observedAt, null);
assert.equal(capture.provenance.originalQueryDateKnown, false);
assert.doesNotMatch(JSON.stringify(capture), /libfile_|referenceId|userId|email|CPF|carteirinha/);
assert.doesNotMatch(JSON.stringify(units), /libfile_|referenceId|userId|email/);
assert.match(AMIL_DOCUMENTARY_NOTICE, /data original da consulta não aparece/);
assert.match(AMIL_DOCUMENTARY_NOTICE, /não confirma rede atual/);
for (const unit of units) {
  assert.equal(unit.city, 'BRASILIA'); assert.equal(unit.state, 'DF');
  assert.equal(unit.provenance.sourceKind, 'user_presented_official_query');
  assert.ok(unit.mapsQuery.includes(unit.address)); assert.ok(unit.mapsQuery.includes(unit.neighborhood));
  assert.equal(amilCoverage(unit, selection).status, 'unknown');
  assert.equal(unit.productCode, undefined); assert.equal(unit.networkCode, undefined);
}
assert.deepEqual(amilConfirmedProviders(units, selection), []);
for (const change of [{identityKind:''},{productLabel:'S450'},{productLabel:'AMIL S450 QP'},{productLabel:'AMIL S450 QC'},{productLabel:'AMIL S750 COLAB'},{planCode:'S750'},{serviceCode:'PS'},{serviceCode:'M'},{specialty:'PRONTO SOCORRO INFANTIL'},{specialty:'PRONTO SOCORRO OFTALMOLOGICO'},{city:'GAMA'},{state:'GO'},{productCode:'made-up'},{networkCode:'made-up'}]) assert.deepEqual(amilDocumentaryReferences({...selection,...change}), []);
assert.equal(amilDocumentaryReferences({...selection,city:'Brasília',query:'santa marta'}).length,1);
for (const patch of [{review:{status:'pending_review'}},{selectorAndSummaryAgree:false},{sourceKind:'automatic_api'},{sourceUrl:'https://broker.example.invalid'},{observedAt:'2026-10-09'},{originalQueryDateKnown:true},{receivedAt:''}]) assert.deepEqual(amilDocumentaryReferences(selection,{...capture,provenance:{...capture.provenance,...patch}}), []);
const withoutAddress={...capture,units:[{...capture.units[0],address:''}]}; assert.deepEqual(amilDocumentaryReferences(selection,withoutAddress), []);
const changedUF={...capture,units:[{...capture.units[0],state:'GO'}]}; assert.deepEqual(amilDocumentaryReferences(selection,changedUF), []);
assert.equal(units[1].address,'QUADRA SEPS, 710910 CONJUNTO B BLOCO I E II');
assert.equal(units[4].address,'AREA ESPECIAL, 1418 NUMERO 16 LADO OESTE');
assert.equal(units[6].address,'QUADRA QSE, 17 AREA ESPECIAL NUMERO 01 SETOR SUL');
assert.equal(units[6].neighborhood,'TAGUATINGA SUL');
assert.equal(units[9].name,'PRONTONORTE'); assert.equal(units[4].name,'HOSPITAL MARIA AUXILIADORA');
// Exercise the authenticated API handler without config access, medical data,
// account writes, GPS, provider APIs or any transport.
const platform=fs.readFileSync('server/platform.mjs','utf8');
const begin=platform.indexOf('async function handleAmilSearch('), end=platform.indexOf('\nasync function handleProfile',begin);
const handler=platform.slice(begin,end);
let replies=[], authenticated=true, configReads=0;
const c=vm.createContext({requireMain:async()=>authenticated?{id:'fixture-owner'}:null,amilConfiguration:()=>{configReads++;return{configured:true};},amilSelection:url=>Object.fromEntries(url.searchParams),amilDocumentaryReferences,AMIL_DOCUMENTARY_NOTICE,AMIL_GUIDE_URL:capture.provenance.sourceUrl,sendJson:(_res,status,body)=>replies.push({status,body})});
vm.runInContext(handler,c);
const url=new URL('https://fixture.invalid/?'+new URLSearchParams(selection));
await c.handleAmilSearch({}, {}, url);
assert.equal(configReads,0); assert.equal(replies[0].body.referenceCount,11); assert.equal(replies[0].body.providers.length,0); assert.equal(replies[0].body.coverageStatus,'unknown');
authenticated=false; await c.handleAmilSearch({}, {}, url); assert.equal(replies.length,1);
if(process.argv.includes('--prepared')){
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');assert.match(home,/import AmilDocumentaryReference/);assert.match(home,/<AmilDocumentaryReference planCode=\{amilPlan\}/);
}
const component=fs.readFileSync('client/src/components/health/AmilDocumentaryReference.tsx','utf8');
assert.match(component,/Referência documental apresentada pelo usuário/);assert.match(component,/cobertura atual desconhecida/);assert.match(component,/data original desconhecida/);assert.match(component,/crewcheck:auth-changed/);assert.match(component,/\[planCode, productCode, networkCode, query, state, city, serviceCode, specialty\]/);
// Render the real component with a selected label. A contradictory code,
// variant/service change or query must affect the same render immediately.
const nativeRequire=createRequire(import.meta.url), exportsObject={};
let selectedLabel=selection.productLabel;
const ui=vm.createContext({exports:exportsObject,require:name=>name==='react'?{useState:()=>[selectedLabel,()=>{}],useEffect:()=>{}}:name==='react/jsx-runtime'?nativeRequire(name):name.includes('amil-documentary-reference')?{amilDocumentaryReferences,AMIL_DOCUMENTARY_NOTICE,AMIL_DOCUMENTARY_QUERY:selection}:name.includes('amil-coverage')?{AMIL_GUIDE_URL:capture.provenance.sourceUrl}:(()=>{throw Error('unexpected component import')})()});
vm.runInContext(ts.transpileModule(component,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,ui);
const props={...selection,productCode:'',networkCode:'',query:''};
const rendered=renderToStaticMarkup(exportsObject.default(props));
assert.equal((rendered.match(/<article/g)||[]).length,11);assert.match(rendered,/data original desconhecida/);assert.match(rendered,/710910/);
for(const patch of [{productCode:'AMIL S450 QP'},{networkCode:'COLAB'},{planCode:'S750'},{serviceCode:'PS'},{specialty:'PRONTO SOCORRO INFANTIL'}]){
 const html=renderToStaticMarkup(exportsObject.default({...props,...patch}));assert.equal((html.match(/<article/g)||[]).length,0);assert.match(html,/não corresponde aos filtros/);
}
assert.equal((renderToStaticMarkup(exportsObject.default({...props,query:'SANTA MARTA'})).match(/<article/g)||[]).length,1);
selectedLabel='';assert.equal((renderToStaticMarkup(exportsObject.default(props)).match(/<article/g)||[]).length,0);
console.log('PASS Amil documentary reference: 11 exact transcribed units, unknown original date/current coverage, strict label/service/geography, no codes/API/auth bypass, distinct from confirmed providers');
