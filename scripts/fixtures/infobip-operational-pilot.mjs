import {createHash} from 'node:crypto';
import {INFOBIP_OPERATIONAL_PILOT_APPROVAL,operationalPilotApprovalDigest} from '../../server/infobip-whatsapp-operational-pilot.mjs';
import {epoch,sender} from './infobip-production-sql.mjs';
export function configureSyntheticOperationalPilot(f) {
 f.operationalPilot=true;f.stats.operational=true;f.stats.clock=()=>f.state.clock;
 Object.assign(f.dependencies.admission,{id:INFOBIP_OPERATIONAL_PILOT_APPROVAL,ownerSha256:createHash('sha256').update(f.state?.owner||'synthetic-owner').digest('hex'),maxAttempts:3,validFrom:epoch-1000,validUntil:epoch+600000});
 Object.assign(f.dependencies.configuration,{operationalPilot:true,singleMessageTest:false,canonicalLinkHandshake:false,canonicalLinkHandshakeOnly:false,
  operationalPilotPricing:{currency:'USD',category:'service-text',country:'BR',sender,unitUpperMicroUsd:15000,sourceId:'synthetic-quote-not-a-real-tariff',verifiedAt:epoch-1000,validUntil:epoch+600000},
  operationalPilotBudget:{currency:'USD',monthlyLimitMicroUsd:20000000,allChannelsIncluded:true,remainingMicroUsd:5000000,verifiedAt:epoch-1000,validUntil:epoch+600000}});
 return f;
}
export function configureSyntheticPilotRenewal(f,{start=f.dependencies.admission.validUntil+1000,authorizationReference='synthetic-explicit-human-renewal'}={}) {
 const c=f.dependencies.configuration,a=f.dependencies.admission;
 f.state.clock=start;
 c.operationalPilotRenewal={version:1,revision:1,expectedRevision:0,expectedUsed:2,authorizationReference,
  expectedScopeDigest:operationalPilotApprovalDigest(c,a),authorizedAt:start,validFrom:start,validUntil:start+600000};
 for(const source of ['operationalPilotPricing','operationalPilotBudget'])Object.assign(c[source],{verifiedAt:start,validUntil:start+600000});
 return f;
}
