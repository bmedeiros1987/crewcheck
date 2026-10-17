/** Server-owned duration: call only AFTER signature/session verification.
 * No credentials, timers, persistence or activation. Missing expiry fails closed. */
export function verifiedStayLease({exp,serverNow=Date.now(),horizonMillis=18*3600000}={}) {
 if(!Number.isSafeInteger(exp)||!Number.isSafeInteger(serverNow)||!Number.isSafeInteger(horizonMillis)
    ||exp<=0||horizonMillis<=0||horizonMillis>18*3600000)return null;
 const expires=exp*1000;
 if(!Number.isSafeInteger(expires)||expires<=serverNow)return null;
 return {serverNow,sessionExpiresAt:expires,stayLeaseExpiresAt:Math.min(expires,serverNow+horizonMillis)};
}
