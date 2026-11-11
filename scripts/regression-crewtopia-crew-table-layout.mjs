import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const row=(y,parts,page=3)=>({page,key:y,text:parts.map(p=>p[1]).join(' '),items:parts.map(([x,str,width=40])=>({x,y,str,width,page}))});
const fixture=()=>[
 row(800,[[35,'Tripulações']]),
 row(760,[[165,"CP Alice Ávila FO D'Ávila"]]),
 row(750,[[165,'CCM FICTITIOUS OWNER CC Last']]),
 row(740,[[35,'10-11-2032',55],[110,'LA9001',32],[165,'Person']]),
 row(700,[[165,'CC']]),row(690,[[35,'11.11.2032',55],[110,'LA9002',32],[165,'Sol']]),
 row(650,[[165,'CP Other Captain FO Other Officer CCM Another Lead CCM Other Lead']]),
 row(640,[[35,'15/11/2032',55],[110,'LA9001',32],[165,'CC Date Mismatch']]),
 row(590,[[35,'Confira na escala publicada pela empresa']]),
 row(580,[[165,'CP Footer Person']])
];
const ambiguousFixture=()=>{const rows=fixture();rows[3].items[0].str='10/11/2032 11/11/2032';rows[3].text=rows[3].items.map(i=>i.str).join(' ');return rows;};
// Fictitious text/dates; two-line paragraphs with a 1.98x inter-paragraph gap.
// Each date/flight anchor is vertically centered between its two crew lines.
const centeredFixture=(gap=22.89859)=>{
 const ys=[600,588.44,588.44-gap,576.88-gap,576.88-2*gap,565.32-2*gap];
 const labels=['CP Fictitious Captain FO Fictitious Officer','CC Sol','CC Single','Person','CCM Fictitious Lead CCM Other','Lead'];
 const rows=[row(800,[[35,'Tripulações']]),...ys.map((y,i)=>row(y,[[175.75,labels[i]]]))];
 for(let i=0;i<3;i++)rows.push(row((ys[i*2]+ys[i*2+1])/2,[[34,`${10+i}/11/2032`,55],[104.88,`LA900${i+1}`,32]]));
 return rows;
};
const days=()=>[{date:'10/11/2032',legs:[{flightNumber:'LA9001',aimsSourceDate:'2032-11-10'}]},{date:'11/11/2032',legs:[{flightNumber:'LA9001'},{flightNumber:'LA9002'}]}];
const h=loadClientModules({files:['client/src/lib/aimsParser.ts','client/src/lib/pdfParser.ts','client/src/lib/crewOccurrenceAssociation.ts'],expose:{aimsParser:['parseTripulationRecords','applyTripulationRecords'],pdfParser:['parseGenericTripulationRecords','applyGenericTripulationRecordsToDays']},prefix:'synthetic-crewtopia-layout-'});
const compiled=path.join(h.dir,'pdfParser.js');fs.writeFileSync(compiled,fs.readFileSync(compiled,'utf8').replace('require("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")','({default:"synthetic-worker-url"})'));
try{
 for(const [module,records,apply] of [['aimsParser','parseTripulationRecords','applyTripulationRecords'],['pdfParser','parseGenericTripulationRecords','applyGenericTripulationRecordsToDays']]){
  const m=h.load(module),parse=rows=>{const text=rows.map(r=>r.text).join('\n');return module==='aimsParser'?m[records](text,'FICTITIOUS OWNER',2032,rows):m[records](text,'FICTITIOUS OWNER',2032,11,rows);};
  const run=(rows,roster=days())=>m[apply](roster,parse(rows),'FICTITIOUS OWNER');
  const source=fixture(),before=JSON.stringify(source),parsed=parse(source),out=run(source);
  const centered=parse(centeredFixture());assert.equal(centered.length,3);
  assert.deepEqual(centered.map(r=>r.crew.length),[3,1,2],module+' separates visibly distinct centered paragraphs below twice line spacing');
  assert(centered.every(r=>!r.sourceAmbiguous),'one centered anchor per separate paragraph is supported');
  assert.equal(centered[1].crew[0].name,'Single Person');assert.equal(centered[2].leadCcm,null);
  assert(parse(centeredFixture(11.56*1.49)).every(r=>r.sourceAmbiguous),'near-uniform paragraph spacing remains uncertain');
  const centeredDuplicate=centeredFixture();centeredDuplicate.push(row(598,[[34,'10/11/2032',55],[104.88,'LA9001',32]]));
  assert(parse(centeredDuplicate).every(r=>r.sourceAmbiguous),'a second centered anchor cannot be resolved by proximity');
  assert.equal(parsed.length,3,module+' reads three independently anchored rows');
  assert.equal(out[0].legs[0].crew.length,4);assert.equal(out[0].legs[0].crew[3].name,'Last Person','wrapped continuation remains in its own paragraph');
  assert.equal(out[1].legs[1].crew[0].name,'Sol','one-word name retained');assert(!out[1].legs[0].crew,'wrong date never spreads by number');
  assert.equal(out[0].legs[0].ccmLead,undefined);assert.equal(out[0].legs[0].ccmBonusStatus,undefined,'display does not confirm chief entitlement');
  assert(!JSON.stringify(parsed).includes('Footer Person'));assert.equal(JSON.stringify(source),before,'input is immutable');
  const multiple=parse(source)[2];assert.equal(multiple.crew.filter(c=>c.role==='CCM').length,2,'multiple CCM remain names, not an inferred leader');assert.equal(multiple.leadCcm,null);
  const mixed=[...fixture(),row(800,[[35,'Tripulações']],4),row(760,[[35,'10/11/2032',55],[110,'LA9003',32],[165,'CC Mixed Person']],4)];
  const mixedDays=days();mixedDays[0].legs.push({flightNumber:'LA9003'});assert.equal(run(mixed,mixedDays)[0].legs[1].crew?.[0].name,'Mixed Person','date-first page survives a leading page');
  const mixedAmbiguous=[...ambiguousFixture(),...mixed.filter(r=>r.page===4)];assert.equal(run(mixedAmbiguous,mixedDays)[0].legs[1].crew?.[0].name,'Mixed Person','held leading page cannot suppress a separate unambiguous page');
  const noHeading=mixed.filter(r=>!(r.page===4&&r.key===800));assert.equal(run(noHeading,mixedDays)[0].legs[1].crew?.[0].name,'Mixed Person','supported date-first row without heading remains available on its own page');
  const conflict=[...fixture(),row(800,[[35,'Tripulações']],4),row(760,[[35,'10/11/2032',55],[110,'LA9001',32],[165,'CC Conflicting Person']],4)];assert(!run(conflict)[0].legs[0].crew,'conflicting source on another page must not be hidden by visual precedence');assert.equal(run(conflict)[0].legs[0].crewAssociation,'ambiguous');
  const continuation=[...fixture(),row(100,[[35,'11/11/2032 LA9003 CP Second Captain']],4),row(780,[[35,'FO Second Officer']],5)];
  const continued=parse(continuation).find(r=>r.flightNumber==='LA9003');
  assert.deepEqual(continued?.crew.map(c=>c.role),['CP','FO'],module+' retains date-first continuation across consecutive unhandled pages');
  const continueDays=days();continueDays[1].legs.push({flightNumber:'LA9003'});
  assert.equal(run(continuation,continueDays)[1].legs[2].crew?.length,2,'matched occurrence includes continuation members');
  const separated=[...fixture().map(r=>({...r,page:5,items:r.items.map(i=>({...i,page:5}))})),row(100,[[35,'11/11/2032 LA9003 CP Second Captain']],4),row(780,[[35,'FO Must Not Attach']],6)];
  assert.equal(parse(separated).find(r=>r.flightNumber==='LA9003')?.crew.length,1,'handled page is a hard text boundary');
  const gap=[...fixture(),row(100,[[35,'11/11/2032 LA9003 CP Second Captain']],4),row(780,[[35,'FO Must Not Attach']],6)];
  assert.equal(parse(gap).find(r=>r.flightNumber==='LA9003')?.crew.length,1,'missing physical page is a hard text boundary');
  const oldDisplay=days();oldDisplay[0].legs[0].crew=[{role:'CC',name:'Old Unverified Person',order:0}];assert(!run(ambiguousFixture(),oldDisplay)[0].legs[0].crew,'uncertain new source cannot retain unverified old display names');
  const duplicate=days();duplicate[0].legs.push({...duplicate[0].legs[0]});assert(run(source,duplicate)[0].legs.every(l=>!l.crew),'duplicate occurrence stays ambiguous');
  const invalid=fixture();invalid[3].items[0].str='31/11/2032';invalid[3].text=invalid[3].items.map(i=>i.str).join(' ');assert(!run(invalid)[0].legs[0].crew);
  const ambiguous=fixture();ambiguous[3].items[0].str='10/11/2032 11/11/2032';ambiguous[3].text=ambiguous[3].items.map(i=>i.str).join(' ');assert(!run(ambiguous)[0].legs[0].crew);assert.equal(run(ambiguous)[0].legs[0].crewAssociation,'ambiguous','two date candidates never pick the last one');
  const twoAnchors=fixture();twoAnchors.push(row(745,[[35,'11/11/2032',55],[110,'LA9002',32]]));assert(!run(twoAnchors)[0].legs[0].crew,'two anchors in one crew paragraph withheld');
  const noGap=fixture().map((r,i)=>row(800-i*10,r.items.map(x=>[x.x,x.str,x.width])));assert(!run(noGap)[0].legs[0].crew,'no independently separated rows means no guess');
  const movedPage=fixture();movedPage[3]={...movedPage[3],page:4,items:movedPage[3].items.map(i=>({...i,page:4}))};assert(!run(movedPage)[0].legs[0].crew,'no cross-page nearest-anchor assignment');
  const rotated=fixture().map(r=>({...r,items:r.items.map((i,n)=>({...i,y:i.y+n*20}))}));assert(!run(rotated)[0].legs[0].crew,'unsupported geometry fails closed');
  const independent=days();independent[0].legs[0].ccmBonusStatus='confirmed';assert.equal(run(source,independent)[0].legs[0].ccmBonusStatus,'confirmed','separate preexisting evidence survives');
  const legacy=module==='aimsParser'?m[records]('Tripulações\n10/11/2032 LA9001 CC Sol','FICTITIOUS OWNER',2032):m[records]('Tripulações\n10/11/2032 LA9001 CC Sol','FICTITIOUS OWNER',2032,11);assert.equal(m[apply](days(),legacy,'FICTITIOUS OWNER')[0].legs[0].crew[0].name,'Sol','date-first contract unchanged');
 }
 console.log('PASS synthetic CrewTopia spatial table: leading/wrapped names, anchors, ambiguity, pages, source dates, no chief authority and immutable input');
}finally{h.cleanup();}
