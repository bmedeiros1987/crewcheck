import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const outDir=mkdtempSync(path.join(tmpdir(),'next-payment-'));
try{
 await build({configFile:false,logLevel:'silent',build:{lib:{entry:{subject:path.resolve('client/src/lib/nextFinancialPayment.ts'),parser:path.resolve('client/src/lib/aimsParser.ts'),coverage:path.resolve('client/src/lib/aimsFlightSourceCoverage.ts')},formats:['es'],fileName:(_format,name)=>name+'.mjs'},outDir,minify:false}});
 const {nextAllowancePayment,nextPayrollPayment,observedBrlPaymentDate}=await import(pathToFileURL(path.join(outDir,'subject.mjs')));
 const {parseAimsRoster}=await import(pathToFileURL(path.join(outDir,'parser.mjs')));
 const {aimsFlightSourceCoveragePending,aimsSourceChecksum,AIMS_REDACTED_REST_ONLY}=await import(pathToFileURL(path.join(outDir,'coverage.mjs')));
 const days=['2032-01-28','2032-01-29','2032-01-30','2032-01-31','2032-02-01','2032-02-02','2032-02-03'];
 const rows=days.map(iso=>({iso,label:'Synthetic meal',currency:'BRL',value:10,convertedBRL:10,source:'Synthetic'}));
 const now=new Date('2032-02-05T15:00:00Z');
 const payment=nextAllowancePayment([...rows,{...rows[0],iso:'2032-02-20',value:99999}],[],['2032-01','2032-02'],now,days);
 assert.deepEqual(payment.totals,{BRL:70});assert.equal(payment.range.start,'2032-01-28');assert.equal(payment.range.end,'2032-02-03');assert.equal(payment.lines.length,7);
 assert.equal(nextAllowancePayment(rows,[],['2032-02'],now,days).totals,null,'cross-month coverage required');
 assert.equal(nextAllowancePayment(rows,[],['2032-01','2032-02'],now,days.slice(1)).totals,null,'missing published days cannot become zero');
 assert.equal(nextAllowancePayment(rows,[{iso:'',airport:'ZZZ'}],['2032-01','2032-02'],now,days).totals,null);
 assert.equal(nextAllowancePayment([],[],['2032-01','2032-02'],now,days).totals,null);
 assert.equal(nextAllowancePayment([...rows,{...rows[0],iso:'2032-01-32'}],[],['2032-01','2032-02'],now,days).totals,null,'invalid calendar dates cannot enter a cycle total');

 // All entries here are invented. The nominal cycle spans two sources and can
 // receive carry-in from the Tuesday before it.
 const published=(month, overrides={},visual=false, visualOverrides=overrides)=>{
  const dateRows=values=>Array.from({length:month===1?31:29},(_,index)=>{
   const day=index+1;
   const activity=day>=6&&day<=10
    ? '08:00 LA 4101 09:00 BSB GRU 10:30 (320) LA 4102 11:30 GRU BSB 13:00 (320) 13:30'
    : 'VC';
   return String(day).padStart(2,'0')+(month===1?'Jan':'Feb')+' '+(values[day]??activity);
  });
  const dates=dateRows(overrides);
  const text=['Escala de Tripulante Convertida para padrão AIMS',
   'Tripulante: SYNTHETIC CREW -BP:00000000 -Base: BSB -01/0'+month+'/2032 até'+dates.length+'/0'+month+'/2032',...dates].join('\n');
  const columns=visual?dateRows(visualOverrides).flatMap((date,index)=>date.split(/\s+/).map((str,row)=>({
   page:1,key:row,text:str,items:[{str,x:100+index*100,y:800-row*15,page:1}],
  }))):undefined;
  return parseAimsRoster(text,columns);
 };
 const months=['2032-01','2032-02'], sources=[published(1,{27:'DO'}),published(2)];
 const covered=['2032-01-27',...days];
 const zero=nextAllowancePayment([],[],months,now,covered,sources);
 assert.deepEqual(zero.totals,{BRL:0},'published rest for the entire cycle and carry-in date proves zero');
 assert.equal(zero.noEligibleAllowance,true);
 assert.equal(zero.calculationPartial,false);
 assert.deepEqual(zero.issues,[]);
 assert.deepEqual(zero.lines,[]);
 assert.deepEqual(zero.upcomingLines,[]);
 assert.deepEqual(zero.expectedPaymentDates,{},'no credit invented for a zero cycle');

 const visualSources=[published(1,{27:'DO'},true),published(2,{},true)];
 assert(visualSources.every(roster=>roster.aimsFlightSourceCoverage?.authority==='aims_visual'));
 assert.deepEqual(nextAllowancePayment([],[],months,now,covered,visualSources).totals,{BRL:0});
 const redact=roster=>({...roster,rawText:'',days:roster.days.map(day=>({...day,rawText:''}))});
 const issuesFor=roster=>aimsFlightSourceCoveragePending(roster,roster.days.flatMap(day=>day.legs.map(leg=>({kind:'flight',day,leg}))));
 const fromHistory=visualSources.map(redact);
 const savedIssues=fromHistory.flatMap(issuesFor);
 assert(savedIssues.length>0&&savedIssues.every(item=>item.sourceIssueId===AIMS_REDACTED_REST_ONLY),
  'redaction retains rest evidence and the usual source warning');
 assert.deepEqual(nextAllowancePayment([],savedIssues,months,now,covered,fromHistory).totals,{BRL:0});
 const uncertainPositive=nextAllowancePayment([rows[0]],savedIssues,months,now,covered,fromHistory);
 assert.equal(uncertainPositive.totals,null,'the redacted rest proof never certifies an eligible amount');
 assert.deepEqual(uncertainPositive.calculationTotals,{BRL:10});

 // The visual reader can legitimately win the itinerary merge without
 // establishing that a disputed date was exclusively a rest day.
 const disputedDay='2032-02-03';
 const disputedSources=[
  {text:'09:40 LA 4999 09:39 BSB VC', hasFlight:true},
  {text:'ABC 14:00 BSB 17:00 VC', hasFlight:false},
 ];
 for(const {text,hasFlight} of disputedSources){
  const textOnly=published(2,{3:text});
  assert.equal(textOnly.aimsFlightSourceCoverage.sourceRestDates.includes(disputedDay),false);
  assert.equal(textOnly.aimsFlightSourceCoverage.occurrences.some(item=>item.sourceDate===disputedDay),hasFlight);
  const merged=published(2,{3:text},true,{3:'VC'});
  assert.equal(merged.aimsFlightSourceCoverage.authority,'aims_visual');
  assert.deepEqual(merged.days.filter(day=>day.date==='03/02/2032').map(day=>[day.pairingCode,day.legs.length]),[['VC',0]]);
  assert.deepEqual(merged.aimsFlightSourceCoverage.occurrences,visualSources[1].aimsFlightSourceCoverage.occurrences,
   'a disputed rest date does not change itinerary/source priority');
  assert.deepEqual(issuesFor(merged),[],'no new general flight coverage warning');
  for(const saved of [merged,redact(merged)]){
   const result=nextAllowancePayment([],issuesFor(saved),months,now,covered,[visualSources[0],saved]);
   assert.equal(result.totals,null,'the secondary reading disputes exclusive rest on a covered date');
   assert.equal(result.noEligibleAllowance,undefined);
   assert.equal(result.calculationPartial,true);
  }
 }
 const outsideCycle=published(2,{22:'ABC 14:00 BSB 17:00 VC'},true,{22:'VC'});
 assert.deepEqual(nextAllowancePayment([],issuesFor(outsideCycle),months,now,covered,[visualSources[0],outsideCycle]).totals,{BRL:0},
  'a dated ambiguity outside the evidence window does not erase an independently covered cycle');
 const emptyTextBlock=published(2,{3:''},true,{3:'VC'});
 assert.deepEqual(nextAllowancePayment([],issuesFor(emptyTextBlock),months,now,covered,[visualSources[0],emptyTextBlock]).totals,{BRL:0},
  'a date marker with no secondary activity does not dispute the visual rest cell');
 const unscopedText=published(2,{22:'VC\n00Feb LA 4999 09:39 BSB'},true,{22:'VC'});
 assert.deepEqual(issuesFor(unscopedText),[],'visual priority still governs the itinerary');
 assert.equal(nextAllowancePayment([],[],months,now,covered,[visualSources[0],unscopedText]).totals,null,
  'secondary evidence without a valid date cannot prove exclusive rest');

 const previousProof=structuredClone(visualSources[1]);
 const evidence=previousProof.aimsFlightSourceCoverage;
 delete evidence.restProofVersion;
 const previousDigest=raw=>aimsSourceChecksum(JSON.stringify([raw,evidence.authority,evidence.authorityPeriod,
  evidence.unresolvedSourceDates,evidence.sourceDates,evidence.occurrences,evidence.publishedFlights,evidence.sourceRestDates]));
 evidence.sourceChecksum=previousDigest(previousProof.rawText);
 evidence.redactedRestChecksum=aimsSourceChecksum(JSON.stringify([evidence.sourceChecksum,previousDigest('')]));
 assert.deepEqual(issuesFor(previousProof),[],'an older proof still passes ordinary source coverage');
 for(const roster of [previousProof,redact(previousProof)]){
  assert.equal(nextAllowancePayment([],issuesFor(roster),months,now,covered,[visualSources[0],roster]).totals,null,
   'proof built before the merge check cannot establish zero');
 }
 const changedHistory=structuredClone(fromHistory);
 changedHistory[0].days.find(day=>day.legs.length).legs[0].arrivalTime='10:45';
 const changedIssues=changedHistory.flatMap(issuesFor);
 assert(changedIssues.some(item=>item.sourceIssueId!==AIMS_REDACTED_REST_ONLY));
 const unreadableFlight=published(1,{12:'09:40 LA 4999 09:39 BSB',27:'DO'},true);
 const readIssues=issuesFor(unreadableFlight), redactedFlightIssues=issuesFor(redact(unreadableFlight));
 for(const issues of [readIssues,redactedFlightIssues]){
  assert(issues.some(item=>item.iso===days[0]&&item.sourceIssueId.startsWith('aims-occurrence:')),
   'an unresolved earlier flight can affect the selected cycle');
 }
 const ambiguousVisual=published(2,{3:'ABC 14:00 BSB 17:00 VC'},true);
 assert.equal(ambiguousVisual.aimsFlightSourceCoverage?.authority,'aims_visual');
 assert.equal(ambiguousVisual.days.find(day=>day.date==='03/02/2032')?.rawText,'VC',
  'the visual parser drops the preceding ambiguous content from the rest row');
 const overnightIssue={iso:covered[0],airport:'ZZZ',pendingKind:'source_coverage',reason:'Synthetic prior stay interval missing'};
 const incomplete = [
  nextAllowancePayment([],[],months,now,covered.slice(1),sources),
  nextAllowancePayment([],[],months,now,covered.filter(iso=>iso!==days[2]),sources),
  nextAllowancePayment([],[],months,now,covered,[sources[1]]),
  nextAllowancePayment([],[],months,now,covered,[published(1,{27:'ASB BSB 23:00 BSB 06:00'}),sources[1]]),
  nextAllowancePayment([],[],months,now,covered,[published(1,{31:'VC HSBE'}),sources[1]]),
  nextAllowancePayment([],[],months,now,covered,[visualSources[0],ambiguousVisual]),
  nextAllowancePayment([],[],months,now,covered,[visualSources[0],published(2,{3:'SAT VC'},true)]),
  nextAllowancePayment([],[],months,now,covered,[sources[0],published(2,{3:'SAT VC'})]),
  nextAllowancePayment([],[],months,now,covered,[...visualSources,ambiguousVisual]),
  nextAllowancePayment([],[],months,now,covered,[sources[0],published(2,{3:'VC\n03Feb ABC 14:00 BSB 17:00 VC'})]),
  nextAllowancePayment([],[],months,now,covered,[sources[0],published(2,{3:'ABC 14:00 BSB 17:00 VC\n03Feb VC'})]),
  nextAllowancePayment([],[],months,now,covered,[sources[0],{...sources[1],rawText:''}]),
  nextAllowancePayment([],changedIssues,months,now,covered,changedHistory),
  nextAllowancePayment([],redactedFlightIssues,months,now,covered,[redact(unreadableFlight),fromHistory[1]]),
  nextAllowancePayment([],[...savedIssues,overnightIssue],months,now,covered,fromHistory),
  nextAllowancePayment([],[overnightIssue],months,now,covered,sources),
  nextAllowancePayment([],[{...overnightIssue,iso:days[2]}],months,now,covered,sources),
  nextAllowancePayment([],[{...overnightIssue,iso:''}],months,now,covered,sources),
 ];
 for(const payment of incomplete){
  assert.equal(payment.noEligibleAllowance,undefined);
  assert.equal(payment.totals,null);
  assert.equal(payment.calculationPartial,true);
  assert(payment.issues.length>0);
 }
 const priorCredit=nextAllowancePayment([{...rows[0],value:17}],[],months,now,covered,sources);
 assert.deepEqual(priorCredit.totals,{BRL:17},'credit from the closed cycle survives vacation on its pay date');
 assert.equal(priorCredit.lines.length,1);
 assert.equal(priorCredit.noEligibleAllowance,undefined);
 const julyDays=Array.from({length:7},(_,index)=>'2026-07-'+(15+index));
 const julyCredit=nextAllowancePayment([{...rows[0],iso:julyDays[6],value:17}],[],['2026-07'],new Date('2026-07-23T15:00:00Z'),julyDays);
 assert.deepEqual(julyCredit.totals,{BRL:17});
 assert.equal(julyCredit.expectedPaymentDates.BRL,'2026-07-23');
 const actualZeroLine=nextAllowancePayment([{...rows[0],value:0}],[],months,now,covered,sources);
 assert.deepEqual(actualZeroLine.totals,{BRL:0});
 assert.equal(actualZeroLine.lines.length,1,'a real zero-valued line remains an item');
 assert.equal(actualZeroLine.noEligibleAllowance,undefined);
 const candidate={creditMonth:'2032-02',operationalMonth:'2031-12',fixedMonth:'2032-01',range:{start:'2031-12-01',end:'2032-01-31',valid:true,kind:'custom'},lines:[{...rows[0],value:100},{...rows[1],value:20}],issues:[]};
 assert.deepEqual(nextPayrollPayment([candidate],now).totals,{BRL:120});
 assert.equal(nextPayrollPayment([{...candidate,lines:[{...rows[0],value:null}]},{...candidate,creditMonth:'2032-03'}],now).totals,null,'do not skip an incomplete earliest cycle');
 assert.equal(nextPayrollPayment([{...candidate,creditMonth:'2032-01'}],now).totals,null,'past cycle is not next payment');
 assert.equal(nextPayrollPayment([],now).totals,null);
 const pending=nextAllowancePayment(rows,[{iso:days[0],airport:'BSB',reason:'Synthetic APZ evidence absent'}],['2032-01','2032-02'],now,days);
 assert.equal(pending.totals,null);assert.deepEqual(pending.calculationTotals,{BRL:70});assert.equal(pending.calculationPartial,true);assert(pending.issues.some(issue=>issue.includes('Synthetic APZ evidence absent')));
 const partialPayroll=nextPayrollPayment([{...candidate,lines:[{...rows[0],value:100},{...rows[1],value:null}],issues:['Synthetic missing credit evidence']}],now);
 assert.equal(partialPayroll.totals,null);assert.deepEqual(partialPayroll.calculationTotals,{BRL:100});

 const taxi=nextAllowancePayment(rows,[{iso:days[0],airport:'BSB',reason:'Tarifa de táxi confirmada para o período ausente.'}],['2032-01','2032-02'],now,days);assert.deepEqual(taxi.calculationTotals,{BRL:70});assert(taxi.issues.some(x=>x.includes('táxi')));
 const mixed=nextAllowancePayment([...rows,{...rows[0],currency:'USD',value:30,convertedBRL:null},{...rows[0],value:NaN},{...rows[0],value:-50}],[],['2032-01','2032-02'],now,days.slice(1));assert.equal(mixed.totals,null);assert.deepEqual(mixed.calculationTotals,{BRL:70,USD:30});
 for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=timezone;
  const octoberDays=Array.from({length:7},(_,i)=>`2026-10-${14+i}`),octoberRow={iso:'2026-10-14',currency:'BRL',value:37.50,convertedBRL:37.50,label:'SYNTHETIC ONLY',source:'synthetic'};
  const partialDate=nextAllowancePayment([octoberRow],[{iso:'2026-10-14',airport:'BSB',reason:'Synthetic missing published report'}],['2026-10'],new Date('2026-10-18T15:00:00Z'),octoberDays);
  assert.equal(partialDate.range.start,'2026-10-14');assert.equal(partialDate.range.end,'2026-10-20');assert.equal(partialDate.expectedPaymentDates.BRL,'2026-10-22');assert.equal(partialDate.totals,null);assert.deepEqual(partialDate.calculationTotals,{BRL:37.50});
  assert.equal(nextAllowancePayment([],[],['2026-10'],new Date('2026-10-18T15:00:00Z'),octoberDays).expectedPaymentDates.BRL,'2026-10-22','known BRL reference date is independent of an unknown amount');
  assert.equal(observedBrlPaymentDate('2026-01-01'),null,'prior-year Wednesday outside verified calendar is not invented');assert.equal(observedBrlPaymentDate('2026-07-09'),'2026-07-08');assert.equal(observedBrlPaymentDate('2027-10-21'),null,'unverified banking year stays unknown');
 }
 console.log('PASS next payment: closed-cycle carry-in, proved zero versus incomplete coverage, cross-month own rows; reviewed payroll month and incomplete earliest cycle.');
}finally{rmSync(outDir,{recursive:true,force:true});}
