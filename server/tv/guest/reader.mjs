import { evaluateGuestAccess, projectVisitorTv, GuestError, GUEST_HEADERS } from './policy.mjs';

/** Bind to persistent host services before enabling. Credentials remain separate
 * from the owner's TvSession. No caller-selected owner/grant/visitor identifiers.
 */
export function createVisitorTvReader({ authorizeDevice, loadContext, loadFacts, now = Date.now }) {
  if (![authorizeDevice,loadContext,loadFacts,now].every(fn=>typeof fn==='function')) throw Error('guest_dependencies_required');
  return async token => {
    const device = await authorizeDevice(token);
    const context = await loadContext(device);
    const initial = evaluateGuestAccess(context,now());
    if (device?.deviceId !== initial.deviceId || device?.visitorId !== initial.visitorId ||
        device?.ownerId !== initial.ownerId || device?.grantId !== initial.grantId) throw new GuestError(403,'guest_not_authorized');
    const allowed=Object.keys(initial.fields).filter(key=>initial.fields[key]);
    // Provider MUST key its queries by owner and requested period, not credentials from a TV.
    const facts=allowed.length ? await loadFacts({ownerId:initial.ownerId,fields:allowed,from:initial.from,until:initial.until}) : {};
    const currentDevice=await authorizeDevice(token);
    const current=await loadContext(currentDevice);
    const final=evaluateGuestAccess(current,now());
    if (currentDevice?.deviceId!==final.deviceId || currentDevice?.visitorId!==final.visitorId ||
        currentDevice?.ownerId!==final.ownerId || currentDevice?.grantId!==final.grantId ||
        initial.ownerId!==final.ownerId || initial.deviceId!==final.deviceId ||
        initial.visitorId!==final.visitorId || initial.grantId!==final.grantId ||
        JSON.stringify(initial)!==JSON.stringify(final)) throw new GuestError(409,'guest_consent_changed');
    return projectVisitorTv(current,facts,now());
  };
}
export function createVisitorTvHandler({enabled=()=>false,read,rateLimit}) {
  return async ({method,path,token,ip}) => {
    const result=(status,body)=>({status,headers:GUEST_HEADERS,body});
    if(path!=='/api/tv/visitor/snapshot') return null;
    if(typeof enabled!=='function' || enabled()!==true) return result(404,{error:'unavailable'});
    if(method!=='GET') return result(405,{error:'method_not_allowed'});
    if(typeof token!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return result(401,{error:'authentication_required'});
    try {
      if(typeof rateLimit!=='function' || !(await rateLimit(ip))) return result(429,{error:'rate_limited'});
      const body=await read(token);
      if(enabled()!==true) return result(403,{error:'unavailable'});
      return result(200,body);
    }catch(error){
      return result(error instanceof GuestError?error.status:503,{error:error instanceof GuestError?error.message:'temporarily_unavailable'});
    }
  };
}
