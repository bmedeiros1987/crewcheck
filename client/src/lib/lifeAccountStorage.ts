import {captureAuthSession} from './authClient';
/** Local partition only, never server authorization. Legacy unowned keys are preserved but not read/migrated. */
function context(key:string){
 if(!key.startsWith('crewcheck:life:'))return null;
 try{const session=captureAuthSession();if(!session.token||!session.owner||!session.isCurrent())return null;
 return {session,key:`crewcheck:life:account:v2:${encodeURIComponent(session.owner)}:${key}`};}catch{return null;}
}
export function readLifeAccountJson<T>(key:string,fallback:T):T{
 const ctx=context(key);if(!ctx)return fallback;
 try{const raw=localStorage.getItem(ctx.key);if(!ctx.session.isCurrent()||!raw)return fallback;const parsed=JSON.parse(raw);
 if(Array.isArray(fallback))return (Array.isArray(parsed)?parsed:fallback) as T;
 if(fallback&&typeof fallback==='object')return (parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?{...fallback,...parsed}:fallback) as T;
 return parsed as T;
 }catch{return fallback;}
}
export function writeLifeAccountJson(key:string,value:unknown):boolean{
 const ctx=context(key);if(!ctx)return false;
 try{const raw=JSON.stringify(value);if(!ctx.session.isCurrent())return false;localStorage.setItem(ctx.key,raw);return true;}catch{return false;}
}
export function removeLifeAccountValue(key:string):boolean{
 const ctx=context(key);if(!ctx)return false;
 try{if(!ctx.session.isCurrent())return false;localStorage.removeItem(ctx.key);return true;}catch{return false;}
}
