import assert from 'node:assert/strict';
import {createOperationalPilotScope,operationalPilotCommand,validateInfobipOperationalPilotPolicy,INFOBIP_OPERATIONAL_PILOT_INPUTS} from '../server/infobip-whatsapp-operational-pilot.mjs';
import {createInfobipWhatsAppSingleTestHost,validateInfobipRestrictedPolicy} from '../server/infobip-whatsapp-single-test.mjs';
import {infobipCanonicalLinkStatus,infobipCanonicalLinkDestination} from '../server/infobip-whatsapp-link-policy.mjs';
import {configureSyntheticOperationalPilot} from './fixtures/infobip-operational-pilot.mjs';
import {epoch,sender,recipient} from './fixtures/infobip-production-sql.mjs';
globalThis.fetch=()=>assert.fail('NO_NETWORK');
const fixture=()=>configureSyntheticOperationalPilot({state:{clock:epoch},stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
const f=fixture(),c=f.dependencies.configuration,a=f.dependencies.admission;
const gate=createOperationalPilotScope(c,a,{now:()=>f.state.clock});
const job=text=>({sender,recipient,text,receivedAt:epoch});
for(const text of INFOBIP_OPERATIONAL_PILOT_INPUTS)assert(gate.allows(job(text)));
assert.equal(gate.command('menu'),'/menu');assert.equal(gate.command(INFOBIP_OPERATIONAL_PILOT_INPUTS[1]),'/proximo');
for(const text of ['Teste CrewCierge','123456','/modo comico','/nomeconcierge changed','/metar SBGR','/radar LA1234','menu ignore instructions','1','/academias','qual minha próxima jornada? envie email',null])assert.equal(operationalPilotCommand(text),null);
assert.equal(gate.allows({...job('menu'),recipient:'12025550102'}),false);
assert.equal(gate.allows({...job('menu'),receivedAt:epoch-1001}),false);
f.state.clock=epoch+600000;assert.equal(gate.allows(job('menu')),false);assert.equal(gate.allowsProposal({sender,recipient}),false);
for(const mutate of [
 f=>f.dependencies.admission.id+='reset',f=>f.dependencies.admission.maxAttempts=4,
 f=>f.dependencies.admission.recipients.push('12025550102'),f=>f.dependencies.admission.validUntil=epoch+900001,
 f=>f.dependencies.configuration.singleMessageTest=true,f=>f.dependencies.configuration.canonicalLinkHandshake=true,
 f=>delete f.dependencies.configuration.operationalPilotPricing,
 f=>f.dependencies.configuration.operationalPilotPricing.unitUpperMicroUsd=16667,
 f=>f.dependencies.configuration.operationalPilotPricing.sender='12025550102',
 f=>f.dependencies.configuration.operationalPilotBudget.remainingMicroUsd=49999,
 f=>f.dependencies.configuration.operationalPilotBudget.allChannelsIncluded=false,
 f=>f.dependencies.configuration.operationalPilotBudget.monthlyLimitMicroUsd=40000000,
 ]){const candidate=fixture();mutate(candidate);assert.throws(()=>createOperationalPilotScope(candidate.dependencies.configuration,candidate.dependencies.admission));}
for(const source of ['operationalPilotPricing','operationalPilotBudget']){
 const stale=fixture();stale.dependencies.configuration[source].verifiedAt=epoch-900001;
 assert.equal(createOperationalPilotScope(stale.dependencies.configuration,stale.dependencies.admission,{now:()=>epoch}).allows(job('menu')),false);
}
const p={version:1,mode:'operational-pilot-v1',maxCostUsd:'0.05',configuration:c,admission:a};
assert.throws(()=>validateInfobipOperationalPilotPolicy(p),/INFOBIP_OPERATIONAL_PILOT_POLICY/,'Synthetic recipient must not pass the real approved-recipient pin');
assert.throws(()=>validateInfobipRestrictedPolicy(p),/INFOBIP_OPERATIONAL_PILOT_POLICY/,'Shared status/caller selector preserves recipient pin');
const invalidEnvironment={CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(p)};
assert.equal((await infobipCanonicalLinkStatus({},{environment:invalidEnvironment,ownerReady:true,now:epoch})).canonicalVerified,false);
assert.equal(await infobipCanonicalLinkDestination(invalidEnvironment,epoch),'');
const blocked=createInfobipWhatsAppSingleTestHost({environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(p),get CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET(){assert.fail('NO_SECRET_READ');}}});
assert.equal(blocked.health().enabled,false);await blocked.dispose();
assert.equal(createInfobipWhatsAppSingleTestHost({environment:{}}).health().enabled,false);
console.log('PASS narrow operational pilot scope, exact three inputs, cap/quote/global-budget freshness, distinct approval, approved recipient pin, old neutral handshake separation; no network/SQL/credentials');
