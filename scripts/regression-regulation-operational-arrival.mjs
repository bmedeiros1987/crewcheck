import assert from 'node:assert/strict';
import {readRegulationOperationalArrival as read,regulationOperationalProjection as projection} from '../shared/regulationOperationalArrival.mjs';
import {regulationDeadlineSummary} from '../shared/regulationDeadlineSummary.mjs';
const occurrence={flight:'QA1234',departureDate:'2032-10-20',origin:'BSB',destination:'GRU',scheduledDepartureUtc:'2032-10-20T12:30:00Z'};
const evidence={schema:'regulation-operational-arrival-v1',ownerScope:'synthetic-owner',revision:'synthetic-r1',occurrence,
 field:{kind:'estimated',milestone:'engine_stop',at:'2032-10-20T14:10:00Z',source:{provider:'synthetic-only',field:'synthetic.engineStopEstimate',observedAt:'2032-10-20T13:00:00Z',receivedAt:'2032-10-20T13:00:02Z',expiresAt:'2032-10-20T13:10:00Z'}}};
const input={evidence,expected:{ownerScope:'synthetic-owner',revision:'synthetic-r1',lastActivity:'operating',occurrence},admitted:true,now:Date.parse('2032-10-20T13:01:00Z'),operation:'domestic',postFlightMinutes:30,additionalTasksMinutes:0};
for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
 process.env.TZ=zone;
 const output=read(input);assert.equal(output.state,'available');assert.equal(output.kind,'estimated');assert.equal(output.dutyEndAt,'2032-10-20T14:40:00.000Z');
 const at=value=>read({...input,evidence:{...evidence,field:{...evidence.field,at:value}}});
 assert.equal(at('2032-10-20T13:01:00Z').state,'available','estimate at current instant accepted');
 assert.equal(at('2032-10-20T13:00:59.999Z').state,'unavailable','past estimate rejected at 1ms boundary');
 assert.equal(at('2032-10-20T13:01:00.001Z').state,'available');
 assert.equal(at('2032-10-21T12:30:00Z').state,'available','24h source-plausibility boundary');
 assert.equal(at('2032-10-21T12:30:00.001Z').state,'unavailable','beyond 24h is not plausible source arrival');
 assert.deepEqual(read({...input,delay:60,manualDelay:60}),output,'no departure/manual delay may be added to arrival');
 const landing=read({...input,taxiInMinutes:10,evidence:{...evidence,field:{...evidence.field,milestone:'landing'}}});assert.equal(landing.dutyEndAt,'2032-10-20T14:50:00.000Z');assert.equal(landing.engineStopKind,'estimated');assert.equal(landing.dutyEndKind,'projected');
 assert.equal(read({...input,evidence:{...evidence,field:{...evidence.field,milestone:'landing'}}}).reason,'taxi_unproved');
 const actual=read({...input,evidence:{...evidence,field:{...evidence.field,kind:'actual',at:'2032-10-20T12:59:00Z'}}});assert.equal(actual.kind,'actual');assert.equal(actual.dutyEndAt,'2032-10-20T13:29:00.000Z');
 for(const evidenceChange of [
  {schema:'legacy'}, {ownerScope:'other-owner'}, {revision:'old'},
  {occurrence:{...occurrence,flight:'QA9999'}},{occurrence:{...occurrence,departureDate:'2032-10-21'}},
  {occurrence:{...occurrence,origin:'REC'}},{occurrence:{...occurrence,destination:'REC'}},
  {occurrence:{...occurrence,scheduledDepartureUtc:'2032-10-20T12:31:00Z'}},
  {field:{...evidence.field,kind:'scheduled'}},{field:{...evidence.field,milestone:'gate_in'}},
  {field:{...evidence.field,kind:'actual'}},{field:{...evidence.field,at:'2032-10-20T14:10'}},
  {field:{...evidence.field,at:'2032-02-30T14:10Z'}},
  ...['provider','field','observedAt','receivedAt','expiresAt'].map(key=>({field:{...evidence.field,source:{...evidence.field.source,[key]:''}}})),
  {field:{...evidence.field,source:{...evidence.field.source,observedAt:'2032-10-20T13:02:00Z'}}},
  {field:{...evidence.field,source:{...evidence.field.source,expiresAt:'2032-10-20T13:01:00Z'}}},
  {field:{...evidence.field,source:{...evidence.field.source,expiresAt:'2032-10-20T14:01:00Z'}}},
 ])assert.equal(read({...input,evidence:{...evidence,...evidenceChange}}).state,'unavailable',JSON.stringify(evidenceChange));
 for(const override of [{admitted:false},{now:NaN},{postFlightMinutes:0},{additionalTasksMinutes:null},{operation:'unknown'},{expected:{...input.expected,lastActivity:'positioning'}},{now:Date.parse('2032-10-20T13:10:00Z')}])assert.equal(read({...input,...override}).state,'unavailable');
 const offset=read({...input,evidence:{...evidence,occurrence:{...occurrence,scheduledDepartureUtc:'2032-10-20T09:30:00-03:00'},field:{...evidence.field,at:'2032-10-20T11:10:00-03:00'}}});assert.equal(offset.dutyEndAt,output.dutyEndAt);
 assert.equal(read({...input,evidence:{ok:true,arrival:'2032-10-20T14:10:00Z',provider:'flightaware',updatedAt:input.now}}).reason,'producer_contract_unavailable','generic current radar arrival cannot imply a milestone or freshness');
 assert.equal(projection(read({...input,admitted:false})),null);
 const form={presentation:'2032-10-20T07:10',offset:'-03:00',presentationReviewed:true,normalEnd:'2032-10-20T12:00',reviewed:true,publicationOffsetReviewed:true,regime:'operator-reviewed',composition:'simple',acclimatization:'acclimatized',limitSource:'Referência do operador revisada',timingChange:'flight-delay',operation:'domestic',postFlight:'30',tasks:'0',delay:'60'};
 const result=regulationDeadlineSummary(form,projection(output),{lastActivity:'operating'});
 assert.equal(result.normalDutyEnd,'2032-10-20T15:00:00.000Z');assert.equal(result.marginMinutes,20,'arrival-based forecast replaces manual +60 instead of adding it');
 assert.equal(result.engineStopLimit,'2032-10-20T14:30:00.000Z');
 assert.equal(regulationDeadlineSummary({...form,reviewed:false},projection(output),{lastActivity:'operating'}).normalDutyEnd,null,'operational forecast never confirms an unreviewed limit');
}
console.log('PASS disconnected operational-arrival reader: exact occurrence/scope, explicit instants, field provenance/expiry, estimated vs actual, manual non-addition, unchanged reviewed deadlines; 3 zones; synthetic only');
