import {canonicalWhatsAppChallengeKey,lockCanonicalWhatsAppOwner} from './whatsapp-link-proof.mjs';
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
  if(owner) {
    const result = await owner.erase(email,context);
    await eraseDeletionLinkState(email,context);
    return result;
  }
  // Must run even on an OFF host: another process can own an active engine.
  if(context.client?.dialect==='mysql'){
    const client=context.client;
    if(typeof client.discard!=='function')throw Error('WHATSAPP_REVOCATION_PENDING');
    await createInfobipSqlBudget({getConnection:async()=>({
      async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy:()=>client.discard(),
      async query(sql,params){let index=0;const result=await client.query(sql.replace(/\?/g,()=>`$${++index}`),params);return [result.rows];},
    })})(c=>assertInfobipAccountQuiescent(c,email));
  } else if(context.db){
    await createInfobipSqlBudget(context.db)(async c=>{
      if (context.expectedPublicId !== undefined) await lockCanonicalWhatsAppOwner(c,email,context.expectedPublicId);
      await assertInfobipAccountQuiescent(c,email);
    });
  }
  await eraseDeletionLinkState(email,context);
}

// Account deletion already owns this transaction and profile lock. Keep fence
// erasure in that same transaction so rollback restores the pending challenge.
// Unlink with a pool clears its fence atomically in the authenticated route.
async function eraseDeletionLinkState(email, {client,expectedPublicId} = {}) {
  if (client?.dialect !== 'mysql') return;
  if (typeof client.discard !== 'function') throw Error('WHATSAPP_REVOCATION_PENDING');
  await createInfobipSqlBudget({getConnection:async()=>({
    async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy:()=>client.discard(),
    async query(sql,params){let index=0;const result=await client.query(sql.replace(/\?/g,()=>`$${++index}`),params);return [result.rows];},
  })})(async c => {
    const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
    if (expectedPublicId !== undefined && (owners.length !== 1 || owners[0].public_id !== expectedPublicId)) throw Error('WHATSAPP_IDENTITY_CHANGED');
    if (owners.length !== 1 || !owners[0].public_id) return;
    const optionalMutation = async (table, sql, params) => {
      try { await c.query(sql, params); }
      catch (error) {
        // Metadata can hide a table after privileges are removed. Only an
        // actual missing-table error naming THIS static target is optional;
        // permission/outage errors and missing trigger dependencies must abort.
        const missing = error?.code === 'ER_NO_SUCH_TABLE' && Number(error?.errno) === 1146 &&
          typeof error?.sqlMessage === 'string' && error.sqlMessage.startsWith("Table '") &&
          error.sqlMessage.endsWith(`.${table}' doesn't exist`);
        if (!missing) throw error;
      }
    };
    // OFF hosts must erase the binding too: deleting only a profile could let a
    // new generation at the same email inherit the old phone. No schema repair.
    await optionalMutation('crewcheck_whatsapp_links', 'UPDATE crewcheck_whatsapp_links SET revoked_at=UTC_TIMESTAMP(3),consent_concierge=0,consent_alerts=0,updated_at=UTC_TIMESTAMP(3) WHERE email=?', [email]);
    await optionalMutation('crewcheck_whatsapp_link_codes', 'DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [email]);
    await optionalMutation('crewcheck_telegram_state', 'DELETE FROM crewcheck_telegram_state WHERE state_key=?', [canonicalWhatsAppChallengeKey(owners[0].public_id)]);
  });
}
