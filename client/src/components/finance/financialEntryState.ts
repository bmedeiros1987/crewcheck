// Only opaque session scopes and reading preferences enter browser history.
// Financial rows, amounts, owner identities and tokens never enter this state.
const scopes = new Map<string,string>();
export function financialEntryScope(identity:string):string {
  let scope=scopes.get(identity);
  if(!scope){scope=crypto.randomUUID();if(scopes.size>=32)scopes.clear();scopes.set(identity,scope);}
  return scope;
}
export function clearFinancialEntryScopes(){scopes.clear();}
export type FinancialListPreference={level:string;visible:number};
export function readFinancialListPreference(scope:string,key:string,fallback:string):FinancialListPreference {
  const state=history.state?.ccFinancialLists,stored=state?.scope===scope?state.entries?.[key]:null;
  return {level:['item','day','week','month'].includes(stored?.level)?stored.level:fallback,
    visible:Number.isSafeInteger(stored?.visible)&&stored.visible>=20&&stored.visible<=10000?stored.visible:20};
}
export function writeFinancialListPreference(scope:string,key:string,value:FinancialListPreference){
  const prior=history.state?.ccFinancialLists;
  const entries={...(prior?.scope===scope?prior.entries:{}),[key]:value};
  for(const old of Object.keys(entries).slice(0,-24))delete entries[old];
  history.replaceState({...history.state,ccFinancialLists:{scope,entries}},'');
}
