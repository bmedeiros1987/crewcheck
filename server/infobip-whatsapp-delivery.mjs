import {createInfobipWebhookAuthenticator} from './infobip-whatsapp-auth.mjs';
import {infobipDeliveryState} from './infobip-whatsapp-candidate.mjs';

// OFF candidate for the classic WhatsApp delivery-report results[] contract.
// Account subscription payload/auth/routing still requires verification. SEEN is
// a different contract and is never coerced into delivery. No public route here.
export function createOfflineInfobipDeliveryReceiver({username, password, authentication, store, kind = 'delivery', now = Date.now}) {
  if (!['delivery','seen'].includes(kind)) throw Error('INFOBIP_REPORT_KIND');
  if (typeof store?.recordDelivery !== 'function') throw Error('INFOBIP_DLR_CONFIGURATION');
  const auth = createInfobipWebhookAuthenticator(authentication === undefined ? {mode:'basic', username, password} : authentication);
  return async ({method, rawHeaders, rawBody}) => {
    if (method !== 'POST') return {status: 405, code: 'METHOD'};
    if (!auth.verify(rawHeaders, rawBody)) return {status: 401, code: 'AUTH'};
    let reports;
    try {
      if (!Buffer.isBuffer(rawBody) || !rawBody.length || rawBody.length > 65_536) throw Error();
      const payload = JSON.parse(rawBody.toString('utf8'));
      if (!Array.isArray(payload?.results) || !payload.results.length || payload.results.length > 20) throw Error();
      reports = payload.results.map(item => {
        const sentAt = Date.parse(item?.sentAt), doneAt = Date.parse(kind === 'seen' ? item?.seenAt : item?.doneAt);
        const owned = /^cc-[a-f0-9]{64}$/.test(item?.messageId);
        const foreign = typeof item?.messageId === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(item.messageId) && !item.messageId.startsWith('cc-');
        if ((!owned && !foreign) || !/^[1-9]\d{7,14}$/.test(item?.to) ||
            !Number.isFinite(sentAt) || !Number.isFinite(doneAt) || doneAt < sentAt ||
            doneAt > now() + 30_000 || now() - doneAt > 48 * 60 * 60_000 ||
            Object.hasOwn(item, 'message') ||
            (kind === 'seen' ? Object.hasOwn(item,'status') || Object.hasOwn(item,'doneAt') : Object.hasOwn(item,'seenAt')) ||
            (kind === 'delivery' && (!Number.isInteger(item.status?.id) || item.status.id < 0 ||
              !Number.isInteger(item.status?.groupId) || item.status.groupId < 1 || item.status.groupId > 5 ||
              ['PENDING','UNDELIVERABLE','DELIVERED','EXPIRED','REJECTED'][item.status.groupId-1] !== item.status?.groupName ||
              typeof item.status?.name !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(item.status.name))) ||
            (kind === 'delivery' && infobipDeliveryState(item.status) === 'delivered' && item.error !== undefined && item.error?.id !== 0) ||
            (item.contact?.phoneNumber !== undefined && item.contact.phoneNumber !== item.to)) throw Error();
        return {foreign, eventKey: owned ? item.messageId.slice(3) : null, recipient: item.to, sentAt, doneAt, kind,
          statusId:kind === 'delivery' ? item.status.id : undefined,
          deliveryState:kind === 'delivery' ? infobipDeliveryState(item.status) : undefined,
          receiptKey:kind === 'delivery' ? [item.messageId,item.status.id,item.doneAt] : [item.messageId,item.seenAt]};
      });
    } catch {return {status: 400, code: 'INVALID_DELIVERY'};}
    try {
      let recorded = 0, ignored = 0, seen = 0, observed = 0, duplicates = 0;
      for (const report of reports) {
        if(report.foreign){ignored++;continue;}
        const result = await store.recordDelivery(report);
        if (result.status === 'delivered') recorded++;
        else if (result.status === 'seen') seen++;
        else if (result.status === 'observed') observed++;
        else {ignored++;if(result.status === 'duplicate') duplicates++;}
      }
      return {status: 200, code: 'RECORDED', recorded, seen, observed, duplicates, ignored};
    } catch {return {status: 503, code: 'STORE_UNAVAILABLE'};}
  };
}
