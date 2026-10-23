import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
export const sender='12025550100',recipient='12025550101',other='12025550102';
export const epoch=Date.parse('2032-01-01T12:00:00.000Z');
export const secrets={apiKey:'synthetic-api-key-not-real-0001',encryptionKey:Buffer.alloc(32,7),linkHashKey:'synthetic-link-hash-key-not-real-123456',webhookSecret:'synthetic-hmac-key-not-real-123456'};
export function fixture() {
  const state={rows:new Map(),clock:epoch,queries:[],schemaMissing:false,indexMissing:false,columnMissing:false,
    link:{email:'synthetic@example.invalid',consent_concierge:1,revoked_at:null,linked_at:'2031-01-01 00:00:00',updated_at:'2031-01-01 00:00:00'},owner:'synthetic-owner',failMarker:false,lostAck:false};
  const names={crewcheck_telegram_state:['state_key','payload','updated_at'],crewcheck_platform_profiles:['email','public_id'],crewcheck_whatsapp_links:['email','phone_hash','phone_cipher','consent_concierge','consent_alerts','revoked_at','linked_at','updated_at'],crewcheck_whatsapp_link_codes:['email','code_hash','expires_at']};
  const phoneHash=createHmac('sha256',secrets.linkHashKey).update(recipient).digest('hex');
  let tail=Promise.resolve();
  const db={async getConnection(){let rows,unlock;
    return {async beginTransaction(){const previous=tail;tail=new Promise(r=>unlock=r);await previous;rows=structuredClone(state.rows);},
      async query(sql,p){state.queries.push(sql);assert(!/CREATE|ALTER|DROP|TRUNCATE/i.test(sql),'no DDL');
        if(sql.includes('information_schema.TABLES'))return [Object.keys(names).filter((_,i)=>!state.schemaMissing||i>0).map(name=>({name,engine:'InnoDB'}))];
        if(sql.includes('information_schema.COLUMNS'))return [Object.entries(names).flatMap(([name,columns])=>columns.filter((_,i)=>!state.columnMissing||i>0).map(column_name=>({name,column_name})))];
        if(sql.includes('information_schema.STATISTICS'))return [state.indexMissing?[]:[{name:'crewcheck_telegram_state',index_name:'PRIMARY',column_name:'state_key',non_unique:0,sequence_no:1}]];
        if(sql.startsWith('SELECT email,consent_concierge'))return [[p[0]===phoneHash&&state.link?{...state.link}:null].filter(Boolean)];
        if(sql.startsWith('SELECT public_id'))return [[{public_id:state.owner}]];
        if(sql.startsWith('SELECT payload'))return [[rows.has(p[0])?{payload:JSON.stringify(rows.get(p[0]))}:null].filter(Boolean)];
        if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){if(!rows.has(p[0]))rows.set(p[0],JSON.parse(p[1]));return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=?')){const next=JSON.parse(p[0]);if(state.failCleanup&&next.engineActive===false)throw Error('SYNTHETIC_CLEANUP_FAILURE');if(state.failMarker&&['preparing','dispatching'].includes(next.status))throw Error('SYNTHETIC_ROLLBACK');if(!rows.has(p[1]))return [{affectedRows:0}];rows.set(p[1],next);return [{affectedRows:1}];}
        if(sql.startsWith('SELECT state_key FROM')&&sql.includes('engineActive'))return [[...rows].filter(([k,r])=>k>p[0]&&k<p[1]&&((r.engineActive===true&&r.engineOwner===p[2])||(r.status==='preparing'&&r.engineActive===undefined))).slice(0,1).map(([state_key])=>({state_key}))];
        if(sql.startsWith('SELECT state_key FROM'))return [[...rows].filter(([k,r])=>k>p[0]&&k<p[1]&&r.status==='held').slice(0,1).map(([state_key])=>({state_key}))];
        if(sql.startsWith('SELECT state_key,payload'))return [[...rows].filter(([k])=>k>p[0]&&k<p[1]).sort(([a],[b])=>a.localeCompare(b)).slice(0,p[2]).map(([state_key,payload])=>({state_key,payload:JSON.stringify(payload)}))];
        if(sql.startsWith('DELETE FROM crewcheck_telegram_state')){rows.delete(p[0]);return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE crewcheck_whatsapp_links')){state.link={...state.link,revoked_at:'synthetic-revoked',consent_concierge:0};return [{affectedRows:1}];}
        if(sql.startsWith('DELETE FROM crewcheck_whatsapp_link_codes'))return [{affectedRows:1}];
        if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=JSON_SET')){for(const [k,r]of rows)if(k>p[0]&&k<p[1]&&r.ownerHash===p[2])rows.set(k,{...r,sealed:null,ownerHash:null,report:null,status:['held','preparing','dispatching'].includes(r.status)?'cancelled':r.status});return [{affectedRows:1}];}
        assert.fail('unexpected synthetic SQL: '+sql);
      },
      async commit(){state.rows=rows;if(state.lostAck&&[...rows.values()].some(r=>['preparing','dispatching'].includes(r.status))){state.lostAck=false;throw Error('SYNTHETIC_LOST_ACK');}},
      async rollback(){},release(){unlock?.();unlock=null;},destroy(){this.release();},
    };
  }};
  return {state,db};
}
