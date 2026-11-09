import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const m=loadClientModules({files:['client/src/lib/latamAllowanceCatalog.ts']});
try {
 const c=m.load('latamAllowanceCatalog');
 const rate=(role,category,date,slot='mainMeal')=>c.resolveLatamAllowanceReference({role,category,date,slot});
 for(const role of ['cabin','pilot']) {
  for(const [date,state,value] of [['2025-11-30','inapplicable',null],['2025-12-01','calculable_minimum_reference',10943],['2025-12-31','calculable_minimum_reference',10943],['2026-01-01','resolved_enterprise_reference',10944],['2026-11-30','resolved_enterprise_reference',10944],['2026-12-01','unresolved_index',null],['2027-11-30','unresolved_index',null],['2027-12-01','expired',null]]) {
   const r=rate(role,'domestic',date); assert.equal(r.state,state,date); assert.equal(r.amountMinor,value,date); assert.equal(r.exactCurrentRate,false);
  }
  for(const category of Object.keys(c.LATAM_PRINTED_ALLOWANCES)) {
   const printed=c.LATAM_PRINTED_ALLOWANCES[category];
   for(const date of ['2025-12-01','2026-11-30','2026-12-01','2027-11-30']) {
    const r=rate(role,category,date); assert.equal(r.publishedFloorMinor,printed.minor); assert.equal(r.currency,printed.currency); assert.ok(r.sourceUrls.every(url=>url.startsWith('https://')));
    if(['mexico','england'].includes(category)){assert.equal(r.state,'unresolved_scope');assert.equal(r.amountMinor,null);assert.equal(r.calculableReference,false);}
    else if(category!=='domestic') {
     const increment=category==='north_america'?300:category==='europe'?200:0;
     assert.equal(r.amountMinor,printed.minor+increment*(date>='2026-12-01'?2:1)); assert.equal(r.state,'calculable_minimum_reference');
     assert.equal(r.sourceKind,increment?'computed_act_floor':'published_act_floor');
     assert.match(r.reason,/moeda efetiva de pagamento/);
    }
   }
  }
  for(const slot of ['breakfast','taxi'])assert.equal(rate(role,'domestic','2026-01-01',slot).amountMinor,2736);
  assert.equal(rate(role,'domestic','2025-12-31','taxi').amountMinor,null);
  assert.equal(rate(role,'domestic','2026-01-01','taxi').publishedFloorMinor,null);
  assert.deepEqual(rate(role,'domestic','2026-01-01','taxi').sourceUrls,[]);
  assert.equal(rate(role,'domestic','2026-01-01').computedFloorMinor,10943);
  assert.equal(rate(role,'domestic','2026-01-01').sourceKind,'admin_enterprise_reference');
  assert.equal(rate(role,'north_america','2026-01-01','breakfast').amountMinor,718);
  assert.equal(rate(role,'england','2026-01-01','breakfast').publishedFloorMinor,2400,'inspection preserves literal main-meal floor, not an invented breakfast quote');
  assert.equal(rate(role,'england','2026-01-01','breakfast').publishedFloorBasis,'main_meal');
 }
 for(const role of [undefined,null,'CCM','CHEFE','CP','cabin pilot',{},'LATAM'])assert.equal(rate(role,'domestic','2026-01-01').amountMinor,null);
 for(const date of ['2026-02-29','2026-13-01','01/01/2026','2026-01-01T00:00Z',null])assert.equal(rate('cabin','domestic',date).amountMinor,null);
 for(const category of ['unknown','ZZZ','__proto__','UK','GB',null])assert.equal(rate('pilot',category,'2026-01-01').amountMinor,null);
 assert.equal(rate('pilot','domestic','2026-01-01',{toString:()=> 'mainMeal'}).amountMinor,null);
 assert.equal(c.allowanceRatioMinor(10504,755450,725154),10943);assert.equal(c.allowanceRatioMinor(10943,1,4),2736);assert.ok(Number.isNaN(c.allowanceRatioMinor(5,1,0)));
 console.log('PASS real LATAM catalog: both profiles, all printed rows, dated increments and review boundaries, admin/floor/taxi provenance, exact aliases and currency separation');
}finally{m.cleanup();}
