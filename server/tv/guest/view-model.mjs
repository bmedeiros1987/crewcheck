/** Small visitor-only display cache. Deliberately no localStorage, cookies,
 * credentials, HTML rendering, automatic owner-data fallback, or offline mode.
 * Final platform UI must call read() on a timer and clear on hide/error/logout.
 */
const SCHEMA='crewcheck.tv.visitor.v1';
export function createVisitorViewModel() {
  let snapshot=null, epoch=0;
  return {
    requestEpoch(){return epoch;},
    clear(){epoch++;snapshot=null;},
    accept(value,expectedDeviceId,requestEpoch,now=Date.now()) {
      if(requestEpoch!==epoch) return false;
      const expires=Date.parse(value?.expiresAt),generated=Date.parse(value?.generatedAt);
      if(value?.schema!==SCHEMA || value.audience!=='visitor' || value.deviceId!==expectedDeviceId ||
        value.offlineAllowed!==false || !Array.isArray(value.cards) || value.cards.length>11 ||
        !Number.isFinite(generated) || generated>now || !Number.isFinite(expires) || expires<=now || expires-generated>60000) {
        epoch++;snapshot=null;return false;
      }
      snapshot=JSON.parse(JSON.stringify(value));return true;
    },
    read(now=Date.now()) {
      if(!Number.isFinite(now) || !snapshot || Date.parse(snapshot.expiresAt)<=now || Date.parse(snapshot.generatedAt)>now){snapshot=null;return null;}
      return JSON.parse(JSON.stringify(snapshot));
    },
  };
}
