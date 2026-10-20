import {captureAuthSession,captureConfirmedGetMe,isConfirmedGetMeCurrent} from './authClient';

// Browser read continuity only, never native/Watch authority. No storage, network
// or public mint accepts caller-supplied identity. Original response objects only.
let context={owner:'',revision:'',generation:0};
const tickets=new WeakSet<object>();
const live=new Map<string,object>();
const records=new WeakMap<object,{ticket:ReturnType<typeof beginOperationalRadarRead>;signature:string;receipt:string;serialized:string}>();
export function setOperationalRadarContext(owner:string,revision:string) {
 if(owner!==context.owner||revision!==context.revision) {
  context={owner,revision,generation:context.generation+1};live.clear();
 }
}
export function beginOperationalRadarRead() {
 const proof=captureConfirmedGetMe(),session=captureAuthSession(),captured=context;
 if(!proof||!session.token||proof.owner!==session.owner||session.owner!==captured.owner||!captured.revision)return null;
 const ticket=Object.freeze({proof,session,revision:captured.revision,owner:captured.owner,
  isCurrent:()=>captured===context&&session.isCurrent()&&isConfirmedGetMeCurrent(proof)});
 tickets.add(ticket);return ticket;
}
export function retainOperationalRadarResponse(snapshot:object,key:string,signature:string,ticket:ReturnType<typeof beginOperationalRadarRead>,receipt:string) {
 if(!ticket||!tickets.has(ticket)||!ticket.isCurrent()||!signature||!Number.isFinite(Date.parse(receipt)))return;
 const serialized=JSON.stringify(snapshot);
 if(live.size>=128&&!live.has(key))live.delete(live.keys().next().value!);
 records.set(snapshot,{ticket,signature,receipt,serialized});live.set(key,snapshot);
}
// A disk copy can only select the SAME original admitted object. It cannot mint
// admission, change content, renew receipt, or survive page/process replacement.
export function originalOperationalRadarSnapshot<T extends object>(key:string,parsed:T):T {
 const original=live.get(key),record=original&&records.get(original);
 return original&&record?.ticket?.isCurrent()&&record.serialized===JSON.stringify(parsed)
  ? original as T : parsed;
}
export function readOperationalRadarAdmission(snapshot:object|null,key:string,signature:string) {
 const record=snapshot&&records.get(snapshot);
 if(!record?.ticket?.isCurrent()||record.signature!==signature||live.get(key)!==snapshot
   ||record.serialized!==JSON.stringify(snapshot))return null;
 const {ticket}=record;
 return {candidate:snapshot,session:ticket.session,ownerScope:ticket.owner,revision:ticket.revision,
  receivedAt:record.receipt,isCurrent:()=>Boolean(ticket.isCurrent()&&live.get(key)===snapshot
   &&record.signature===signature&&record.serialized===JSON.stringify(snapshot))};
}
