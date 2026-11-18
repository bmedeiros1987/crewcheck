import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import ts from 'typescript';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const h=loadClientModules({files:['client/src/lib/crewOccurrenceAssociation.ts','client/src/lib/pdfParser.ts','client/src/lib/aimsParser.ts'],expose:{aimsParser:['parseAimsCrewMembersFromTripulationText','parseTripulationRecords','applyTripulationRecords'],pdfParser:['parseCrewMembersFromTripulationText','parseGenericTripulationRecords','applyGenericTripulationRecordsToDays']},prefix:'synthetic-crew-'});
// Vite-only worker URL is not needed by these text/association unit cases.
const temp=path.join(h.dir,'pdfParser.js');const compiled=fs.readFileSync(temp,'utf8');
assert(compiled.includes('require("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")'));
fs.writeFileSync(temp,compiled.replace('require("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")','({default:"synthetic-worker-url"})'));
try{
for(const [module,parse,records,apply] of [['aimsParser','parseAimsCrewMembersFromTripulationText','parseTripulationRecords','applyTripulationRecords'],['pdfParser','parseCrewMembersFromTripulationText','parseGenericTripulationRecords','applyGenericTripulationRecordsToDays']]){
 const m=h.load(module),members=m[parse]("CP Alice Ávila FO D'Ávila CCM Íris CC Sol",'FICTITIOUS OWNER');
 assert.equal(members.length,4,'single-word cabin names remain visible');
 const rs=m[records]('Tripulações\n10/11/2032 LA9001 CP Alice Ávila CC Sol','FICTITIOUS OWNER',2032,11);
 const days=[10,11].map(n=>({date:n+'/11/2032',legs:[{flightNumber:'LA9001'}]}));
 const out=m[apply](days,rs,'FICTITIOUS OWNER');
 assert.equal(out[0].legs[0].crew.length,2);assert.equal(out[1].legs[0].crew?.length||0,0,'no flight-only date fallback');
 for(const separator of ['/','-','.'])for(const year of ['2032','32','']){
  const civil=['10','11',...(year?[year]:[])].join(separator);
  for(const text of [civil+' LA9001 CP Alice Silva CC Ana Silva',civil+'\nLA 9001\nCP Alice Silva CC Ana Silva']){
   const dated=m[records]('Tripulações\n'+text,'FICTITIOUS OWNER',2032,11);
   assert.equal(dated.length,1,module+' supported date produces one record');assert.equal(dated[0].date,'10/11/2032',module+' preserves supported date '+civil);
   const attached=m[apply](days,dated,'FICTITIOUS OWNER');assert.equal(attached[0].legs[0].crew?.length,2,module+' supported date must attach to exact occurrence');assert(!attached[1].legs[0].crew,'no cross-date fallback for '+civil);
  }
  const pair=m[records]('Tripulações\n'+civil+' LA9001 CC First Person\n'+['11','11',...(year?[year]:[])].join(separator)+' LA9001 CC Second Person','FICTITIOUS OWNER',2032,11);
  const attached=m[apply](days,pair,'FICTITIOUS OWNER');assert.equal(attached[0].legs[0].crew?.[0].name,'First Person');assert.equal(attached[1].legs[0].crew?.[0].name,'Second Person','next row must not join previous crew');
  const invalid=m[records]('Tripulações\n'+['31','11',...(year?[year]:[])].join(separator)+' LA9001 CC Ana Silva','FICTITIOUS OWNER',2032,11);assert(!m[apply](days,invalid,'FICTITIOUS OWNER')[0].legs[0].crew,'invalid civil dates remain unassigned');
 }
 const owner='FICTITIOUS OWNER';
 const row=(date,names='CP Alice Ávila CCM Íris CC Sol')=>m[records]('Tripulações\n'+(date?date+' ':'')+'LA9001 '+names,owner,2032,11);
 assert.equal(m[apply](days,row(''),owner)[0].legs[0].crew,undefined,'missing date never attaches');
 assert.equal(m[apply](days,row('31/11/2032'),owner)[0].legs[0].crew,undefined,'invalid civil date never attaches');
 const conflict=m[apply](days,[...row('10/11/2032'),...row('10/11/2032','CP Other Person')],owner);
 assert.equal(conflict[0].legs[0].crew,undefined);assert.equal(conflict[0].legs[0].crewAssociation,'ambiguous');
 assert.equal(m[apply](days,[...rs,...rs],owner)[0].legs[0].crew.length,2,'identical source duplicate is idempotent');
 assert.equal(m[apply]([{...days[0],legs:[{flightNumber:'LA9001',aimsSourceDate:'2032-11-10'}]}],rs,owner)[0].legs[0].crew.length,2);
 const twice=[{...days[0],legs:[...days[0].legs,...days[0].legs]}];
 assert(m[apply](twice,rs,owner)[0].legs.every(l=>!l.crew),'same flight twice on date needs occurrence evidence');
 assert(!m[apply]([{...days[0],legs:[{flightNumber:'AA9001'}]}],rs,owner)[0].legs[0].crew,'carrier identity preserved');
 const old=JSON.parse(JSON.stringify(out));const revised=m[apply](old,row('11/11/2032'),owner);
 assert(!revised[0].legs[0].crew);assert.equal(revised[1].legs[0].crew.length,3,'reimport does not carry prior occurrence association');
 const multiple=m[parse]("CP Alice Ávila CP Other Captain FO D'Ávila FO Other Officer CCM Íris CCM Other Lead CC Sol CC Uma Pessoa CC Lia CC Zoé CC Another Person",owner);
 assert.equal(multiple.length,11,'all repeated roles preserved without composition inference');
 const exact=m[apply](days,row('10/11/2032','CCM FICTITIOUS OWNER CC Sol'),owner)[0].legs[0];
 assert.equal(exact.ccmLead,undefined);assert.equal(exact.ccmBonusStatus,undefined,'display names never confirm payroll status');
 const previous=m[apply]([{...days[0],legs:[{...days[0].legs[0],ccmBonusStatus:'confirmed'}]}],rs,owner)[0].legs[0];
 assert.equal(previous.ccmBonusStatus,'confirmed','existing independent evidence preserved');

}
const source=fs.readFileSync('server/platform.mjs','utf8'),ast=ts.createSourceFile('platform.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const functions=['sanitizeRoster','stripSharedCoworkerFields','rosterForPermissions','allowedPermissions'].map(name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast);}).join('\n');
const fields=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='SHARED_COWORKER_FIELDS'));assert(fields);
const scope=vm.createContext({});vm.runInContext(fields.getText(ast)+'\n'+functions,scope);
const privateRoster={year:2032,month:11,rawText:'SYNTHETIC SECRET NAME',days:[{date:'10/11/2032',rawText:'SYNTHETIC SECRET NAME',legs:[{flightNumber:'LA9001',crewAssociation:'matched',crew:[{name:'SYNTHETIC SECRET NAME',role:'CC'}],ccmLead:{name:'SYNTHETIC SECRET NAME'},nested:{CrewList:['SYNTHETIC SECRET NAME']}}]}]};
for(const permissions of [{roster:true},{roster:true,radar:true,hotels:true,presentation:true},{}]){
 const projected=scope.rosterForPermissions(privateRoster,permissions);assert(!JSON.stringify(projected).includes('SYNTHETIC SECRET NAME'),'visitor/share recursive projection strips names and raw source');
}
assert(privateRoster.days[0].legs[0].crew.length,'sharing does not mutate owner roster');
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');assert(home.includes('<FlightCrewDetails leg={event.leg} fallback={event.crew}/>'));assert(!home.includes("event.crew?.slice(0, 4)"));assert(!home.includes("event.crew?.slice(0, 8)"));
const homeAst=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const financialFunctions=['normalizeCrewNameForFinance','currentUserNameTokens','firstCrewListed','userIsFirstCcm'].map(name=>{const n=homeAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(homeAst);}).join('\n');
const financial=vm.createContext({getStoredUser:()=>({name:'FICTITIOUS OWNER'})});vm.runInContext(ts.transpileModule(financialFunctions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,financial);
const displayOnly={crew:['FICTITIOUS OWNER'],leg:{crewAssociation:'matched'}};
assert.equal(financial.userIsFirstCcm(displayOnly,{crewName:'FICTITIOUS OWNER'}),false,'matching names cannot confirm CCM');
assert.equal(financial.userIsFirstCcm({...displayOnly,leg:{crewAssociation:'matched',ccmBonusStatus:'confirmed'}},{}),true,'independent status retained');
for(const file of ['RosterLaunchView.tsx','AimsRosterTable.tsx'])assert(fs.readFileSync('client/src/components/v1391/'+file,'utf8').includes('<FlightCrewDetails leg={event.leg}/>'),'real roster surfaces use selected leg');
console.log('PASS synthetic crew occurrence association, no payroll authority, owner JSON and recursive visitor/share privacy');
}finally{h.cleanup();}
