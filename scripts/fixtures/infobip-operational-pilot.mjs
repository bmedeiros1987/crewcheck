import {INFOBIP_OPERATIONAL_PILOT_APPROVAL} from '../../server/infobip-whatsapp-operational-pilot.mjs';
import {epoch,sender} from './infobip-production-sql.mjs';
export function configureSyntheticOperationalPilot(f) {
 f.operationalPilot=true;f.stats.operational=true;f.stats.clock=()=>f.state.clock;
 Object.assign(f.dependencies.admission,{id:INFOBIP_OPERATIONAL_PILOT_APPROVAL,maxAttempts:3,validFrom:epoch-1000,validUntil:epoch+600000});
 Object.assign(f.dependencies.configuration,{operationalPilot:true,singleMessageTest:false,canonicalLinkHandshake:false,canonicalLinkHandshakeOnly:false,
  operationalPilotPricing:{currency:'USD',category:'service-text',country:'BR',sender,unitUpperMicroUsd:15000,sourceId:'synthetic-quote-not-a-real-tariff',verifiedAt:epoch-1000,validUntil:epoch+600000},
  operationalPilotBudget:{currency:'USD',monthlyLimitMicroUsd:20000000,allChannelsIncluded:true,remainingMicroUsd:5000000,verifiedAt:epoch-1000,validUntil:epoch+600000}});
 return f;
}
