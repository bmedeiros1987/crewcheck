import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const home = fs.readFileSync(process.env.TRANSIT_UI_SOURCE || 'client/src/pages/Home.tsx','utf8');
assert.ok(home.includes('data-transit-operation="unknown"'));
assert.ok(home.includes('Fonte operacional: não conectada. Atualização operacional: indisponível.'));
assert.ok(home.includes('Horários de serviço, últimas conexões e interrupções ainda não foram verificados para a viagem.'));
assert.ok(home.includes("mapsMode === 'transit' ? 'Itinerário de transporte público' : 'Rota ao vivo'"));
assert.ok(home.includes("mapsMode === 'transit' ? 'Itinerário calculado nesta consulta; funcionamento do transporte não confirmado.'"));
assert.ok(home.includes("buildGoogleMapsDirectionsUrl(origin, destination, 'driving')"));
// Execute the actual outer Departure wrapper: home standby must not mount the route tree.
const ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const wrapper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='Departure');assert.ok(wrapper);
const eligibility=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='isDepartureEligibleEvent');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const classification={},policy={};vm.runInNewContext(compile(fs.readFileSync('client/src/lib/scheduleActivityClassification.ts','utf8')),{exports:classification});vm.runInNewContext(compile(fs.readFileSync('client/src/lib/airportDeparturePolicy.ts','utf8')),{exports:policy,require:()=>classification});
const module=ts.transpileModule(eligibility.getText(ast)+'\nexport '+wrapper.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
let routeMounts=0;
const exports={};
vm.runInNewContext(module,{exports,React:{createElement(type,props,...children){if(type===AirportDeparture)routeMounts++;return {type,props,children};},Fragment:'fragment'},AirportDeparture,isAirportDepartureEligible:policy.isAirportDepartureEligible,isHomeStandby:policy.isHomeStandby,Brand(){},Car(){},Clock(){}});
function AirportDeparture(){}
exports.Departure({events:[],setView(){},event:{kind:'duty',flightNumber:'SA',presentation:'02:00',origin:'BSB'}});assert.equal(routeMounts,0,'unactivated home standby still cannot mount route components');
console.log('PASS actual prepared UI: transit unknown label, operational provenance absent, driving alternative; home standby guard preserved.');
