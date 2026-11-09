import {assertInfobipAccountQuiescent} from './infobip-whatsapp-quiescence.mjs';
import {createInfobipSqlBudget} from './infobip-whatsapp-sql-budget.mjs';
// No-op until an explicitly enabled composition installs its lifecycle hooks.
// Calls only follow authenticated unlink/deletion, never an inbound identity.
let owner = null;
export function installWhatsAppLifecycle(erase) {
  if (owner || typeof erase !== 'function') throw Error('WHATSAPP_LIFECYCLE_OWNED');
  const token = {erase}; owner = token;
  return () => {if (owner === token) owner = null;};
}
export async function eraseWhatsAppAccountState(email, context={}) {
  if(owner)return owner.erase(email,context);
  // Must run even on an OFF host: another process can own an active engine.
  if(context.client?.dialect==='mysql'){
    const client=context.client;
    if(typeof client.discard!=='function')throw Error('WHATSAPP_REVOCATION_PENDING');
    await createInfobipSqlBudget({getConnection:async()=>({
      async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy:()=>client.discard(),
      async query(sql,params){let index=0;const result=await client.query(sql.replace(/\?/g,()=>`$${++index}`),params);return [result.rows];},
    })})(c=>assertInfobipAccountQuiescent(c,email));
  } else if(context.db){
    await createInfobipSqlBudget(context.db)(c=>assertInfobipAccountQuiescent(c,email));
  }

}
