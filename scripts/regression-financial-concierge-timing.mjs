import assert from 'node:assert/strict';
import {queryUpcomingFinancialForecast as query} from '../shared/financialUpcoming.mjs';
const identity={authenticated:true,role:'owner',ownerId:'timing@example.invalid'};
const now=new Date('2026-10-18T15:00:00Z');
const allowance={id:'a'.repeat(64),ownerId:identity.ownerId,revision:1,category:'allowance',aggregationLevel:'item',periodStart:'2026-10-20',periodEnd:'2026-10-20',sourceId:'synthetic-flight',timezone:'America/Sao_Paulo',ruleVersion:'synthetic-rule',currency:'USD',amountMinor:3000,status:'forecast',expectedPaymentDate:'2026-10-20',expectedPaymentTimezone:'America/Sao_Paulo'};
const payroll={...allowance,id:'b'.repeat(64),category:'payroll',aggregationLevel:'month',currency:'BRL',periodStart:'2026-12-01',periodEnd:'2026-12-31',amountBasis:'net_credit',operationalMonth:'2026-10',payrollMonth:'2026-11',rateMonth:'2026-11',expectedCreditMonth:'2026-12',expectedPaymentDate:'2026-10-22'};
const linked={...allowance,flightDate:'2026-10-20',flightDateTimezone:'America/Sao_Paulo',flightAirport:'EZE',timingRuleId:'synthetic-owner-rule'};
const read=(records,time=now)=>query({identity,records,now:time});
const cases=[
 ['payroll outside credit month',payroll,false],
 ['foreign without flight link',allowance,false],
 ['foreign proven link',linked,true],
 ['foreign date differs from flight',{...linked,expectedPaymentDate:'2026-10-21'},false],
 ['foreign timezone differs from flight',{...linked,flightDateTimezone:'UTC'},false],
 ['foreign missing policy',{...linked,timingRuleId:undefined},false],
 ['foreign missing airport',{...linked,flightAirport:undefined},false],
 ['foreign aggregate cannot prove a flight',{...linked,aggregationLevel:'week'},false],
 ['negative incoming allowance',{...linked,amountMinor:-3000},false],
 ['known zero remains zero',{...linked,amountMinor:0},true],
 ['unknown remains unknown',{...linked,amountMinor:null},true],
];
const observations=cases.map(([name,record,shown])=>({name,expectedShown:shown,result:read([record])}));
if(process.env.FINANCIAL_TIMING_OBSERVE==='1')console.log(JSON.stringify(observations,null,2));
else {
 for(const {name,expectedShown,result} of observations){assert.equal(result.events.length,expectedShown?1:0,name);if(!expectedShown)assert.equal(result.state,'incomplete',name);}
 assert.equal(read([{...linked,amountMinor:null}]).events[0].amountMinor,null);
 assert.equal(read([{...linked,amountMinor:0}]).events[0].amountMinor,0);
 const goodPayroll={...payroll,expectedPaymentDate:'2026-12-04'};
 assert.equal(read([goodPayroll],new Date('2026-12-01T15:00:00Z')).events.length,1);
 assert.equal(read([linked,{...linked,id:'c'.repeat(64),ownerId:'other@example.invalid',amountMinor:999999}]).events.length,1);
 assert(!JSON.stringify(read([linked])).includes('flightAirport'),'private provenance must not enter compact DTO');
 assert.equal(read([{...linked,status:'payment_confirmed',paymentDate:'2026-10-20',evidence:{kind:'settlement',reference:'synthetic'}}]).events.length,0);
 console.log('PASS Concierge timing: credit month, foreign flight/date/timezone/policy, item/day only, nonnegative incoming, zero/null, owner and settlement.');
}
