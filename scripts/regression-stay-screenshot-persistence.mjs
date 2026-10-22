import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStayEditor, readStayEditor, writeStayEditor } from '../shared/stay-editor-store.mjs';
import { createStayScreenshotImport, removeStayScreenshotImport } from '../shared/stay-screenshot-candidates.mjs';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),map};};
const record={eventId:'stay',signature:'stay|2032-10-21|CWB',draft:{hotelName:'Manual Hotel',room:'407 MANUAL',presentationTime:'04:20',shareSameHotel:false},timeZone:'America/Sao_Paulo',apzDate:'2032-10-22',apzConfirmed:false,apzSource:'screenshot',alarmState:'cancelled',choice:{mode:'relative',leadMinutes:45},breakfastPlan:'with'};

test('only explicitly selected normalized operational fields survive screenshot roundtrip; room/alarm/consent unchanged',()=>{
 const storage=memory(),before={hotelName:'Manual Hotel',apzTime:'04:20',apzDate:'2032-10-22',apzTimeZone:'America/Sao_Paulo'};
 const update=createStayScreenshotImport(before,{hotelName:'Imported Hotel',apzTime:'05:10',transportProvider:'Synthetic Shuttle'});
 assert.equal(storage.map.size,0,'pure import performs no save');
 const state=emptyStayEditor('A');state.stays.stay={...record,draft:{...record.draft,hotelName:update.values.hotelName,presentationTime:update.values.apzTime},apzDate:update.values.apzDate,timeZone:update.values.apzTimeZone,screenshotImport:{...update.imported,raw:'SECRET OCR',image:'data:image/png;base64,PRIVATE',evidence:{hotelName:'SECRET OCR'}},transport:{transportProvider:'Synthetic Shuttle',pickupTime:'05:45',raw:'SECRET OCR',room:'638 OCR',url:'blob:private',password:'SECRET'}};
 writeStayEditor(storage,'A',state);const text=[...storage.map.values()].join('');assert(!/SECRET|data:image|blob:|638 OCR|evidence/.test(text));
 const saved=readStayEditor(storage,'A').stays.stay;assert.equal(saved.draft.room,'407 MANUAL');assert.equal(saved.draft.shareSameHotel,false);assert.equal(saved.alarmState,'cancelled');assert.equal(saved.choice.leadMinutes,45);assert.equal(saved.apzConfirmed,false);assert.equal(saved.apzDate,'');assert.equal(saved.timeZone,'');assert.deepEqual(saved.transport,{transportProvider:'Synthetic Shuttle',pickupTime:'05:45'});assert.equal(saved.screenshotImport.source,'screenshot');assert.deepEqual(readStayEditor(storage,'B').stays,{});
 const restored=removeStayScreenshotImport({...update.values,hotelName:'Later manual hotel'},saved.screenshotImport);assert.equal(restored.values.hotelName,'Later manual hotel');assert.equal(restored.values.apzTime,'04:20');assert.equal(restored.values.apzDate,'2032-10-22');assert.equal(restored.values.apzTimeZone,'America/Sao_Paulo');
});

test('forged screenshot cannot authenticate APZ or add implicit sharing; invalid metadata and transport stripped',()=>{
 const storage=memory(),state=emptyStayEditor('A');state.stays.stay={...record,apzConfirmed:true,screenshotImport:{version:1,source:'mycrewcare',reviewedByUser:true,fields:{}},transport:{pickupDate:'2032-02-30',pickupTime:'25:99',pickupTimeZone:'BRT',shareSameHotel:true}};
 writeStayEditor(storage,'A',state);const saved=readStayEditor(storage,'A').stays.stay;assert.equal(saved.apzConfirmed,false);assert.equal(saved.screenshotImport,undefined);assert.deepEqual(saved.transport,{});assert.equal(saved.draft.shareSameHotel,false);
});

test('quota failure never implies saved import and does not touch prior storage',()=>{
 const storage=memory(),state=emptyStayEditor('A');state.stays.stay=record;writeStayEditor(storage,'A',state);const before=JSON.stringify([...storage.map]);assert.throws(()=>writeStayEditor({setItem(){throw new Error('QuotaExceeded');}},'A',{...state,stays:{}}),/QuotaExceeded/);assert.equal(JSON.stringify([...storage.map]),before);
});
