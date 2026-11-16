import {createNewTelegramQueueJob} from './telegram-binding-queue-adapter.mjs';
import {phoneScheduleCapability} from './notification-job-safety.mjs';
import {createWakeupSpokenEnvelope,isReservedWakeupMessage} from './wakeup-spoken-program.mjs';
const aliases={both:'telegram+phone-call',phone:'phone-call',infobip:'phone-call',all:'telegram+telegram-call+phone-call'};
const allowed=new Set(['telegram','telegram-call','telegram+telegram-call']);
export async function safeBoundScheduleJob({req,res,identity,readJson,dbPool,ensureNotificationTable,linkedTelegramRecord,sendJson}){
 const user=identity(req);if(!user)return sendJson(res,401,{ok:false,message:'Sessão expirada.'});
 const body=await readJson(req);if(!body||typeof body!=='object'||Array.isArray(body))return sendJson(res,400,{ok:false,message:'Solicitação inválida.'});const raw=String(body.scheduledAt||body.scheduled_at||''),at=new Date(raw);
 if(!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)||!Number.isFinite(at.getTime())||at.getTime()<=Date.now())return sendJson(res,400,{ok:false,message:'Informe um horário futuro com fuso.'});
 const requested=String(body.channel||'telegram').trim().toLowerCase(),channel=aliases[requested]||requested;
 const db=await dbPool();if(!db)return sendJson(res,503,{ok:false,message:'Banco indisponível.'});
 const[profiles]=await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? LIMIT 1',[user.email]);
 if(profiles.length!==1||String(profiles[0].public_id)!==String(user.id))return sendJson(res,401,{ok:false,message:'Sessão da conta não é mais válida.'});
 if(channel.split('+').some(c=>['phone-call','phone','infobip','both','all'].includes(c)))return sendJson(res,409,{ok:false,code:'phone_binding_unavailable',message:phoneScheduleCapability().message});
 if(!allowed.has(channel))return sendJson(res,400,{ok:false,message:'Canal inválido.'});
 // Paid-call admission needs a durable plan/quota reservation; configuration alone is not authority.
 if(channel.split('+').includes('telegram-call'))return sendJson(res,409,{ok:false,code:'TELEGRAM_CALL_ADMISSION_REQUIRED',message:'Agendamento de ligação aguarda validação de plano e cota.'});
 await ensureNotificationTable(db);
 let linked;try{linked=await linkedTelegramRecord(db,user.email);}catch{return sendJson(res,409,{ok:false,code:'LINK_BINDING_REVIEW_REQUIRED',message:'Confira o vínculo do Telegram antes de agendar.'});}
 const chatId=String(linked?.chatId||''),username=String(linked?.username||'').replace(/^@/,'');
 if((body.chatId&&String(body.chatId)!==chatId)||(body.telegramUsername&&String(body.telegramUsername).replace(/^@/,'')!==username))return sendJson(res,409,{ok:false,message:'Destinatário não corresponde ao vínculo atual da conta.'});
 if((channel.split('+').includes('telegram')&&!chatId)||(channel.split('+').includes('telegram-call')&&!username))return sendJson(res,400,{ok:false,message:'Vínculo indisponível.'});
 const key=String(body.jobKey||body.job_key||`manual:${at.toISOString()}:${channel}`).slice(0,220);
 if(/^(cycle:|free-day:|operational-briefing:)/i.test(key))return sendJson(res,409,{ok:false,message:'Este alerta exige fonte verificada no servidor.'});
 let message=String(body.message||'Despertador CrewCheck: confira sua preparação no aplicativo.').trim().slice(0,1000);
 if(body.spokenProgram!==undefined&&typeof body.spokenProgram!=='boolean')return sendJson(res,400,{ok:false,message:'Confirme o conteúdo deste alerta.'});
 if(body.spokenProgram===true){
  if(!key.startsWith('wakeup:'))return sendJson(res,400,{ok:false,message:'A programação falada exige um despertador identificado.'});
  try{message=await createWakeupSpokenEnvelope({db,account:user,eventId:body.eventId,scheduledAt:at.getTime()});}catch{return sendJson(res,409,{ok:false,message:'Não foi possível confirmar a programação na escala ativa.'});}
 }else if(isReservedWakeupMessage(message))return sendJson(res,400,{ok:false,message:'Use a escolha explícita de programação.'});
 try{
  const observed=await createNewTelegramQueueJob(db,{email:user.email,ownerId:user.id,job:{key,at:at.getTime(),channel,chatId,username,message}});
  return sendJson(res,200,{ok:true,jobKey:key,scheduledAt:at.toISOString(),channel,status:observed.status,unchanged:!observed.created,message:observed.created?'Solicitação registrada; entrega não confirmada.':'Solicitação já registrada; não foi reativada.'});
 }catch(error){
  const uncertain=error?.code==='LINK_COMMIT_UNCERTAIN'||error?.reconcileSameKeyOnly;const unavailable=['LINK_STORAGE_UNAVAILABLE','QUEUE_UTC_SESSION_REQUIRED'].includes(error?.code);
  return sendJson(res,uncertain||unavailable?503:409,{ok:false,code:uncertain?'QUEUE_RECONCILIATION_REQUIRED':unavailable?'QUEUE_UNAVAILABLE':'QUEUE_REVIEW_REQUIRED',reconcileSameKeyOnly:Boolean(uncertain),message:uncertain?'Resultado não confirmado. Consulte esta solicitação antes de repetir.':unavailable?'Agendamento temporariamente indisponível.':'Confira este alerta antes de agendar novamente.'});
 }
}
