import {createInfobipSqlBudget} from './infobip-whatsapp-sql-budget.mjs';

// Caller supplies an already authorized pool. No env, factory, credentials, DDL
// or user-row reads: only the three fixed information_schema SELECTs.
const required={
  crewcheck_telegram_state:['state_key','payload','updated_at'],
  crewcheck_platform_profiles:['email','public_id'],
  crewcheck_whatsapp_links:['email','phone_hash','phone_cipher','consent_concierge','consent_alerts','revoked_at','linked_at','updated_at'],
  crewcheck_whatsapp_link_codes:['email','code_hash','expires_at'],
};
export async function assertCanonicalWhatsAppStorage(c) {
    const names=Object.keys(required);
    const [tables]=await c.query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(tables.length!==names.length||names.some(name=>!tables.some(row=>row.name===name&&row.engine==='InnoDB')))throw Error('INFOBIP_STORAGE_UNAVAILABLE');
    const [columns]=await c.query('SELECT TABLE_NAME AS name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(names.some(name=>required[name].some(column=>!columns.some(row=>row.name===name&&row.column_name===column))))throw Error('INFOBIP_STORAGE_UNAVAILABLE');
    const [indexes]=await c.query('SELECT TABLE_NAME AS name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS sequence_no,SUB_PART AS sub_part FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    // Each identity fence needs its own full-column unique index. A composite
    // index does not establish uniqueness of either constituent column.
    const unique = (name, column) => indexes.some(row => row.name === name &&
      Number(row.non_unique) === 0 && row.column_name === column && Number(row.sequence_no) === 1 &&
      row.sub_part == null && indexes.filter(other => other.name === name && other.index_name === row.index_name).length === 1);
    const fences = {
      crewcheck_telegram_state: ['state_key'],
      crewcheck_platform_profiles: ['email', 'public_id'],
      crewcheck_whatsapp_links: ['email', 'phone_hash'],
      crewcheck_whatsapp_link_codes: ['email', 'code_hash'],
    };
    if (Object.entries(fences).some(([name, columns]) => columns.some(column => !unique(name, column)))) throw Error('INFOBIP_STORAGE_UNAVAILABLE');
}
export async function preflightInfobipWhatsAppStorage(db,sqlBudget) {
  await createInfobipSqlBudget(db,sqlBudget)(assertCanonicalWhatsAppStorage);
}

// Cohort-only addition: existing canonical tables, never DDL or repair. This
// query-only assertion can run inside the prefunder's already-owned client.
export async function assertPaidCohortStorage(c) {
  const [tables]=await c.query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',['crewcheck_platform_subscriptions']);
  if(tables.length!==1||tables[0].name!=='crewcheck_platform_subscriptions'||tables[0].engine!=='InnoDB')throw Error('PAID_STORAGE_UNAVAILABLE');
  const [columns]=await c.query('SELECT TABLE_NAME AS name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?)',['crewcheck_platform_profiles','crewcheck_platform_subscriptions']);
  const required={crewcheck_platform_profiles:['plan'],crewcheck_platform_subscriptions:['email','plan','status','current_period_end','provider','product_id','cancel_at_period_end']};
  if(Object.entries(required).some(([name,fields])=>fields.some(field=>!columns.some(row=>row.name===name&&row.column_name===field))))throw Error('PAID_STORAGE_UNAVAILABLE');
  const [indexes]=await c.query('SELECT TABLE_NAME AS name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS sequence_no,SUB_PART AS sub_part FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',['crewcheck_platform_subscriptions']);
  if(!indexes.some(row=>row.name==='crewcheck_platform_subscriptions'&&row.column_name==='email'&&Number(row.non_unique)===0&&Number(row.sequence_no)===1&&row.sub_part==null&&indexes.filter(other=>other.index_name===row.index_name).length===1))throw Error('PAID_STORAGE_UNAVAILABLE');
}
