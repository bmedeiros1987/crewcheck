import {telegramBindingSql} from './telegram-binding-sql.mjs';
import crypto from 'node:crypto';

// Existing table only; no DDL, provider or process-local authority. Application
// integration must use the same protocol for every binding writer.
const TABLE='crewcheck_telegram_state',MUTEX='telegram-binding:mutex:v1',TTL=10*60_000;
export class TelegramBindingError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new TelegramBindingError(code);};
const email=value=>{const v=String(value||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||v.length>220)fail('INVALID_BINDING_IDENTITY');return v;};
const chat=value=>{const v=String(value||'');if(!/^[1-9]\d{0,19}$/.test(v))fail('PRIVATE_CHAT_REQUIRED');return v;};
const code=value=>{const v=String(value||'');if(!/^cc_[A-Za-z0-9_-]{12,80}$/.test(v))fail('INVALID_LINK_CODE');return v;};
const decode=value=>{if(typeof value==='string'){try{return JSON.parse(value);}catch{fail('INVALID_BINDING_RECORD');}}if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_BINDING_RECORD');return value;};
const clone=value=>structuredClone(value);
export const telegramBindingRevision=record=>record?JSON.stringify([record.email,record.chatId,record.code||'',record.linkedAt||'',record.bindingId||'',record.accessKeyHash||'',record.ownerId||'']):null;
const metadata=record=>JSON.stringify([record?.metadataVersion||0,record?.username||'',record?.usernameUpdatedAt||'',record?.callMeBotOnboardingVersion||0,record?.callMeBotAuthorizationRequestedAt||'',record?.callMeBotVerifiedAt||'']);
const equal=(a,b)=>Boolean(a&&b&&telegramBindingRevision(a)===telegramBindingRevision(b));
function validateMetadata(record){
 if(record.username!==undefined&&(typeof record.username!=='string'||(record.username&&!/^[A-Za-z0-9_]{5,32}$/.test(record.username))))fail('INVALID_LINK_METADATA');
 for(const field of ['usernameUpdatedAt','callMeBotAuthorizationRequestedAt','callMeBotVerifiedAt'])if(record[field]!==undefined&&(typeof record[field]!=='string'||(record[field]&&!Number.isFinite(Date.parse(record[field])))))fail('INVALID_LINK_METADATA');
 if(record.callMeBotOnboardingVersion!==undefined&&(!Number.isSafeInteger(record.callMeBotOnboardingVersion)||record.callMeBotOnboardingVersion<1||record.callMeBotOnboardingVersion>1000))fail('INVALID_LINK_METADATA');
 if(record.metadataVersion!==undefined&&(!Number.isSafeInteger(record.metadataVersion)||record.metadataVersion<0||record.metadataVersion>=Number.MAX_SAFE_INTEGER))fail('INVALID_LINK_METADATA');
}
function validate(record){validateMetadata(record);if(record.accessKeyHash&&!/^[a-f0-9]{64}$/.test(record.accessKeyHash))fail('INVALID_BINDING_RECORD');if(email(record.email)!==record.email||chat(record.chatId)!==record.chatId||typeof record.code!=='string'||!record.code.startsWith('cc_')||!Number.isFinite(Date.parse(record.linkedAt)))fail('INVALID_BINDING_RECORD');return record;}
async function get(db,key){const[rows]=await db.query(`SELECT state_key,payload FROM ${TABLE} WHERE BINARY state_key=BINARY ?`,[key]);return rows.length?decode(rows[0].payload):null;}
async function put(db,key,value){await db.query(`INSERT INTO ${TABLE}(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)`,[key,JSON.stringify(value)]);}
async function remove(db,key){await db.query(`DELETE FROM ${TABLE} WHERE BINARY state_key=BINARY ?`,[key]);}
async function byField(db,prefix,field,value){if(!['email','chatId'].includes(field))fail('INVALID_BINDING_QUERY');const[rows]=await db.query(`SELECT state_key,payload FROM ${TABLE} WHERE state_key LIKE ? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.${field}'))=?`,[prefix+'%',value]);return rows.map(row=>({key:row.state_key,value:decode(row.payload)}));}
async function transaction(pool,work){
 pool=telegramBindingSql(pool);if(!pool?.getConnection)fail('LINK_STORAGE_UNAVAILABLE');let db;try{db=await pool.getConnection();}catch{fail('LINK_STORAGE_UNAVAILABLE');}let started=false,beginAttempted=false,uncertain=false;
 try{beginAttempted=true;await db.beginTransaction();started=true;await db.query(`INSERT INTO ${TABLE}(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key`,[MUTEX,'{"version":1}']);await db.query(`SELECT state_key FROM ${TABLE} WHERE BINARY state_key=BINARY ? FOR UPDATE`,[MUTEX]);const result=await work(db);try{await db.commit();started=false;}catch{uncertain=true;fail('LINK_COMMIT_UNCERTAIN');}return result;}
 catch(error){if(beginAttempted&&!started&&!uncertain)uncertain=true;if(started&&!uncertain){try{await db.rollback();started=false;}catch{uncertain=true;}}if(uncertain){db.destroy?.();throw new TelegramBindingError('LINK_COMMIT_UNCERTAIN');}throw error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');}
 finally{if(!uncertain)db.release();}
}
async function assertOwner(db,accountEmail,ownerId){
 if(typeof ownerId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(ownerId))fail('INVALID_BINDING_OWNER');const[rows]=await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[accountEmail]);if(rows.length!==1||String(rows[0].public_id)!==ownerId)fail('LINK_ACCOUNT_CHANGED');
}
async function verified(db,{email:requestedEmail,chatId:requestedChat,linkCode}){
 let record=requestedEmail?await get(db,'link-email:'+email(requestedEmail)):requestedChat?await get(db,'link-chat:'+chat(requestedChat)):linkCode?await get(db,'link-code:'+code(linkCode)):null;if(!record){if(requestedChat&&(await byField(db,'link-email:','chatId',chat(requestedChat))).length)fail('LINK_STATE_AMBIGUOUS');if(requestedEmail&&(await byField(db,'link-chat:','email',email(requestedEmail))).length)fail('LINK_STATE_AMBIGUOUS');return null;}validate(record);if(record.ownerId)await assertOwner(db,record.email,record.ownerId);if(requestedEmail&&record.email!==email(requestedEmail))fail('LINK_STATE_AMBIGUOUS');if(requestedChat&&record.chatId!==chat(requestedChat))fail('LINK_STATE_AMBIGUOUS');
 const forward=await get(db,'link-email:'+record.email),reverse=await get(db,'link-chat:'+record.chatId),alias=await get(db,'link-code:'+record.code);if(alias&&(!equal(record,alias)||metadata(record)!==metadata(alias)))fail('LINK_STATE_AMBIGUOUS');if(!equal(record,forward)||!equal(record,reverse)||metadata(record)!==metadata(forward)||metadata(record)!==metadata(reverse))fail('LINK_STATE_AMBIGUOUS');
 const forwards=await byField(db,'link-email:','chatId',record.chatId),reverses=await byField(db,'link-chat:','email',record.email);
 if(forwards.length!==1||reverses.length!==1||!equal(record,forwards[0].value)||!equal(record,reverses[0].value))fail('LINK_STATE_AMBIGUOUS');
 if(linkCode&&record.code!==linkCode)fail('LINK_CODE_REVOKED');return clone(record);
}
export async function readVerifiedTelegramBinding(db,selector){db=telegramBindingSql(db);if(!db?.query)fail('LINK_STORAGE_UNAVAILABLE');try{return await verified(db,selector);}catch(error){throw error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');}}
async function transferState(db,targetEmail,targetChat){
 const own=await get(db,'link-email:'+targetEmail),reverse=await get(db,'link-chat:'+targetChat),atChat=await byField(db,'link-email:','chatId',targetChat),ownReverses=await byField(db,'link-chat:','email',targetEmail);const records=[];
 if(own&&own.email!==targetEmail)fail('INVALID_BINDING_RECORD');if(reverse&&reverse.chatId!==targetChat)fail('INVALID_BINDING_RECORD');
 for(const record of [own,reverse,...atChat.map(x=>x.value),...ownReverses.map(x=>x.value)].filter(Boolean)){validate(record);if(!records.some(x=>equal(x,record)))records.push(record);}
 // Strict keys avoid treating a malformed payload as authority over another row.
 for(const item of atChat)if(item.key!=='link-email:'+item.value.email)fail('INVALID_BINDING_RECORD');for(const item of ownReverses)if(item.key!=='link-chat:'+item.value.chatId)fail('INVALID_BINDING_RECORD');
 const aliases=await Promise.all(records.map(record=>get(db,'link-code:'+record.code)));return {own,reverse,records,fingerprint:JSON.stringify([own,reverse,...atChat.map(x=>x.value),...ownReverses.map(x=>x.value),...aliases].map(record=>record?[telegramBindingRevision(record),metadata(record)]:null).map(x=>JSON.stringify(x)).sort())};
}
export async function createTelegramBindingChallenge(pool,input,{now=Date.now()}={}){
 const target=email(input.email),challenge=code(input.code),name=String(input.name||'').slice(0,160),accessKeyHash=String(input.accessKeyHash||''),allowedChatId=input.allowedChatId?chat(input.allowedChatId):'',ownerId=input.ownerId;if(accessKeyHash&&!/^[a-f0-9]{64}$/.test(accessKeyHash))fail('INVALID_ACCESS_KEY_HASH');if(!Number.isSafeInteger(now))fail('INVALID_LINK_TIME');
 return transaction(pool,async db=>{if(ownerId!==undefined)await assertOwner(db,target,ownerId);for(const key of ['pending:'+challenge,'link-code:'+challenge]){const[collision]=await db.query(`SELECT state_key FROM ${TABLE} WHERE state_key=?`,[key]);if(collision.length)fail('LINK_CODE_COLLISION');}const current=await get(db,'link-email:'+target);if(current){validate(current);if(current.email!==target)fail('INVALID_BINDING_RECORD');}
  // Only this account's outstanding challenges; never erase other accounts.
  for(const row of await byField(db,'pending:','email',target))await remove(db,row.key);
  const pending={version:2,code:challenge,email:target,name,accessKeyHash,...(ownerId!==undefined?{ownerId}:{}),...(allowedChatId?{allowedChatId}:{}),createdAt:new Date(now).toISOString(),expiresAt:now+TTL,expectedEmailRevision:telegramBindingRevision(current)};
  if(await get(db,'pending:'+challenge))fail('LINK_CODE_COLLISION');await put(db,'pending:'+challenge,pending);return {expiresIn:TTL/1000};
 });
}
async function eraseBinding(db,record){
 const current=await get(db,'link-email:'+record.email);if(equal(current,record))await remove(db,'link-email:'+record.email);
 const reverse=await get(db,'link-chat:'+record.chatId);if(equal(reverse,record))await remove(db,'link-chat:'+record.chatId);
 // Revoke aliases for precisely the removed generation, not another current pair.
 for(const row of await byField(db,'link-code:','email',record.email))if(equal(row.value,record))await remove(db,row.key);
}
export async function consumeTelegramBindingChallenge(pool,input,{now=Date.now(),newBindingId=()=>crypto.randomUUID()}={}){
 const challenge=code(input.code),targetChat=chat(input.chatId),confirmed=input.confirmed===true,assertTransferSafe=input.assertTransferSafe,username=String(input.username||'').replace(/^@/,'');if(username&&!/^[A-Za-z0-9_]{5,32}$/.test(username))fail('INVALID_TELEGRAM_USERNAME');if(!Number.isSafeInteger(now))fail('INVALID_LINK_TIME');if(input.chatType!=='private'||String(input.senderId||'')!==targetChat)fail('PRIVATE_CHAT_REQUIRED');
 return transaction(pool,async db=>{
  const pending=await get(db,'pending:'+challenge);if(!pending||pending.version!==2||pending.code!==challenge||!Number.isSafeInteger(pending.expiresAt)||now>=pending.expiresAt||now<Date.parse(pending.createdAt))fail('LINK_CODE_EXPIRED');
  if(pending.allowedChatId&&pending.allowedChatId!==targetChat)fail('LEGACY_CHAT_MISMATCH');const target=email(pending.email);if(pending.ownerId)await assertOwner(db,target,pending.ownerId);const state=await transferState(db,target,targetChat);if(telegramBindingRevision(state.own)!==pending.expectedEmailRevision)fail('LINK_CHALLENGE_STALE');
  let same=Boolean(state.records.length===1&&state.own&&state.reverse&&equal(state.own,state.reverse)&&state.own.email===target&&state.own.chatId===targetChat);if(same){try{same=Boolean(await verified(db,{email:target}));}catch(error){if(error instanceof TelegramBindingError&&error.code==='LINK_STATE_AMBIGUOUS')same=false;else throw error;}}
  const replacing=state.records.length>0&&!same;
  if(pending.confirmChatId&&pending.confirmChatId!==targetChat)fail('LINK_CONFIRMATION_CHAT_MISMATCH');
  if(replacing&&!confirmed){await put(db,'pending:'+challenge,{...pending,confirmChatId:targetChat,confirmRevision:state.fingerprint});return {status:'confirmation_required'};}
  if(replacing&&(pending.confirmChatId!==targetChat||pending.confirmRevision!==state.fingerprint))fail('LINK_CONFIRMATION_STALE');
  if(confirmed&&!pending.confirmChatId&&!same)fail('LINK_CONFIRMATION_REQUIRED');
  if(same){await remove(db,'pending:'+challenge);return {status:'unchanged',binding:clone(state.own)};}
  // In-flight/queued deliveries must be reconciled before application integration
  // enables transfer. Caller admission is deliberately mandatory for replacement.
  if(replacing){if(typeof assertTransferSafe!=='function')fail('LINK_DELIVERY_ADMISSION_REQUIRED');await assertTransferSafe(db,clone(state.records));}
  for(const old of state.records)await eraseBinding(db,old);
  const binding={email:target,name:pending.name,...(pending.ownerId?{ownerId:pending.ownerId}:{}),code:challenge,chatId:targetChat,username,accessKeyHash:pending.accessKeyHash||'',bindingId:newBindingId(),metadataVersion:0,linkedAt:new Date(now).toISOString(),callMeBotOnboardingVersion:2};
  for(const key of ['link-email:'+target,'link-chat:'+targetChat,'link-code:'+challenge])await put(db,key,binding);await remove(db,'pending:'+challenge);return {status:'linked',binding:clone(binding)};
 });
}
export async function updateTelegramBindingMetadata(pool,expected,changes){
 let captured;try{captured=clone(expected);}catch{fail('INVALID_BINDING_RECORD');}validate(captured);const patch={...changes};const allowed=new Set(['username','usernameUpdatedAt','callMeBotOnboardingVersion','callMeBotAuthorizationRequestedAt','callMeBotVerifiedAt']);for(const key of Object.keys(patch))if(!allowed.has(key))fail('LINK_METADATA_FIELD_FORBIDDEN');validateMetadata(patch);
 return transaction(pool,async db=>{const current=await verified(db,{email:captured.email});if(!equal(current,captured))fail('LINK_GENERATION_CHANGED');if(metadata(current)!==metadata(captured))fail('LINK_METADATA_STALE');const updated={...current,...patch,metadataVersion:Number(current.metadataVersion||0)+1};if(updated.username&&!/^[A-Za-z0-9_]{5,32}$/.test(updated.username))fail('INVALID_TELEGRAM_USERNAME');for(const key of ['link-email:'+current.email,'link-chat:'+current.chatId,'link-code:'+current.code])await put(db,key,updated);return clone(updated);});
}

// Operator-only bounded helper, not an HTTP route. No emails, chat IDs, codes,
// hashes, roster data or credentials are returned. Requires two known accounts.
export async function inspectTelegramBindingPair(pool,accounts){
 if(!Array.isArray(accounts)||accounts.length!==2||accounts.some(a=>!['official','gtest'].includes(a?.label))||new Set(accounts.map(a=>a.label)).size!==2)fail('BINDING_DIAGNOSTIC_SCOPE_REQUIRED');
 const selected=accounts.map(a=>({label:a.label,email:email(a.email)}));if(selected[0].email===selected[1].email)fail('DISTINCT_ACCOUNTS_REQUIRED');pool=telegramBindingSql(pool);if(!pool?.getConnection)fail('LINK_STORAGE_UNAVAILABLE');let db;
 try{db=await pool.getConnection();}catch{fail('LINK_STORAGE_UNAVAILABLE');}let uncertain=false;
 try{
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const privateRecords=[],report=[];
  for(const account of selected){const value=await get(db,'link-email:'+account.email);if(!value){privateRecords.push(null);report.push({label:account.label,linked:false,consistent:null});continue;}
   let valid=true;try{validate(value);if(value.email!==account.email)valid=false;if(value.ownerId)await assertOwner(db,value.email,value.ownerId);}catch{valid=false;}
   if(!valid){privateRecords.push(null);report.push({label:account.label,linked:true,consistent:false,reason:'invalid_record'});continue;}
   const reverse=await get(db,'link-chat:'+value.chatId),alias=await get(db,'link-code:'+value.code);
   const[countForward]=await db.query(`SELECT COUNT(*) AS count FROM ${TABLE} WHERE state_key LIKE 'link-email:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.chatId'))=?`,[value.chatId]);
   const[countReverse]=await db.query(`SELECT COUNT(*) AS count FROM ${TABLE} WHERE state_key LIKE 'link-chat:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=?`,[account.email]);
   const consistent=equal(value,reverse)&&equal(value,alias)&&metadata(value)===metadata(reverse)&&metadata(value)===metadata(alias)&&Number(countForward[0]?.count)===1&&Number(countReverse[0]?.count)===1;privateRecords.push(value);report.push({label:account.label,linked:true,consistent:Boolean(consistent)});
  }
  const sameChat=privateRecords.every(Boolean)?privateRecords[0].chatId===privateRecords[1].chatId:null;
  try{await db.commit();}catch{uncertain=true;fail('LINK_READ_RESULT_UNCERTAIN');}return {databaseSnapshotOnly:true,cacheNotAttested:true,sameChat,accounts:report};
 }catch(error){if(!uncertain){try{await db.rollback();}catch{uncertain=true;}}if(uncertain)db.destroy?.();throw error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');}
 finally{if(!uncertain)db.release();}
}

// Durable provider admission. No payload, token or message is stored. Unknown
// outcomes remain blocking; expiry/recovery/retention are intentionally not inferred.
const deliveryId=value=>{const v=String(value||'');if(!/^[a-f0-9-]{36}$/.test(v))fail('INVALID_DELIVERY_ADMISSION');return v;};
export async function admitTelegramBindingDelivery(pool,expected,destination){
 let source,target;try{source=clone(expected);target=clone(destination);}catch{fail('LINK_PROOF_REQUIRED');}
 if(!source?.email||!source?.chatId)fail('LINK_PROOF_REQUIRED');
 return transaction(pool,async db=>{
  const current=await verified(db,{email:source.email});if(!equal(current,source))fail('LINK_GENERATION_CHANGED');
  if(!target||(!target.chatId&&!target.username))fail('LINK_DESTINATION_REQUIRED');
  if((target.chatId&&String(target.chatId)!==current.chatId)||(target.username&&String(target.username).replace(/^@/,'')!==current.username))fail('LINK_DESTINATION_CHANGED');
  if(target.username&&current.callMeBotOnboardingVersion&&!current.callMeBotVerifiedAt)fail('TELEGRAM_CALL_CONSENT_REQUIRED');
  const id=crypto.randomUUID(),record={version:1,id,email:current.email,chatId:current.chatId,generation:crypto.createHash('sha256').update(telegramBindingRevision(current)).digest('hex'),status:'reserved',createdAt:new Date().toISOString()};
  await put(db,'delivery:'+id,record);return {id,binding:clone(current)};
 });
}
export async function finishTelegramBindingDelivery(pool,id,outcome){
 const selected=deliveryId(id);if(!['accepted','rejected','uncertain'].includes(outcome))fail('INVALID_DELIVERY_OUTCOME');
 return transaction(pool,async db=>{const key='delivery:'+selected,current=await get(db,key);if(!current||current.version!==1||current.id!==selected)fail('DELIVERY_ADMISSION_MISSING');
  if(current.status!== 'reserved'){if(current.status===outcome)return;fail('DELIVERY_OUTCOME_CONFLICT');}
  await put(db,key,{...current,status:outcome,finishedAt:new Date().toISOString()});
 });
}
// Called only inside the binding writer's existing mutex transaction. This is
// necessary, not sufficient: legacy queues/writers still require rollout gates.
export async function assertNoAdmittedTelegramDeliveries(db,records){
 for(const record of records){for(const entry of await byField(db,'delivery:','email',record.email)){
  const item=entry.value;if(entry.key!=='delivery:'+item.id||item.version!==1||!['reserved','accepted','rejected','uncertain'].includes(item.status))fail('INVALID_DELIVERY_ADMISSION');
  if(item.status==='reserved'||item.status==='uncertain')fail('LINK_DELIVERY_IN_FLIGHT');
 }}
}
