import assert from 'node:assert/strict';
import {receiveAsaasEvent as receive,retryAsaasReceipt as retry} from '../server/asaas-webhook-inbox.mjs';

// Independent-review P1s. These security assertions must fail on287adba6.
export async function runAsaasReviewCounterexamples(fixture) {
  const failures=[],passed=[];
  let instant=Date.parse('2026-10-03T12:00:00Z');
  const receiveAsaasEvent=(db,body)=>{instant=Date.parse(body.dateCreated.replace(' ','T')+'Z');return receive(db,body,{now:()=>instant});};
  const retryAsaasReceipt=(db,id)=>retry(db,id,{now:()=>instant});
  const event=(id,kind,time,payment,date)=>({id,event:kind,dateCreated:time,payment:{id:payment,subscription:'sub_synthetic',status:kind==='PAYMENT_RECEIVED'?'RECEIVED':kind==='PAYMENT_CONFIRMED'?'CONFIRMED':'REFUNDED',confirmedDate:date}});
  const run=async(name,fn)=>{await fixture.reset();try{await fn();passed.push(name);}catch(error){failures.push(error);console.error('FAIL review regression:',name,error.message);}};
  await run('P1 orphan confirmed cannot grant while later orphan refund is durable',async()=>{
    await receiveAsaasEvent(fixture.db,event('evt_review_paid','PAYMENT_CONFIRMED','2026-10-01 10:00:00','pay_review','2026-10-01'));
    await receiveAsaasEvent(fixture.db,event('evt_review_refund','PAYMENT_REFUNDED','2026-10-02 10:00:00','pay_review','2026-10-01'));
    await fixture.seed();
    const retry=await retryAsaasReceipt(fixture.db,'evt_review_paid');
    assert.notEqual(retry.disposition,'processed','older orphan must not be applied before durable later reversal');
    assert.equal((await fixture.state()).profiles['fictional@example.test'],'free','pending later refund forbids Premium');
    await retryAsaasReceipt(fixture.db,'evt_review_refund');
    await retryAsaasReceipt(fixture.db,'evt_review_paid');
    assert.equal((await fixture.state()).profiles['fictional@example.test'],'free');
  });
  await run('P1 received oldA cannot resurrect refundedB period',async()=>{
    await fixture.seed();
    await receiveAsaasEvent(fixture.db,event('evt_review_A','PAYMENT_CONFIRMED','2026-09-01 10:00:00','pay_A','2026-09-01'));
    await receiveAsaasEvent(fixture.db,event('evt_review_B','PAYMENT_CONFIRMED','2026-10-01 10:00:00','pay_B','2026-10-01'));
    await receiveAsaasEvent(fixture.db,event('evt_review_B_refund','PAYMENT_REFUNDED','2026-10-02 10:00:00','pay_B','2026-10-01'));
    assert.equal((await fixture.state()).profiles['fictional@example.test'],'free');
    const late=await receiveAsaasEvent(fixture.db,event('evt_review_A_late','PAYMENT_RECEIVED','2026-10-03 10:00:00','pay_A','2026-09-01'));
    assert.notEqual(late.body.disposition,'processed','oldA must not borrowB funded period');
    const state=await fixture.state();assert.equal(state.profiles['fictional@example.test'],'free');
    assert.notEqual(state.subscriptions[0].status,'active');
  });
  if(failures.length)throw new AggregateError(failures,'Independent Asaas review P1 regressions');
  console.log('PASS2 independent Asaas P1 counterexamples without changing assertions.');
  return passed;
}
