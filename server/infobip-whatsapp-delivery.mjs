import {verifyInfobipBasic, infobipDeliveryState} from './infobip-whatsapp-candidate.mjs';

// OFF candidate for the classic WhatsApp delivery-report results[] contract.
// Account subscription payload/auth/routing still requires verification. SEEN is
// a different contract and is never coerced into delivery. No public route here.
export function createOfflineInfobipDeliveryReceiver({username, password, store, now = Date.now}) {
  if (typeof store?.recordDelivery !== 'function') throw Error('INFOBIP_DLR_CONFIGURATION');
  return async ({method, rawHeaders, rawBody}) => {
    if (method !== 'POST') return {status: 405, code: 'METHOD'};
    if (!verifyInfobipBasic(rawHeaders, username, password)) return {status: 401, code: 'AUTH'};
    let reports;
    try {
      if (!Buffer.isBuffer(rawBody) || !rawBody.length || rawBody.length > 65_536) throw Error();
      const payload = JSON.parse(rawBody.toString('utf8'));
      if (!Array.isArray(payload?.results) || !payload.results.length || payload.results.length > 20) throw Error();
      reports = payload.results.map(item => {
        const sentAt = Date.parse(item?.sentAt), doneAt = Date.parse(item?.doneAt);
        if (!/^cc-[a-f0-9]{64}$/.test(item?.messageId) || !/^[1-9]\d{7,14}$/.test(item?.to) ||
            !Number.isFinite(sentAt) || !Number.isFinite(doneAt) || doneAt < sentAt ||
            doneAt > now() + 30_000 || now() - doneAt > 48 * 60 * 60_000 ||
            Object.hasOwn(item, 'seenAt') || Object.hasOwn(item, 'message') ||
            (item.error !== undefined && item.error?.id !== 0) ||
            (item.contact?.phoneNumber !== undefined && item.contact.phoneNumber !== item.to) ||
            infobipDeliveryState(item.status) !== 'delivered') throw Error();
        return {eventKey: item.messageId.slice(3), recipient: item.to, sentAt, doneAt};
      });
    } catch {return {status: 400, code: 'INVALID_DELIVERY'};}
    try {
      let recorded = 0, ignored = 0;
      for (const report of reports) {
        const result = await store.recordDelivery(report);
        if (result.status === 'delivered') recorded++; else ignored++;
      }
      return {status: 200, code: 'RECORDED', recorded, ignored};
    } catch {return {status: 503, code: 'STORE_UNAVAILABLE'};}
  };
}
