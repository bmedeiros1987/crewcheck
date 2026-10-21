import { captureAuthSession, getStoredUser, getToken } from './authClient';
import { loadStayEditor, savedStayEditorEvent } from './stayEditorStore';
import { orderStayDisplay } from './stayDisplayOrder';
import { calculateStayWakeup, stayInstant, stayLocalInstant } from '../../../shared/stay-edit-plan.mjs';

export const stayOperationalSignature = (event: any) => [event?.id,event?.canonical?.startDateTime,event?.canonical?.endDateTime,event?.origin,event?.destination].join('|');
/** Local projection only. room is private and must never enter transport/Watch. */
export function projectStayOperational({accountId,event,editor,now=Date.now()}: {accountId:string|null;event:any;editor:any;now?:number}) {
  const absent = (state:'missing'|'needs-review',reason:string,extra:any={}) => ({state,reason,eventId:event?.id || '',hotelName:'',room:'',apzAt:null,calculation:null,record:null,...extra});
  if (!accountId || editor?.accountId!==accountId || editor?.version!==2) return absent('missing','account-unavailable');
  if (event?.kind!=='stay' || typeof event.id!=='string' || !event.id) return absent('missing','stay-unavailable');
  const start=stayInstant(event.canonical?.startDateTime),end=stayInstant(event.canonical?.endDateTime);
  if(start===null||end===null||end<=start||!Number.isFinite(now)) return absent('needs-review','bounds-invalid');
  const record=editor.stays?.[event.id];
  if(!record) return absent('missing','saved-stay-missing');
  if(record.eventId!==event.id||record.signature!==stayOperationalSignature(event)) return absent('needs-review','occurrence-changed');
  const local={hotelName:typeof record.draft?.hotelName==='string'?record.draft.hotelName:'',room:typeof record.draft?.room==='string'?record.draft.room:'',record};
  if(record.apzSource!=='manual'||record.apzConfirmed!==true) return absent('needs-review','hotel-apz-unconfirmed',local);
  const at=stayLocalInstant(record.apzDate,record.draft?.presentationTime,record.timeZone);
  if(at===null||at<=start||at>end) return absent('needs-review','hotel-apz-invalid',local);
  const scope={accountId,rosterId:event.id,rosterRevision:record.signature};
  const calculation=calculateStayWakeup({scope,stay:{...scope,id:event.id,eventId:event.id,startAt:event.canonical.startDateTime,endAt:event.canonical.endDateTime,timeZone:record.timeZone},hotelApz:{...scope,source:'manual',stayId:event.id,rosterEventId:event.id,hotelReportAt:new Date(at).toISOString(),timeZone:record.timeZone,confirmed:true},now,choice:record.choice,defaultLeadMinutes:editor.defaultLeadMinutes,defaultWithoutBreakfastMinutes:editor.defaultWithoutBreakfastMinutes,breakfastPlan:record.breakfastPlan});
  return {...local,eventId:event.id,apzAt:new Date(at).toISOString(),calculation,state:calculation.action==='calculated'&&calculation.eligible?'calculated':'needs-review',reason:calculation.reason || (calculation.eligible?'manual-hotel-apz-confirmed':calculation.warnings?.[0] || 'calculation-review-required')};
}

/** Continuity fence only; this is not server authentication or scheduling admission. */
export function readStayOperationalProjection(event:any,now=Date.now()) {
  const session=captureAuthSession(),accountId=getToken()?getStoredUser()?.id || null:null;
  const editor=loadStayEditor(),signature=stayOperationalSignature(event),snapshot=JSON.stringify(editor);
  // Use the canonical reader's signature fence too; never adopt platform caches.
  const record=event?.id?savedStayEditorEvent(event.id,event):null;
  const projection=projectStayOperational({accountId,event,editor:{...editor,stays:{...editor.stays,...(record?{[event.id]:record}:{})}},now});
  return {...projection,isCurrent:()=>Boolean(accountId&&getToken()&&session.isCurrent()&&getStoredUser()?.id===accountId&&event?.kind==='stay'&&stayOperationalSignature(event)===signature&&JSON.stringify(loadStayEditor())===snapshot)};
}

export function selectCurrentStayOperationalProjection(events:readonly any[],now=Date.now()) {
  const stays=events.filter(event=>event?.kind==='stay'),ordered=orderStayDisplay(stays,now);
  const current=ordered.events.filter(event=>{const start=stayInstant(event.canonical?.startDateTime),end=stayInstant(event.canonical?.endDateTime);return start!==null&&end!==null&&end>start&&start<=now&&now<end;});
  if(ordered.ambiguous||current.length>1||current.some(event=>stays.filter(other=>other.id===event.id).length!==1)) return {state:'needs-review',reason:'ambiguous-current-stay',event:null,projection:null};
  if(current.length!==1) return {state:'missing',reason:'no-current-stay',event:null,projection:null};
  return {state:'selected',reason:'unique-current-stay',event:current[0],projection:readStayOperationalProjection(current[0],now)};
}
