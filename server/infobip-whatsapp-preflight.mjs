import {createInfobipSqlBudget} from './infobip-whatsapp-sql-budget.mjs';

// Caller supplies an already authorized pool. No env, factory, credentials, DDL
// or user-row reads: only the three fixed information_schema SELECTs.
const required={
  crewcheck_telegram_state:['state_key','payload','updated_at'],
  crewcheck_platform_profiles:['email','public_id'],
  crewcheck_whatsapp_links:['email','phone_hash','phone_cipher','consent_concierge','consent_alerts','revoked_at','linked_at','updated_at'],
  crewcheck_whatsapp_link_codes:['email','code_hash','expires_at'],
};
export async function preflightInfobipWhatsAppStorage(db,sqlBudget) {
  await createInfobipSqlBudget(db,sqlBudget)(async c=>{
    const names=Object.keys(required);
    const [tables]=await c.query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(tables.length!==names.length||names.some(name=>!tables.some(row=>row.name===name&&row.engine==='InnoDB')))throw Error('INFOBIP_STORAGE_UNAVAILABLE');
    const [columns]=await c.query('SELECT TABLE_NAME AS name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(names.some(name=>required[name].some(column=>!columns.some(row=>row.name===name&&row.column_name===column))))throw Error('INFOBIP_STORAGE_UNAVAILABLE');
    const [indexes]=await c.query('SELECT TABLE_NAME AS name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS sequence_no FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    // State uniqueness is the durable claim/quota fence. Composite indexes
    // containing state_key alone do not establish uniqueness of state_key.
    const uniqueState=indexes.filter(row=>row.name==='crewcheck_telegram_state'&&Number(row.non_unique)===0);
    if(!uniqueState.some(row=>row.column_name==='state_key'&&Number(row.sequence_no)===1&&uniqueState.filter(other=>other.index_name===row.index_name).length===1))throw Error('INFOBIP_STORAGE_UNAVAILABLE');
  });
}
