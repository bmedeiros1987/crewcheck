// Only in-flight work is retained. No token/result cache, timer or retention policy.
export function createBillingVerificationFlight({maxConcurrent}){
 if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1)throw Object.assign(new Error('BILLING_VERIFICATION_LIMIT_REQUIRED'),{code:'BILLING_VERIFICATION_LIMIT_REQUIRED',status:503});
 const active=new Map();
 return function run(key,action){
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key)||typeof action!=='function')throw Object.assign(new Error('BILLING_VERIFICATION_KEY_INVALID'),{code:'BILLING_VERIFICATION_KEY_INVALID',status:503});
  if(active.has(key))return active.get(key);
  if(active.size>=maxConcurrent)throw Object.assign(new Error('BILLING_VERIFICATION_BUSY'),{code:'BILLING_VERIFICATION_BUSY',status:503});
  const promise=Promise.resolve().then(action).finally(()=>{if(active.get(key)===promise)active.delete(key);});
  active.set(key,promise);return promise;
 };
}
