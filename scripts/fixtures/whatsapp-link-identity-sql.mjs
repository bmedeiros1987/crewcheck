import assert from 'node:assert/strict';
export const schemaColumns = {
 crewcheck_telegram_state:['state_key','payload','updated_at'], crewcheck_platform_profiles:['email','public_id'],
 crewcheck_whatsapp_links:['email','phone_hash','phone_cipher','phone_last4','consent_concierge','consent_alerts','revoked_at','linked_at','updated_at'],
 crewcheck_whatsapp_link_codes:['email','code_hash','expires_at'],
};
export const schemaIndexes = Object.entries({crewcheck_telegram_state:['state_key'],crewcheck_platform_profiles:['email','public_id'],crewcheck_whatsapp_links:['email','phone_hash'],crewcheck_whatsapp_link_codes:['email','code_hash']})
 .flatMap(([name,columns])=>columns.map(column_name=>({name,column_name,index_name:column_name,non_unique:0,sequence_no:1,sub_part:null})));
export function schemaResult(sql, {indexes=schemaIndexes}={}) {
 if(sql.includes('information_schema.TABLES'))return [Object.keys(schemaColumns).map(name=>({name,engine:'InnoDB'}))];
 if(sql.includes('information_schema.COLUMNS'))return [Object.entries(schemaColumns).flatMap(([name,columns])=>columns.map(column_name=>({name,column_name})))];
 if(sql.includes('information_schema.STATISTICS'))return [indexes];
}
// Serializable synthetic fixture, not evidence of real MySQL gap-lock behavior.
export function linkIdentityFixture() {
 const state={owners:new Map(),pending:new Map(),links:new Map(),fences:new Map(),indexes:structuredClone(schemaIndexes),queries:[],lostAck:false,failWrite:false,corruptRead:false};
 let tail=Promise.resolve();
 const transaction=run=>{
  const work=tail.then(async()=>{
   const local=structuredClone({owners:state.owners,pending:state.pending,links:state.links,fences:state.fences});
   const c={async query(sql,p=[]){
    state.queries.push(sql);assert(!/CREATE |ALTER |DROP /i.test(sql));
    const schema=schemaResult(sql,state);if(schema)return schema;
    if(sql.startsWith('SELECT public_id'))return [[local.owners.has(p[0])?{public_id:local.owners.get(p[0])}:null].filter(Boolean)];
    if(sql.startsWith('SELECT email FROM crewcheck_whatsapp_link_codes'))return [[...local.pending].filter(([,v])=>v.codeHash===p[0]&&!v.expired).map(([email])=>({email}))];
    if(sql.startsWith('DELETE FROM crewcheck_whatsapp_link_codes')){local.pending.delete(p[0]);return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO crewcheck_whatsapp_link_codes')){if([...local.pending.values()].some(v=>v.codeHash===p[1]))throw Error('ER_DUP_ENTRY');local.pending.set(p[0],{codeHash:p[1]});return [{affectedRows:1}];}
    if(sql.startsWith('SELECT payload'))return [[local.fences.has(p[0])?{payload:local.fences.get(p[0])}:null].filter(Boolean)];
    if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){local.fences.set(p[0],p[1]);return [{affectedRows:1}];}
    if(sql.startsWith('DELETE FROM crewcheck_telegram_state')){local.fences.delete(p[0]);return [{affectedRows:1}];}
    if(sql.startsWith('SELECT email,revoked_at'))return [[...local.links.values()].filter(v=>v.phone_hash===p[0])];
    if(sql.startsWith('SELECT phone_hash'))return [[local.links.get(p[0])].filter(Boolean)];
    if(sql.startsWith('SELECT email,phone_hash')){
     const rows=[...local.links.values()].filter(v=>v.email===p[0]||v.phone_hash===p[1]).map(v=>({...v}));
     if(state.corruptRead==='wrong-owner')rows[0].email='wrong-owner@synthetic.invalid';
     if(state.corruptRead==='wrong-phone')rows[0].phone_hash='wrong-synthetic-phone-hash';
     if(state.corruptRead==='revoked')rows[0].revoked_at='2032-01-01 00:00:00.000';
     if(state.corruptRead==='duplicate')rows.push({...rows[0]});
     if(state.corruptRead==='empty')return [[]];
     return [rows];
    }
    if(sql.startsWith('DELETE FROM crewcheck_whatsapp_links')){for(const [email,row]of local.links)if(row.phone_hash===p[0]&&row.revoked_at!==null)local.links.delete(email);return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE crewcheck_whatsapp_links SET phone_hash')||sql.startsWith('INSERT INTO crewcheck_whatsapp_links')){
     if(state.failWrite)throw Error('SYNTHETIC_WRITE_FAILURE');
     const [email,phone_hash,phone_cipher,phone_last4]=sql.startsWith('UPDATE')?[p[3],p[0],p[1],p[2]]:p;
     if([...local.links.values()].some(v=>v.phone_hash===phone_hash&&v.email!==email))throw Error('ER_DUP_ENTRY');
     if(state.expireAfterWrite)for(const value of local.pending.values())value.expired=true;
     const previous=local.links.get(email);const stamp=new Date(Math.max(Date.parse(previous?.linked_at||'2031-01-01')+1,Date.parse(previous?.updated_at||'2031-01-01')+1,Date.parse('2032-01-01T00:00:00.000Z'))).toISOString().replace('T',' ').replace('Z','');
     local.links.set(email,{linked_at:stamp,updated_at:stamp,email,phone_hash,phone_cipher,phone_last4,revoked_at:null,consent_concierge:1,consent_alerts:0});return [{affectedRows:1}];
    }
    assert.fail('Unexpected link SQL: '+sql);
   }};
   const result=await run(c);Object.assign(state,local);
   if(state.lostAck){state.lostAck=false;throw Error('SYNTHETIC_COMMIT_ACK_LOST');}
   return result;
  });tail=work.catch(()=>{});return work;
 };
 return {state,transaction};
}
