import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(path.join(tmpdir(),'finance-known-dates-'));
try {
 const modules=['payrollPaymentComposition','nextFinancialPayment','monthlySalaryInputs','financialLocalUpcoming','airports'];
 const entry=path.join(dir,'entry.ts');writeFileSync(entry,modules.map(name=>`export * from ${JSON.stringify(path.resolve('client/src/lib/'+name+'.ts'))};`).join('\n'));
 await build({configFile:false,logLevel:'silent',plugins:[{name:'baseline-control',enforce:'pre',transform(code,id){if(!process.env.FINANCIAL_BASELINE_DIR)return;const relative=path.relative(process.cwd(),id),old=path.join(process.env.FINANCIAL_BASELINE_DIR,relative);if(existsSync(old))return readFileSync(old,'utf8');}}],build:{lib:{entry,formats:['es'],fileName:()=> 'subject.mjs'},outDir:dir,emptyOutDir:false,minify:false}});
 const {composePayrollPayment,composeOperationalPayrollEstimate,nextAllowancePayment,observedBrlPaymentDate,applyMonthlySalaryInputs,localUpcomingAllowance,airportCity,reviewedAirportGeography}=await import(pathToFileURL(path.join(dir,'subject.mjs')));
 const month='2026-10',days=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const flight={iso:days[0],flight:'SYN1',route:'BSB → GRU',total:120,timeKnown:true,distanceKnown:true,source:'Synthetic published'};
 const salary={configured:true,config:{baseConfigured:true,fixedAdditionsConfigured:true,basePay:2900,fixedAdditions:100,requiresManualFunction:false,source:'Synthetic tariffs'},production:120,reserve:NaN,standby:12,chief:0,instructorPay:0,rows:[flight],reserveAssessment:{knownCount:1,knownAmount:50,pendingCount:1},standbyAssessment:{knownCount:1,knownAmount:12,pendingCount:0}};
 const partial=composeOperationalPayrollEstimate({month,salary,publishedDays:[days[0]]});
 assert.equal(partial.lines.find(x=>x.label==='Sobreaviso').value,12,'known activity must survive unrelated missing days');
 assert.equal(partial.lines.find(x=>x.label==='Reserva').value,50);assert.deepEqual(partial.calculationTotals,{BRL:3182});assert.equal(partial.totals,null);
 const cycle={operationalVariableMonth:month,fixedMonth:'2026-11',expectedCreditMonth:'2026-12'};
 const reviewed=composePayrollPayment(cycle,[{month,salary:{...salary,rows:[flight,{...flight,flight:'SYN2',timeKnown:false,total:NaN}]},publishedDays:days},{month:'2026-11',salary,publishedDays:[]}]);
 assert.equal(reviewed.lines.find(x=>x.label==='Reserva').value,50,'reviewed credit cycle preserves known activity subtotal');
 assert.equal(reviewed.lines.find(x=>x.label==='Sobreaviso').value,12,'unrelated flight pending never hides proven standby');
 for(const missing of [false,true]){const s={...salary,reserve:0,reserveAssessment:{knownCount:0,knownAmount:0,pendingCount:0}};const x=composeOperationalPayrollEstimate({month,salary:s,publishedDays:missing?[]:days});assert.equal(x.lines.find(x=>x.label==='Reserva').value,missing?null:0,'zero requires full published coverage');}
 assert.equal(composeOperationalPayrollEstimate({month,salary:{...salary,config:{...salary.config,requiresManualFunction:true}},publishedDays:days}).calculationTotals.BRL,3000);
 assert.equal(observedBrlPaymentDate('2026-10-22'),'2026-10-22');assert.equal(observedBrlPaymentDate('2026-07-09'),'2026-07-08');assert.equal(observedBrlPaymentDate('2026-06-04'),'2026-06-03');assert.equal(observedBrlPaymentDate('2026-12-31'),'2026-12-30');assert.equal(observedBrlPaymentDate('2027-01-07'),null);assert.equal(observedBrlPaymentDate('2026-10-21'),null);
 const week=['2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18','2026-10-19','2026-10-20'];
 const rows=week.map(iso=>({iso,label:'Synthetic meal',currency:'BRL',value:10,convertedBRL:10,source:'Synthetic'}));
 const now=new Date('2026-10-18T15:00:00Z');
 const payment=nextAllowancePayment([...rows,{...rows[0],iso:week[6],currency:'USD',value:30,convertedBRL:null,expectedPaymentDate:week[6],expectedPaymentTimezone:'America/Sao_Paulo'}],[{iso:week[0],airport:'ZZZ',reason:'Synthetic unknown taxi'}],['2026-10'],now,week);
 assert.deepEqual(payment.calculationTotals,{BRL:70,USD:30});assert.equal(payment.totals,null);assert.equal(payment.expectedPaymentDates.BRL,'2026-10-22');assert.match(payment.currencyTiming.USD,/20\/10\/2026/);
 // A partial hero week must not turn the next complete weekly group partial.
 const secondWeek=Array.from({length:7},(_,i)=>'2026-10-'+(21+i));
 const separated=nextAllowancePayment([...rows,...secondWeek.map(iso=>({...rows[0],iso}))],[{iso:week[0],airport:'ZZZ'}],['2026-10'],now,[...week,...secondWeek]);
 const separatePreview=localUpcomingAllowance(separated,now);
 assert.equal(separatePreview.state,'incomplete');
 assert.deepEqual(separatePreview.events.map(e=>[e.expectedPaymentDate,e.amountMinor,e.partial]),[['2026-10-22',7000,true],['2026-10-29',7000,false]],'partiality belongs to one weekly date/currency group');
 const local=localUpcomingAllowance(payment,now);assert.equal(local.state,'incomplete');assert.deepEqual(local.events.map(e=>[e.expectedPaymentDate,e.currency,e.amountMinor]),[['2026-10-20','USD',3000],['2026-10-22','BRL',7000]]);assert.deepEqual(local.events.map(x=>x.partial),[false,true],'foreign date without its own issue stays complete despite partial BRL week');
 assert.equal(localUpcomingAllowance({...payment,kind:'payroll'},now),null,'never turn salary month into an exact date');
 assert.equal(localUpcomingAllowance({...payment,lines:[],upcomingLines:[]},now).events.length,0,'empty is never zero');
 assert.equal(localUpcomingAllowance({...payment,upcomingLines:undefined,expectedPaymentDates:{BRL:'2026-10-17'},lines:rows},now).events.length,0,'exclude past dates');
 assert.equal(localUpcomingAllowance({...payment,upcomingLines:undefined,expectedPaymentDates:{BRL:'2026-11-17'},lines:rows},now).events.length,0,'exclude beyond30days');
 const futureRow={...rows[0],iso:'2026-10-21',currency:'USD',value:30,convertedBRL:null,expectedPaymentDate:'2026-10-21',expectedPaymentTimezone:'America/Sao_Paulo'};
 const beyondWeek=nextAllowancePayment([futureRow,{...rows[0],iso:'2026-10-21',value:7}],[],['2026-10'],now,['2026-10-21']);
 assert.equal(beyondWeek.lines.length,0,'do not inflate the weekly hero with another cycle');
 assert.deepEqual(localUpcomingAllowance(beyondWeek,now).events.map(x=>[x.expectedPaymentDate,x.currency,x.amountMinor]),[['2026-10-21','USD',3000],['2026-10-29','BRL',700]],'Concierge must retain future rows outside the current BRL work week');
 const fourFlights=Array.from({length:4},(_,index)=>({...futureRow,iso:'2026-10-'+(21+index),expectedPaymentDate:'2026-10-'+(21+index)}));const compact=localUpcomingAllowance(nextAllowancePayment(fourFlights,[],['2026-10'],now,[]),now);assert.equal(compact.events.length,3);assert.equal(compact.hasMore,true);assert.deepEqual(compact.events.map(x=>x.expectedPaymentDate),['2026-10-21','2026-10-22','2026-10-23']);
 const futureUnknownCalendar=nextAllowancePayment([{...rows[0],iso:'2026-12-31'}],[],['2026-12'],new Date('2026-12-27T15:00:00Z'),['2026-12-31']);assert.equal(localUpcomingAllowance(futureUnknownCalendar,new Date('2026-12-27T15:00:00Z')).events.length,0,'unknown2027 cycle never borrows the hero date');
 const noLink=localUpcomingAllowance({...payment,upcomingLines:undefined,lines:[{...rows[0],currency:'USD',value:30}]},now);assert.equal(noLink.events.length,0,'foreign meal date alone is not a flight link');
 const partialOrder=localUpcomingAllowance({...payment,calculationPartial:false,upcomingLines:[{...rows[0],value:1,expectedPaymentDate:'2026-10-22',expectedPaymentTimezone:'America/Sao_Paulo',partial:true},{...rows[0],value:2,expectedPaymentDate:'2026-10-22',expectedPaymentTimezone:'America/Sao_Paulo',partial:false}]},now);assert.equal(partialOrder.state,'incomplete');assert.equal(partialOrder.events[0].partial,true);assert.equal(partialOrder.events[0].amountMinor,300);
 // Group identity is date AND currency, independent of input order. Invalid
 // amounts/timing taint only their own group, including when encountered first.
 const line=(date,currency,value,extra={})=>({...rows[0],currency,value,expectedPaymentDate:date,expectedPaymentTimezone:'America/Sao_Paulo',...extra});
 const project=lines=>localUpcomingAllowance({...payment,calculationPartial:true,upcomingLines:lines},now);
 const mixed=[line('2026-10-22','BRL',1,{partial:true}),line('2026-10-22','USD',2),line('2026-10-23','BRL',3)];
 for(const lines of [mixed,[...mixed].reverse()])assert.deepEqual(project(lines).events.map(e=>[e.expectedPaymentDate,e.currency,e.amountMinor,e.partial]),[['2026-10-22','BRL',100,true],['2026-10-22','USD',200,false],['2026-10-23','BRL',300,false]]);
 for(const bad of [line('2026-10-22','BRL',null),line('2026-10-22','USD',1,{expectedPaymentTimezone:'UTC'})])for(const lines of [[bad,line('2026-10-22',bad.currency,2),line('2026-10-23','BRL',3)],[line('2026-10-23','BRL',3),line('2026-10-22',bad.currency,2),bad]]) {
   const preview=project(lines);assert.equal(preview.state,'incomplete');assert.equal(preview.events[0].partial,true);assert.equal(preview.events[0].amountMinor,200);assert.equal(preview.events[1].partial,false);
 }
 assert.equal(project([line('2026-10-22','USD',2)]).events[0].partial,false,'global state remains incomplete without fabricating group partiality');
 const foreignOwnIssue=nextAllowancePayment([futureRow,{...futureRow,iso:'2026-10-22',expectedPaymentDate:'2026-10-22'}],[{iso:futureRow.iso,airport:'ZZZ'}],['2026-10'],now,days);
 assert.deepEqual(localUpcomingAllowance(foreignOwnIssue,now).events.map(e=>e.partial),[true,false],'foreign pending source day affects only its group');
 const legacy={basePay:99,baseConfigured:false,fixedAdditions:99,fixedAdditionsConfigured:false,inssDeduction:99,irrfDeduction:99,otherDeductions:99,configured:true,source:'Synthetic'};
 const v=(amountMinor,kind='earning')=>({amountMinor,currency:'BRL',kind,source:'manual',sourceId:'synthetic',recurrence:'once'});
 const record={schema:1,ownerId:'synthetic',month,revision:1,closed:false,values:{fixed_with_co:v(340000),other_fixed:v(1000),inss:v(10000,'deduction'),irrf:v(0,'deduction'),other_deductions:v(2000,'deduction')}};
 const configured=applyMonthlySalaryInputs(legacy,month,record);assert.equal(configured.basePay,3400);assert.equal(configured.fixedAdditions,10);assert.equal(configured.baseLabel,'Fixos da competência (inclui CO)');assert.equal(configured.inssDeduction,100);assert.equal(configured.irrfDeduction,0);assert.equal(configured.otherDeductions,20);
 assert.equal(applyMonthlySalaryInputs(legacy,'2026-11',record),legacy,'never carry personal figures into another month');
 assert.equal(applyMonthlySalaryInputs(legacy,'invalid',{...record,month:'invalid'}),legacy,'invalid month never adopts current personal values');
 const unknownFixed=applyMonthlySalaryInputs(legacy,month,{...record,values:{other_fixed:v(null)}});assert.equal(unknownFixed.fixedAdditionsConfigured,false);assert(Number.isNaN(unknownFixed.fixedAdditions),'null additional must remain invalid to aggregate salary');
 const unknown=applyMonthlySalaryInputs(legacy,month,{...record,values:{fixed_with_co:v(null),inss:v(null,'deduction')}});assert.equal(unknown.baseConfigured,false);assert.equal(Number.isNaN(unknown.inssDeduction),true,'explicit unknown cannot revive legacy zero/value');
 for(const [iata,icao,city] of [['OPS','SBSI','Sinop'],['CPV','SBKG','Campina Grande']]){assert.equal(airportCity(' '+iata.toLowerCase()+' '),city);assert.equal(airportCity(icao),city);assert.equal(reviewedAirportGeography[iata].icao,icao);assert(reviewedAirportGeography[iata].lat<0&&reviewedAirportGeography[iata].lon<0);}
 // Production source still does not turn the new geographic references into salary KM.
 const home=readFileSync('client/src/pages/Home.tsx','utf8');assert.match(home,/function flightDistanceKmFromEvent[\s\S]*?if \(!from \|\| !to\) return 0;/);assert(!home.includes('reviewedAirportGeography'));
 console.log('PASS known financial values/dates: independent salary activities, monthly personal inputs, BRL SP calendar, linked foreign days, future30day original-currency projection, OPS/CPV decode without invented remuneration KM.');
}finally{rmSync(dir,{recursive:true,force:true});}
