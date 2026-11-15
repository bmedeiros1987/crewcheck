import assert from 'node:assert/strict';import {googleSubscriptionStatus as status} from '../server/google-subscription-status.mjs';
const now=Date.parse('2030-02-01T12:00:00.000Z'),future=new Date(now+1),atLimit=new Date(now),before=new Date(now-1),state=x=>'SUBSCRIPTION_STATE_'+x;
const rows=[['ACTIVE','active',true,false],['IN_GRACE_PERIOD','grace_period',true,false],['CANCELED','active',true,true],['PENDING','pending',false,false],['ON_HOLD','past_due',false,false],['PAUSED','paused',false,false],['EXPIRED','expired',false,false],['UNKNOWN','expired',false,false]];let cases=0;
for(const [name,expected,active,cancelAtPeriodEnd]of rows){assert.deepEqual(status(state(name),future,{now}),{status:expected,active,cancelAtPeriodEnd});cases++;}
for(const name of ['ACTIVE','IN_GRACE_PERIOD','CANCELED'])for(const expiry of [atLimit,before,null,new Date('invalid'),future.toISOString()]){assert.deepEqual(status(state(name),expiry,{now}),{status:'expired',active:false,cancelAtPeriodEnd:false});cases++;}
assert.deepEqual(status('ACTIVE',future,{now}),{status:'expired',active:false,cancelAtPeriodEnd:false});cases++;
console.log('PASS shared Google current-state normalizer:'+cases+' lifecycle/strict-expiry cases; event type never grants access');
