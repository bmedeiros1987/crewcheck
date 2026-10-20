import { readMenuFavorites } from './menuPreference';
type LocalStorage = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Counts = Record<string,number>;
export const menuUsageKey = (owner:string) => `crewcheck:menu-usage:v1:${encodeURIComponent(owner)}`;
export function readMenuUsage(storage:LocalStorage,owner:string|null|undefined,allowed:readonly string[]):Counts {
  if(!owner) return {};
  try { const raw=JSON.parse(storage.getItem(menuUsageKey(owner)) || '{}'); return Object.fromEntries(allowed.filter(id=>Number.isSafeInteger(raw?.[id]) && raw[id]>0).map(id=>[id,Math.min(raw[id],10000)])); } catch { return {}; }
}
export function recordMenuUse(storage:LocalStorage,owner:string|null|undefined,id:string,allowed:readonly string[]) {
  if(!owner || !allowed.includes(id)) return false;
  try { const counts=readMenuUsage(storage,owner,allowed);counts[id]=Math.min((counts[id]||0)+1,10000);storage.setItem(menuUsageKey(owner),JSON.stringify(counts));return true; }catch{return false;}
}
export function suggestedMenuShortcuts(storage:LocalStorage,owner:string|null|undefined,allowed:readonly string[],limit=5) {
  const fixed=readMenuFavorites(storage,owner,allowed);
  const counts=readMenuUsage(storage,owner,allowed);
  const recent=Object.keys(counts).filter(id=>!fixed.includes(id)).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b));
  return [...fixed,...recent].slice(0,limit);
}
export function resetMenuUsage(storage:LocalStorage,owner:string|null|undefined) {
  if(!owner)return false;try{storage.removeItem(menuUsageKey(owner));return true;}catch{return false;}
}
