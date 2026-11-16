// SQL failure/concurrency double; real InnoDB remains a separate mandatory gate.
export function telegramBindingMemory(){
 let rows=new Map(),tail=Promise.resolve(),fault=[];const stats={released:0,destroyed:0,commits:0,rollbacks:0};const clone=x=>structuredClone(x);
 const inject=(tag)=>{if(fault[0]===tag){fault.shift();throw Error('SYNTHETIC_DB_FAILURE');}};
 async function queryIn(data,sql,p=[]){
  if(sql.startsWith('SELECT COUNT(*)')){const prefix=sql.includes("'link-email:%'")?'link-email:':'link-chat:',field=sql.includes("$.chatId")?'chatId':'email';return [[{count:[...data].filter(([key,value])=>key.startsWith(prefix)&&String(value[field])===String(p[0])).length}]];}
  if(sql.startsWith('SELECT state_key,payload')&&sql.includes('WHERE BINARY'))return [[...(data.has(p[0])?[{state_key:p[0],payload:clone(data.get(p[0]))}]:[])]];
  if(sql.startsWith('SELECT state_key FROM')&&sql.includes('WHERE state_key=?'))return [[...data.keys()].filter(k=>k.toLowerCase()===p[0].toLowerCase()).map(state_key=>({state_key}))];
  if(sql.startsWith('SELECT state_key FROM')&&sql.includes('FOR UPDATE'))return [[{state_key:p[0]}]];
  if(sql.startsWith('SELECT state_key,payload')&&sql.includes('LIKE')){const field=sql.match(/\$\.(email|chatId)/)?.[1];if(!field)throw Error('Unexpected synthetic SQL');return [[...data].filter(([key,value])=>key.startsWith(p[0].slice(0,-1))&&String(value[field])===String(p[1])).map(([state_key,payload])=>({state_key,payload:clone(payload)}))];}
  if(sql.startsWith('INSERT INTO')){inject('write:'+p[0].split(':')[0]);data.set(p[0],JSON.parse(p[1]));return [{affectedRows:1}];}
  if(sql.startsWith('DELETE FROM')){inject('delete:'+p[0].split(':')[0]);return [{affectedRows:data.delete(p[0])?1:0}];}
  throw Error('Unexpected synthetic SQL: '+sql);
 }
 const pool={query:(sql,p)=>queryIn(rows,sql,p),async getConnection(){inject('connect');let local,unlock,done=false,readOnly=false;
  const releaseLock=()=>{if(done)return;done=true;unlock?.();};
  return {async beginTransaction(){inject('begin');},async query(sql,p){if(sql.startsWith('SET TRANSACTION'))return [[]];if(sql.startsWith('START TRANSACTION')){readOnly=true;local=clone(rows);return [[]];}if(readOnly&&/^(INSERT|DELETE|UPDATE)/.test(sql))throw Error('Read-only violation');if(sql.startsWith('INSERT INTO')&&p[0]==='telegram-binding:mutex:v1'){const prior=tail;tail=new Promise(resolve=>unlock=resolve);await prior;local=clone(rows);}inject('query');return queryIn(local||rows,sql,p);},async commit(){inject('commit-before');if(!readOnly)rows=local;stats.commits++;inject('commit-after');releaseLock();},async rollback(){stats.rollbacks++;inject('rollback');releaseLock();},release(){stats.released++;releaseLock();},destroy(){stats.destroyed++;releaseLock();}};
 }};
 return {pool,stats,failNext:tag=>{fault=Array.isArray(tag)?[...tag]:[tag];},seed:keyValue=>{for(const[k,v]of Object.entries(keyValue))rows.set(k,clone(v));},state:()=>Object.fromEntries(clone(rows)),clear:()=>{rows=new Map();},seedLink:binding=>{for(const key of ['link-email:'+binding.email,'link-chat:'+binding.chatId,'link-code:'+binding.code])rows.set(key,clone(binding));}};
}
