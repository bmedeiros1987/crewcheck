// Synthetic ledger setup for the already-owned, network-disabled MySQL harness.
import {createHash,createHmac} from 'node:crypto';
import {configureSyntheticOperationalPilot,configureSyntheticPilotRenewal} from './infobip-operational-pilot.mjs';
import {createOperationalPilotScope} from '../../server/infobip-whatsapp-operational-pilot.mjs';
import {createInfobipSendAdmission} from '../../server/infobip-whatsapp-admission.mjs';
import {createInfobipPilotRenewalAdmission} from '../../server/infobip-whatsapp-pilot-renewal.mjs';
import {createInfobipSqlBudget} from '../../server/infobip-whatsapp-sql-budget.mjs';
const H=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function seedSyntheticPilotRenewalLedger(db,{sender,recipient,owner,salt,epoch}) {
 const f=configureSyntheticOperationalPilot({state:{clock:epoch,owner},stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
 const a=f.dependencies.admission,c=f.dependencies.configuration;
 c.operationalPilotPricing.sender=sender;
 a.validFrom=epoch-1000;a.validUntil=epoch+600000;
 for(const name of ['operationalPilotPricing','operationalPilotBudget'])Object.assign(c[name],{verifiedAt:epoch-1000,validUntil:a.validUntil});
 const original=createInfobipSendAdmission(a,{sender,now:()=>f.state.clock}),tx=createInfobipSqlBudget(db);
 for(let i=0;i<2;i++)if(!await tx(conn=>original.reserve(conn,{sender,recipient})))throw Error('SYNTHETIC_SEED_DENIED');
 const historyKeys=[];
 for(const [i,command]of ['/menu','/proximo'].entries()){
  const slot='crewcheck-infobip-pilot-v1:'+H([sender,a.id,recipient,command]);
  await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3))',[slot,JSON.stringify({v:1,kind:'infobip_operational_pilot_slot',used:true})]);
  const historyKey='crewcheck-infobip-inbound-v1:'+H(['synthetic-renewal-delivered',sender,epoch,i]);historyKeys.push(historyKey);
  await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3))',[historyKey,JSON.stringify({v:1,status:'delivered',ownerHash:createHmac('sha256',salt).update(owner).digest('hex'),sealed:null,report:{attemptAt:epoch+i*1000,deliveryStatusId:5}})]);
 }
 configureSyntheticPilotRenewal(f);const now=()=>f.state.clock;
 const scope=createOperationalPilotScope(c,a,{now}),quantity=createInfobipPilotRenewalAdmission(c,a,{linkHashKey:salt,now});
 const job={sender,recipient,text:'Que horas a van me pega no hotel?',receivedAt:now(),bindingStamp:JSON.stringify([owner])};
 const quotaKey='crewcheck-infobip-admission-v1:'+H([sender,a.id]);
 const read=async()=>{const [[r]]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[quotaKey]);return typeof r.payload==='string'?JSON.parse(r.payload):r.payload;};
 return {f,scope,quantity,job,tx,quotaKey,historyKeys,read,reserve:()=>tx(conn=>scope.reserve(conn,job,quantity.reserve)),
  pickupSlot:'crewcheck-infobip-pilot-v1:'+H([sender,a.id,recipient,'q hrs a van me pega no hotel?'])};
}
