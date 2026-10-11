import crypto from 'node:crypto';
import {requireExistingIdentity,readBody,sendJson,parseJsonColumn} from './common.mjs';
import {bidsCampaignPending,parseBidsInstant,validTimezone} from './bidsAlertPolicy.mjs';
// Only an independently verified, bounded, current source can populate this registry.
// The yearless legacy PBS table is not a policy and is never extrapolated.
export const CURRENT_BIDS_WINDOW_POLICY=null;
export const functionalProfileKey=(email,ownerId)=>'bids-functional-profile:'+crypto.createHash('sha256').update(JSON.stringify([email,ownerId])).digest('hex');
export function resolveDefaultBidsWindow({ownerId,profile,policy=CURRENT_BIDS_WINDOW_POLICY,targetMonth,now=Date.now()}){
 const pending=[],blocked=()=>({status:'pending',pending,window:null,scheduled:false,externalDelivery:false});
 if(!profile||profile.ownerId!==ownerId||profile.source!=='account_confirmation'||!Number.isSafeInteger(profile.revision)||profile.revision<1||parseBidsInstant(profile.confirmedAt)===null||!['route','other','none'].includes(profile.instructorKind)||!['cabin','pilot'].includes(profile.role)||!profile.airline)pending.push('Confirme companhia, função e se é instrutor em rota no perfil desta conta.');
 const source=policy?.source;
 if(policy?.verified!==true||!policy.id||!policy.revision||source?.verified!==true||!source.label||!source.url||!/^https:\/\//.test(source.url)||!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedOn||'')||!/^[a-f0-9]{64}$/.test(source.sha256||'')||parseBidsInstant(source.publishedOn+'T00:00:00Z')===null||parseBidsInstant(policy.validFrom)===null||parseBidsInstant(policy.validUntil)===null||Date.parse(policy.validUntil)<=Date.parse(policy.validFrom)||now<Date.parse(policy.validFrom)||now>=Date.parse(policy.validUntil)||!validTimezone(policy.timezone))pending.push('Calendário vigente com fonte, versão, validade e fuso ainda não verificados.');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth||''))pending.push('Selecione a competência da escala solicitada.');
 if(pending.length)return blocked();
 const candidates=Array.isArray(policy.windows)?policy.windows.filter(w=>w.targetMonth===targetMonth&&w.airline===profile.airline&&w.role===profile.role&&w.instructorKind===profile.instructorKind):[];
 if(candidates.length!==1){pending.push('Não há uma única janela validada para esta competência e perfil.');return blocked();}
 const value=candidates[0],zoned=v=>typeof v==='string'&&/T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v))&&!/T24:/.test(v);
 if(bidsCampaignPending({id:policy.id,revision:policy.revision,source,timezone:policy.timezone,targetMonth,opensAt:value.opensAt,closesAt:value.closesAt,audience:{verified:true,airline:profile.airline,roles:[profile.role]}}).length||!zoned(value.opensAt)||!zoned(value.closesAt)||Date.parse(value.closesAt)<=Date.parse(value.opensAt)||Date.parse(value.closesAt)-Date.parse(value.opensAt)>45*86400000||Date.parse(value.opensAt)<Date.parse(policy.validFrom)||Date.parse(value.closesAt)>Date.parse(policy.validUntil)){pending.push('Instantes explícitos de abertura e encerramento ainda não validados.');return blocked();}
 return {status:'resolved',pending:[],window:{targetMonth,opensAt:value.opensAt,closesAt:value.closesAt,timezone:policy.timezone,policyId:policy.id,policyRevision:policy.revision,source:{label:source.label,url:source.url,sha256:source.sha256,publishedOn:source.publishedOn},profileRevision:profile.revision,profileSource:profile.source,instructorKind:profile.instructorKind},scheduled:false,externalDelivery:false};
}
export async function handleBidsDefaultWindow(req,res,url,{identify=requireExistingIdentity,read=readBody,getPolicy=()=>CURRENT_BIDS_WINDOW_POLICY,clock=()=>Date.now()}={}){
 if(url.pathname!=='/api/platform/bids/default-window')return false;
 res.setHeader('Cache-Control','no-store');const context=await identify(req,res);if(!context)return true;
 const ownerId=context.payload?.sub;if(!ownerId||context.profile?.public_id!==ownerId){sendJson(res,401,{ok:false,message:'Sessão da conta não é mais válida.'});return true;}
 const key=functionalProfileKey(context.email,ownerId),readState=async db=>{const[rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[key]);const state=parseJsonColumn(rows[0]?.payload,null);return state?.ownerId===ownerId&&state.email===context.email?state:null;};
 if(req.method==='GET'){const profile=await readState(context.db);sendJson(res,200,{ok:true,ownerId,profile,revision:profile?.revision||0,resolution:resolveDefaultBidsWindow({ownerId,profile,targetMonth:url.searchParams.get('targetMonth'),policy:getPolicy(),now:clock()})});return true;}
 if(req.method!=='POST'){sendJson(res,405,{ok:false,message:'Método não permitido.'});return true;}
 if(!['https://crewcheck.onrender.com','https://crewcheck.online','https://www.crewcheck.online'].includes(req.headers.origin)){sendJson(res,403,{ok:false,message:'Confirme o perfil no CrewCheck.'});return true;}
 const body=await read(req,5000);if(body?.ownerId!==ownerId){sendJson(res,409,{ok:false,message:'A conta mudou. Recarregue o perfil.'});return true;}if(body?.confirmed!==true||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||!['LATAM','AZUL','GOL','OTHER'].includes(body.airline)||!['cabin','pilot'].includes(body.role)||!['route','other','none'].includes(body.instructorKind)){sendJson(res,400,{ok:false,message:'Confirme companhia, função e condição de instrutor.'});return true;}
 const db=await context.db.getConnection();try{
  await db.beginTransaction();const[owners]=await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[context.email]);if(owners[0]?.public_id!==ownerId)throw Object.assign(Error('Conta mudou. Nada foi salvo.'),{status:401});
  const prior=await readState(db);if((prior?.revision||0)!==body.expectedRevision)throw Object.assign(Error('Perfil atualizado em outra tela. Recarregue antes de revisar.'),{status:409});
  const profile={ownerId,email:context.email,airline:body.airline,role:body.role,instructorKind:body.instructorKind,revision:(prior?.revision||0)+1,source:'account_confirmation',confirmedAt:new Date(clock()).toISOString()};
  await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[key,JSON.stringify(profile)]);await db.commit();sendJson(res,200,{ok:true,ownerId,profile,revision:profile.revision,message:'Perfil desta conta confirmado. Não valida calendário, elegibilidade ou entrega.',resolution:resolveDefaultBidsWindow({ownerId,profile,targetMonth:body.targetMonth,policy:getPolicy(),now:clock()})});
 }catch(error){await db.rollback();sendJson(res,error.status||500,{ok:false,message:error.status?error.message:'Perfil não confirmado. Tente novamente.'});}finally{db.release();}return true;
}
