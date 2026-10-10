import assert from 'node:assert/strict';
import test from 'node:test';
import { readStayEditor, writeStayEditor, emptyStayEditor, migrateLegacyStay, stayEditorKey } from '../shared/stay-editor-store.mjs';
import { createStayAlarmController, stayAlarmIdentity } from '../shared/stay-alarm-adapter.mjs';
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key,value) => data.set(key,value) }; };
const record = { eventId:'stay',signature:'revision1',draft:{hotelName:'Synthetic',stayDate:'2030-10-11',presentationTime:'05:30'},timeZone:'America/Fortaleza',apzDate:'2030-10-11',apzSource:'manual',apzConfirmed:true,choice:{mode:'absolute',alarmAt:'2030-10-11T07:00:00Z',timeZone:'America/Fortaleza'},alarmState:'cancelled' };
test('reload retains absolute instant/zone, APZ provenance and cancellation, accounts do not mix',()=>{
 const db=storage(),state={...emptyStayEditor('a'),stays:{stay:record}};writeStayEditor(db,'a',state);
 assert.deepEqual(readStayEditor(db,'a').stays.stay,record);assert.equal(readStayEditor(db,'b').stays.stay,undefined);
 assert.throws(()=>writeStayEditor(db,'b',state),/Conta/);
});
test('default updates preserve individual overrides and other stays',()=>{
 const db=storage();writeStayEditor(db,'a',{...emptyStayEditor('a'),stays:{stay:record,other:{...record,eventId:'other',choice:{mode:'relative',leadMinutes:60}}}});
 const before=readStayEditor(db,'a');writeStayEditor(db,'a',{...before,defaultLeadMinutes:120});
 assert.deepEqual(readStayEditor(db,'a').stays,before.stays);assert.equal(readStayEditor(db,'a').defaultLeadMinutes,120);
});
test('migration preserves valid old lead but never confirms a legacy clock or schedules',()=>{
 const migrated=migrateLegacyStay({presentationTime:'05:30',leadMinutes:60},{accountId:'a',eventId:'stay',signature:'v1',draft:record.draft});
 assert.equal(migrated.apzConfirmed,false);assert.equal(migrated.apzSource,'legacy-unconfirmed');assert.equal(migrated.alarmState,'not-programmed');assert.equal(migrated.choice.leadMinutes,60);
 assert.equal(migrateLegacyStay({localOnly:true},{accountId:'a',eventId:'stay'}),null);
 assert.equal(migrateLegacyStay({rosterEventId:'other'},{accountId:'a',eventId:'stay'}),null);
});
test('corrupt/mismatched storage and invalid absolute choices fail closed; write failure surfaces',()=>{
 const db=storage();db.setItem(stayEditorKey('a'),JSON.stringify({...emptyStayEditor('b'),stays:{stay:record}}));assert.deepEqual(readStayEditor(db,'a').stays,{});
 db.setItem(stayEditorKey('a'),JSON.stringify({...emptyStayEditor('a'),stays:{stay:{...record,choice:{mode:'absolute',alarmAt:'invalid'}}}}));assert.deepEqual(readStayEditor(db,'a').stays,{});
 assert.throws(()=>writeStayEditor({setItem:()=>{throw Error('quota')}},'a',emptyStayEditor('a')),/quota/);
});
const input={accountId:'a',eventId:'stay',confirmed:true,apzConfirmed:true,permission:'granted',now:0,alarmAt:'2030-10-11T07:00:00Z',hotelReportAt:'2030-10-11T08:30:00Z'};
function mock(){const jobs=new Map(),calls=[];return {jobs,calls,atomicReplace:true,acknowledgedCancel:true,async replace(value){calls.push(['replace',value.key]);jobs.set(value.key,value);return {...value,state:'scheduled'}},async cancel({key}){calls.push(['cancel',key]);jobs.delete(key);return {key,state:'cancelled'}}};}
test('atomic replacement stable across time/mode updates; cancellation waits for in-flight replacement',async()=>{
 const adapter=mock(),runner=createStayAlarmController(adapter),key=stayAlarmIdentity('a','stay');
 await Promise.all([runner.replace(input),runner.replace({...input,alarmAt:'2030-10-11T07:30:00Z'})]);
 assert.equal(adapter.jobs.size,1);assert.equal(adapter.jobs.get(key).alarmAt,'2030-10-11T07:30:00Z');
 await Promise.all([runner.replace(input),runner.cancel(input)]);assert.equal(adapter.jobs.size,0);assert.deepEqual(adapter.calls.at(-1),['cancel',key]);
});
test('no native capability/permission/APZ confirmation => no adapter calls',async()=>{
 assert.equal((await createStayAlarmController().replace(input)).reason,'capability-unavailable');
 const adapter=mock(),runner=createStayAlarmController(adapter);
 for(const patch of [{permission:'denied'},{confirmed:false},{apzConfirmed:false},{cancelled:true},{alarmAt:input.hotelReportAt},{alarmAt:'1970-01-01T00:00:00Z'}]) assert.equal((await runner.replace({...input,...patch})).state,'not-programmed');
 assert.equal(adapter.calls.length,0);
});
test('boolean native result/errors never reported scheduled/cancelled',async()=>{
 const adapter=mock();adapter.replace=async()=>true;adapter.cancel=async()=>{throw Error('offline')};const runner=createStayAlarmController(adapter);
 assert.equal((await runner.replace(input)).state,'unknown');assert.equal((await runner.cancel(input)).state,'unknown');
});

test('invalid now never schedules, even when an otherwise confirmed instant is in the past',async()=>{
 const adapter=mock(),runner=createStayAlarmController(adapter);
 for(const now of [undefined,NaN,-Infinity,Infinity]) {
   assert.equal((await runner.replace({...input,now,alarmAt:'2000-01-01T07:00:00Z',hotelReportAt:'2000-01-01T08:30:00Z'})).state,'not-programmed');
 }
 assert.equal(adapter.calls.length,0);assert.equal(adapter.jobs.size,0);
});
