import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const classification = {};
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/scheduleActivityClassification.ts','utf8')), {exports:classification});
const policy = {};
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/airportDeparturePolicy.ts','utf8')), {exports:policy,require:()=>classification});
const hsb = {id:'home',kind:'duty',title:'HSB',flightNumber:'HSB',origin:'BSB',destination:'BSB',presentation:'02:00',departure:'02:00',day:{type:'HSB',legs:[]},canonical:{kind:'duty',code:'HSB'}};
assert.equal(policy.isAirportDepartureEligible(hsb),false);
assert.equal(policy.isAirportDepartureEligible({...hsb,title:'HSB não acionado'}),false);
assert.equal(policy.isAirportDepartureEligible({...hsb,activated:true}),false,'activation alone does not prove airport assignment');
assert.equal(policy.isAirportDepartureEligible({...hsb,activated:true,airportAssignment:true}),true);
assert.equal(policy.isAirportDepartureEligible({...hsb,day:{type:'HSB',legs:[{type:'HSB'}]}}),false,'pseudo-leg is not flight activation');
assert.equal(policy.isAirportDepartureEligible({...hsb,flightNumber:'RES',title:'Reserva',day:{type:'RES',legs:[]},canonical:{kind:'duty',code:'RES'}}),false,'reserve base is not airport assignment');
const flight = {...hsb,id:'flight',kind:'flight',flightNumber:'LA1234',destination:'GRU',departure:'03:00',presentation:'02:00',canonical:{kind:'flight',code:'LA1234'},day:{type:'HSB',legs:[]}};
assert.equal(policy.isAirportDepartureEligible(flight),true);
const home = fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast = ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
const names = ['isDepartureEligibleEvent','nextDepartureEvent'];
const functions = ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>'export '+node.getText(ast)).join('\n');
assert.equal(functions.includes('isAirportDepartureEligible'),true,'generated page uses shared commute policy');
const selection = {};
vm.runInNewContext(compile(functions), {
 exports:selection, isAirportDepartureEligible:policy.isAirportDepartureEligible,
 isDepartureRestEvent:e=>Boolean(e.placeholder),validDepartureClock:v=>/^\d\d:\d\d$/.test(v),
 departurePresentationDateTime:e=>new Date(e.reportAt),eventStartDateTime:e=>new Date(e.startAt),
 noFutureLeg:()=>({placeholder:true}),Date,
});
const overnightHSB = {...hsb,reportAt:'2026-10-09T02:00:00-03:00',startAt:'2026-10-09T02:00:00-03:00'};
const overnightFlight = {...flight,reportAt:'2026-10-09T03:00:00-03:00',startAt:'2026-10-09T04:00:00-03:00'};
for(const now of ['2026-10-08T23:59:00-03:00','2026-10-09T02:15:00-03:00']) {
 assert.equal(selection.nextDepartureEvent([overnightHSB],new Date(now)).placeholder,true);
 assert.equal(selection.nextDepartureEvent([overnightHSB,overnightFlight],new Date(now)).id,'flight');
}
assert.match(home,/function Departure\(props:[\s\S]{0,300}if \(!isDepartureEligibleEvent\(props.event\)\)/);
assert.match(home,/Início: /);
assert.doesNotMatch(home,/isSmartDepartureEligible\(event\)/);
console.log('PASS: HSB at home has no airport route/alarm candidate; explicit airport activation and flight survive; RES not inferred; midnight and timezone fixtures.');
