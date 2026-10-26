import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const harness = loadClientModules({ files: ['client/src/lib/rosterPresentation.ts'] });
const { rosterProgramMode: mode, rosterCardPresentation: card, rosterOccurrenceCounts: count, filterRosterEvents: filter, rosterSourceSignature: signature } = harness.load('rosterPresentation');
const make = (id, type, extras = {}) => ({id,kind:'duty',origin:'BSB',destination:'BSB',day:{date:'2032-10-19',type,pairingCode:type},canonical:{id,date:'2032-10-19',kind:'duty',publishedDay:{type,date:'2032-10-19'}},...extras});
const base = make('base','DESCANSO_BASE_CONTINUIDADE',{kind:'stay',presentation:'12:30',departure:'12:30',arrival:'04:10',canonical:{id:'base',kind:'stay',date:'2032-10-19',publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE'},startDateTime:'2032-10-19T15:30:00Z',endDateTime:'2032-10-20T07:10:00Z'}});
const night = make('night','PERNOITE_CONTINUIDADE',{kind:'stay',origin:'CGH',destination:'CGH',presentation:'12:30',departure:'13:00',arrival:'05:20(+1)',canonical:{id:'night',kind:'stay',date:'2032-10-19',publishedDay:{type:'PERNOITE_CONTINUIDADE'},startDateTime:'2032-10-19T16:00:00Z',endDateTime:'2032-10-20T08:20:00Z'}});
const off = make('off','DO',{kind:'rest',departure:'00:00',arrival:'23:59',presentation:'00:00'});
const flight = make('flight','FLIGHT',{kind:'flight',flightNumber:'QA0001',origin:'AAA',destination:'BBB',leg:{workType:'OP'},departure:'10:00',arrival:'11:00',presentation:'09:00'});
const extra = {...flight,id:'extra',canonical:{...flight.canonical,id:'extra'},leg:{workType:'PS'}};
const reserve = make('reserve','ASB',{title:'PS EXTRA DESCANSO',presentation:'06:30',departure:'06:30',arrival:'12:30'});
const standby=make('standby','HSB'), training=make('training','CRM'), unknown=make('unknown','UNKNOWN');
const journey=make('journey','OTHER',{kind:'duty',canonical:{id:'journey',kind:'journey-rest',date:'2032-10-19',startDateTime:'2032-10-19T15:30:00Z',endDateTime:'2032-10-20T07:10:00Z'}});
const source=[base,night,off,flight,extra,reserve,standby,training,unknown,journey];
const deepFreeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);Object.values(x).forEach(deepFreeze)}return x};deepFreeze(source);const before=signature(source);
try {
 assert.deepEqual(source.map(mode),['journey-rest','stay','rest','operating','extra','reserve','standby','training','duty','journey-rest']);
 assert.equal(mode({...flight,title:'PS EXTRA',leg:{workType:'OP'}}),'operating','formal workType beats residue');
 assert.equal(mode(make('care','ASB',{title:'Descanso',day:{type:'ASB',pairingCode:'VC'}})),'reserve','operational code beats residual care');
 for(const [type,title] of [['DMO','Luto'],['VC','Férias'],['DO','Folga']]) { assert.equal(card(make(type,type)).title,title);assert.equal(mode(make(type,type)),'rest'); }
 assert.equal(card(base).title,'Descanso na base');assert.equal(card(base).presentation,'');assert.equal(card(base).context,'BSB');assert.equal(card(base).endDate,'dia seguinte');assert.equal(card(base).hotel,'');
 assert.equal(card(night).presentation,'');assert.equal(card(night).end,'05:20(+1)');assert.equal(card(night).endDate,'dia seguinte');
 const conflict = card({...night,arrival:'05:20(+2)'});assert.equal(conflict.end,'05:20(+2)');assert.equal(conflict.endDate,'');assert.equal(conflict.datesUnconfirmed,true,'explicit source suffix cannot contradict a proven next-day annotation');
 const twoDays = card({...night,arrival:'05:20(+2)',canonical:{...night.canonical,endDateTime:'2032-10-21T08:20:00Z'}});assert.equal(twoDays.endDate,'21 de outubro de 2032');assert.equal(twoDays.datesUnconfirmed,false);
 assert.equal(card({...night,arrival:'05:20(+1)',canonical:{...night.canonical,endDateTime:'unknown'}}).datesUnconfirmed,true,'source rollover without boundary dates remains unconfirmed');
 assert.equal(mode(make('hotel','HOTEL',{kind:'stay',hotel:'Hotel sintético',canonical:{id:'hotel',kind:'stay',publishedDay:{type:'HOTEL'}}})),'stay','explicit hotel at base is overnight');
 assert.equal(card(make('rest','REST',{kind:'stay'})).title,'Descanso','generic rest never claims base');
 assert.equal(card(off).start,'—');assert.equal(card(off).end,'—');assert.equal(card(off).presentation,'');
 const publishedMidnight=make('published-midnight','REST',{day:{type:'REST',dutyReport:'00:00',dutyDebrief:'23:59',dutyReportSource:'published',dutyDebriefSource:'published'}});assert.equal(card(publishedMidnight).start,'00:00');assert.equal(card(publishedMidnight).end,'23:59','proven published endpoints survive');
 const trueContinuityEndpoint={...publishedMidnight,day:{type:'DESCANSO_BASE_CONTINUIDADE',pairingCode:'DESCANSO BASE ENTRE JORNADAS',continuityInferred:true,continuityAtBase:true,dutyReport:'00:00',dutyDebrief:'23:59'},canonical:{kind:'rest',publishedDay:{type:'DESCANSO_BASE_CONTINUIDADE'}}};assert.equal(card(trueContinuityEndpoint).start,'00:00');assert.equal(card(trueContinuityEndpoint).end,'23:59','only proven generated split edges are masked, not every midnight');
 assert.equal(card(reserve).presentation,'','no redundant APZ equal to start');assert.equal(card(flight).presentation,'09:00');
 for(const [start,apz,expected] of [['06:30(+1)','06:30','06:30'],['06:30','06:30(+0)','06:30(+0)'],['06:30(+0)','06:30','06:30'],['06:30(+1)','06:30(+0)','06:30(+0)'],['06:30(+1)','06:30(+1)',''],['06:30','6:30',''],['a confirmar','06:30','06:30']]) assert.equal(card({...flight,departure:start,presentation:apz}).presentation,expected,`APZ ${apz} versus start ${start}: only equivalent full source clocks are redundant`);
 assert.equal(card(journey).start,'—','unproved fallback interval hidden');assert.equal(card({...journey,canonical:{...journey.canonical,restMinutes:940}}).end,'04:10');
 assert.equal(card({...base,canonical:{...base.canonical,startDateTime:'2032-10-19T23:30:00Z',endDateTime:'2032-10-20T01:00:00Z'},departure:'20:30',arrival:'22:00'}).endDate,'','UTC midnight is not BRT midnight');
 assert.equal(card({...base,canonical:{...base.canonical,endDateTime:'2032-10-20T08:00:00Z'}}).endDate,'','mismatched instant cannot date a source clock');
 assert.equal(card({...base,canonical:{...base.canonical,startDateTime:'unknown',endDateTime:'unknown',isNextDay:true}}).datesUnconfirmed,true);
 assert.equal(card({...base,canonical:{...base.canonical,date:'2032-12-31',endDateTime:'2033-01-01T07:10:00Z'}},'2032-12-31').endDate,'dia seguinte');
 assert.equal(card({...base,canonical:{...base.canonical,endDateTime:'2032-10-22T07:10:00Z'}}).endDate,'22 de outubro de 2032');
 const c=count(source);assert.equal(c.total,10);assert.equal(c.counts['journey-rest'],2);assert.equal(c.counts.extra,1);
 assert.equal(count([...source,{...base}]).total,10,'identical proven canonical occurrence counts once');
 assert.equal(count([...source,{...base,canonical:{...base.canonical,endDateTime:'2032-10-21T07:10:00Z'}}]).total,11,'same-ID conflicting occurrence survives');
 assert.equal(count([{id:'dup',kind:'flight'},{id:'dup',kind:'flight'}]).total,2,'unproven identity never deduplicated');
 for(const selected of ['all','extra','journey-rest','stay','rest','duty']) { const view=filter(source,selected);assert.equal(view.length,selected==='all'?10:c.counts[selected]);assert.deepEqual(count(source),c,'counts remain unfiltered'); }
 assert.equal(signature(source),before,'source immutable');assert.equal(signature(JSON.parse(JSON.stringify(source))),before,'rebuilt semantic arrays stable');
 const reordered=source.map(e=>Object.fromEntries(Object.entries(e).reverse()));assert.equal(signature(reordered),before,'object key insertion order irrelevant');
 const changed=JSON.parse(JSON.stringify(source));changed[0].arrival='05:00';assert.notEqual(signature(changed),before,'same-array semantic edit detected');
 console.log('PASS roster legend classification/count/source/date contracts; TZ='+process.env.TZ);
} finally { harness.cleanup(); }
