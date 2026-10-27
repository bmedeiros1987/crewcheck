import assert from 'node:assert/strict';
import {regulationDeadlineSummary} from '../shared/regulationDeadlineSummary.mjs';
import {regulationScheduleProjection} from '../shared/regulationScenarioPrefill.mjs';
const form={presentation:'2033-04-15T07:20',presentationReviewed:true,normalEnd:'2033-04-15T18:20',offset:'-03:00',plannedEnd:'2033-04-15T16:50',delay:'0',reviewed:true,publicationOffsetReviewed:true,regime:'rbac117-b1',composition:'simple',acclimatization:'acclimatized',acclimatizedClockReviewed:true,timingChange:'flight-delay',changeReviewed:false,limitSource:'Motor existente · fixture',operation:'domestic',postFlight:'30',tasks:'10'};
form.limitBasis=JSON.stringify([form.presentation,form.offset]);
const summarize=(changes={},options={lastActivity:'operating'})=>{const f={...form,...changes};return regulationDeadlineSummary(f,regulationScheduleProjection(f),options);};
const first=summarize();assert.equal(first.normalDutyEnd,'2033-04-15T21:20:00.000Z');assert.equal(first.engineStopLimit,'2033-04-15T20:40:00.000Z');assert.equal(first.marginMinutes,90);
const late=summarize({delay:'60'});assert.equal(late.normalDutyEnd,first.normalDutyEnd);assert.equal(late.engineStopLimit,first.engineStopLimit);assert.equal(late.marginMinutes,30);
assert.equal(summarize({delay:'91'}).marginMinutes,-1);assert.equal(summarize({delay:'90'}).marginMinutes,0);
assert.equal(summarize({extension:true,delay:'60'}).marginMinutes,30,'extension hypothesis never increases normal margin');
for(const missing of [{reviewed:false},{presentation:''},{presentationReviewed:false},{composition:''},{acclimatization:'unknown'},{regime:''},{publicationOffsetReviewed:false},{acclimatizedClockReviewed:false},{timingChange:'presentation-change',changeReviewed:true},{timingChange:'reprogramming',changeReviewed:true}]){const r=summarize(missing);assert.equal(r.normalDutyEnd,null,JSON.stringify(missing));assert.equal(r.marginMinutes,null);}
for(const missing of [{tasks:''},{postFlight:''},{operation:''},{operation:'international',postFlight:'30'}])assert.equal(summarize(missing).engineStopLimit,null);
assert.equal(summarize({}, {lastActivity:'positioning',hasPositioning:true}).engineStopLimit,null);assert.equal(summarize({}, {lastActivity:'operating',hasPositioning:true}).normalDutyEnd,null);
assert.equal(summarize({operation:'international',postFlight:'45',tasks:'20'}).engineStopLimit,'2033-04-15T20:15:00.000Z');
assert.equal(summarize({normalEnd:'2033-04-15T06:20'}).normalDutyEnd,null);
assert.equal(summarize({delay:'-1'}).marginMinutes,null);assert.equal(summarize({delay:'1.5'}).marginMinutes,null);
assert.equal(summarize({presentation:'2033-04-15T04:20'}).normalDutyEnd,null);assert.equal(summarize({plannedEnd:'2033-04-15T04:20'}).marginMinutes,null);assert.equal(summarize({tasks:''}).marginMinutes,null);
const reference=JSON.stringify(form);for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){process.env.TZ=zone;assert.deepEqual(summarize(),first);}assert.equal(JSON.stringify(form),reference);
console.log('PASS regulation deadline presentation: essential inputs, OP/PS, independent normal/cut deadlines, postflight/tasks, delay boundary, no extension inflation, three zones and immutable source.');
