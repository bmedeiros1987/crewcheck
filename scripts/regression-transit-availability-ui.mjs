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
// Render actual component and estimate to verify all departure consumers.
const {transitDeparturePresentation}=await import('../shared/transitAvailability.mjs');
const airport=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='AirportDeparture');
const estimator=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='smartDepartureEstimate');
const renderer=ts.transpileModule('export '+estimator.getText(ast)+'\nexport '+airport.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.children):String(node);
const find=(node,predicate)=>Array.isArray(node)?node.flatMap(n=>find(n,predicate)):node&&typeof node==='object'?[...(predicate(node)?[node]:[]),...find(node.children,predicate)]:[];
function render(mode,route,requiresFlight=false){
 const out={},saved=[];let state=0;const plan={requiresFlight,sameDayConfirmed:false,originAirport:{code:'BSB'},travelDate:new Date('2026-10-08T12:00:00Z')};
 const context={exports:out,transitDeparturePresentation,React:{createElement:(type,props,...children)=>({type,props:props||{},children}),Fragment:'fragment'},useEffect(){},useState(initial){const index=state++;return[index===3?route:typeof initial==='function'?initial():initial,()=>{}]},storage:{get:(key,fallback)=>key==='crewcheck_departure_mode'?mode:fallback,set(){}},eventRouteOrigin:()=> 'synthetic-origin',eventRouteOriginLabel:()=> 'Synthetic origin',vacationContextForEventsV14738:()=>null,departurePositioningPlan:()=>plan,departurePositioningRecord:()=>null,readPositioningSearch:()=>null,isPositioningSearchPending:()=>false,departureRouteMismatch:()=>false,routeDurationMinutes:r=>r?.durationMinutes||0,saveDepartureTravelMinutes:(_event,minutes)=>saved.push(minutes),readDepartureTravelMinutes:()=>35,defaultDepartureTravelMinutes:()=>35,hasPublishedPresentationForDeparture:()=>true,eventClockDate:()=>new Date('2026-10-08T12:00:00Z'),departureCivilDateLabel:()=> 'Synthetic day',buildGoogleMapsDirectionsUrl:()=> 'https://maps.invalid/',crewCheckUberXUrl:()=> 'https://uber.invalid/'};
 for(const name of ['Brand','Navigation','Car','MapIcon','Clock','ShieldCheck','GoogleMapsRoutePreview'])context[name]=()=>{};
 vm.runInNewContext(renderer,context);return{node:out.AirportDeparture({event:{id:'synthetic',kind:'flight',flightNumber:'SYN1',origin:'BSB',destination:'CGH',departure:'10:00',presentation:'09:00'},events:[],setView(){}}),saved,inspect:()=>out.smartDepartureEstimate({presentation:'09:00',departure:'10:00'},route,15,mode)};
}
for(const mode of ['transit','transit-flight'])for(const state of ['pending','valid','stale','error'])for(const positioned of [false,true]){
 const result=render(mode,{clientRouteState:state,clientTravelMode:'transit',durationMinutes:40,message:'Synthetic calculated itinerary'},positioned);
 const hero=find(result.node,n=>n.props.className==='cz-depart-hero')[0];assert.ok(hero);
 const heroText=text(hero);assert.ok(heroText.includes('FUNCIONAMENTO NÃO CONFIRMADO'));assert.ok(heroText.includes('A confirmar'));assert.ok(heroText.includes('Horário a confirmar'));assert.ok(!heroText.includes('TRÂNSITO ATUALIZADO')&&!heroText.includes('ESTIMATIVA PROTEGIDA')&&!heroText.includes('Sair em'));
 const allText=text(result.node);assert.ok(!allText.includes('estimativa segura')&&!allText.includes('mantive a estimativa protegida'));assert.deepEqual(result.saved,[],'unverified transit time cannot populate driving cache');
 assert.equal(find(hero,n=>n.props.className==='cz-depart-status ready').length,0);
}
const driving=render('driving',{clientRouteState:'valid',clientTravelMode:'driving',durationMinutes:40});assert.ok(text(driving.node).includes('TRÂNSITO ATUALIZADO'));assert.ok(text(driving.node).includes('Sair em'));assert.equal(driving.saved.length,1,'positive driving estimate still saves its route');
console.log('PASS actual hero/estimate render across states and positioning: transit unconfirmed, driving preserved.');

const switched=render('driving',{clientRouteState:'valid',clientTravelMode:'transit',durationMinutes:40});assert.deepEqual(switched.saved,[],'previous transit response cannot become driving cache after mode switch');assert.ok(!text(switched.node).includes('TRÂNSITO ATUALIZADO'));
for(const name of ['fetchNearbyPlaces','fetchAmilProviders']){const unrelated=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(!unrelated.getText(ast).includes('clientTravelMode'),'travel metadata stays inside route fetch, not '+name);}
const durationText=result=>text(find(result.node,n=>n.props.className==='cz-depart-kpis')[0].children[1]);
for(const mode of ['transit','transit-flight'])for(const route of [null,{clientRouteState:'pending',clientTravelMode:'transit',durationMinutes:40},{clientRouteState:'error',clientTravelMode:'transit',durationMinutes:40},{clientRouteState:'stale',clientTravelMode:'transit',durationMinutes:40},{ok:true,clientRouteState:'valid',clientTravelMode:'driving',durationMinutes:40},{ok:true,clientRouteState:'stale',clientTravelMode:'driving',durationMinutes:40},{ok:false,clientRouteState:'valid',clientTravelMode:'transit',durationMinutes:40}]){
 const result=render(mode,route);assert.ok(durationText(result).includes('Duração não confirmada'),'transit duration cannot borrow driving/default/stale value: '+JSON.stringify(route));assert.ok(!durationText(result).includes('35 min')&&!durationText(result).includes('40 min'));assert.deepEqual(result.saved,[]);const estimate=result.inspect();assert.equal(estimate.travelMinutes,null);assert.equal(estimate.leadMinutes,null);assert.equal(estimate.leaveDate,null);
}
for(const mode of ['transit','transit-flight']){const current=render(mode,{ok:true,clientRouteState:'valid',clientTravelMode:'transit',durationMinutes:40});assert.ok(durationText(current).includes('40 min'),'positive current transit itinerary retains own duration');assert.deepEqual(current.saved,[]);const estimate=current.inspect();assert.equal(estimate.travelMinutes,40);assert.equal(estimate.leaveDate,null);assert.equal(estimate.leadMinutes,null);assert.ok(text(current.node).includes('FUNCIONAMENTO NÃO CONFIRMADO'),'itinerary duration does not confirm operation');}
console.log('PASS transit duration: no driving/default/stale/pending/error substitution; valid current transit duration only.');
