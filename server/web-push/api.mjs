import {CREWCHECK_GATE_HOST_ENABLED,changeGateConsent,readGateBinding,GateConsentConflictError} from './gateHost.mjs';
import { requireExistingIdentity, readBody, sendJson, parseJsonColumn } from '../v139/common.mjs';
import { mutateInstallation, revokeAccountInstallations, installationBindingKey } from './installationRegistry.mjs';
import { reconcilePushReceipts } from './outbox.mjs';
import { pushConfiguration } from './config.mjs';
import { configuredTrustedAppOrigin, originAllowed } from '../trusted-app-origin.mjs';
const validId = value => typeof value==='string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value);
export async function handleCrewCheckPush(req,res,url,{identify=requireExistingIdentity,read=readBody,configuration=pushConfiguration,clock=()=>Date.now(),gateHostEnabled=()=>CREWCHECK_GATE_HOST_ENABLED,trustedOrigin=configuredTrustedAppOrigin}={}) {
 if(url.pathname!=='/api/platform/notifications/crewcheck-installation')return false;
 res.setHeader('Cache-Control','no-store');const config=configuration();
 // Cookie authentication cannot authorize a cross-origin subscription/revoke/report. An enabled
 // channel accepts only its own WEB_PUSH_ORIGIN; otherwise the current default plus, when the
 // operator configured one, the exact trusted app origin. Refused before identity, body or SQL.
 if(req.method==='POST'){
  const allowed=config.origin?[config.origin]:['https://crewcheck.onrender.com',trustedOrigin()].filter(Boolean);
  if(!originAllowed(req.headers.origin,allowed)||['cross-site','same-site'].includes(req.headers['sec-fetch-site'])){sendJson(res,403,{ok:false,message:'Confirmação deve ocorrer no CrewCheck.'});return true;}
 }
 const identity=await identify(req,res);if(!identity)return true;
 const ownerId=String(identity.payload?.sub||'');if(!ownerId||identity.profile?.public_id!==ownerId){sendJson(res,401,{ok:false,message:'Sessão inválida.'});return true;}
 if(req.method==='GET'){
  const installationId=url.searchParams.get('installationId');if(!validId(installationId)){sendJson(res,400,{ok:false,message:'Aparelho não identificado.'});return true;}
  const[rows]=await identity.db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[installationBindingKey(ownerId,installationId)]);const binding=parseJsonColumn(rows[0]?.payload,null);
  let state=null;if(binding?.email===identity.email&&binding.ownerId===ownerId&&binding.installationId===installationId&&binding.endpointKey){const[endpoints]=await identity.db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[binding.endpointKey]);const record=parseJsonColumn(endpoints[0]?.payload,null);if(record?.email===identity.email&&record.ownerId===ownerId&&record.installationId===installationId)state=record;}
  const[events]=await identity.db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-outbox:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.envelope.installationId'))=? ORDER BY updated_at DESC LIMIT 10",[identity.email,ownerId,installationId]);
  const eventStates=events.map(row=>parseJsonColumn(row.payload,null)).filter(row=>row?.email===identity.email&&row.ownerId===ownerId&&row.envelope?.installationId===installationId).map(row=>({eventKey:row.envelope.eventKey,status:row.status,deviceReport:row.deviceReport?.status||null,received:null}));
  sendJson(res,200,{ok:true,events:eventStates,enabled:config.enabled===true&&config.configured===true,ownerId,installationId,revision:binding?.revision||0,registered:binding?.active===true&&state?.active===true,publicKey:config.enabled===true&&config.configured===true?config.publicKey:null,subscriptionHash:state&&typeof binding?.endpointKey==='string'&&/^crewcheck-push-installation:[a-f0-9]{64}$/.test(binding.endpointKey)?binding.endpointKey.slice('crewcheck-push-installation:'.length):null,renewalRequired:binding?.active===true&&state?.active===false&&state?.inactiveReason==='expired_subscription',gateBinding:await readGateBinding(identity.db,identity,installationId,{enabled:gateHostEnabled(),clock}),received:null});return true;
 }
 if(req.method!=='POST'){sendJson(res,405,{ok:false,message:'Método não permitido.'});return true;}
 const body=await read(req,20000);if(!validId(body?.installationId)){sendJson(res,400,{ok:false,message:'Aparelho não identificado.'});return true;}
 if(body.action==='gate-consent'){
  if(gateHostEnabled()!==true){sendJson(res,503,{ok:false,code:'GATE_HOST_DISABLED'});return true;}
  let result;
  try{result=await changeGateConsent(identity.db,identity,body,{enabled:true,clock});}
  catch(error){
   // A refused fence asks the device to reload; any other failure is internal and leaks no detail.
   if(error instanceof GateConsentConflictError){sendJson(res,409,{ok:false,code:'GATE_CONSENT_CONFLICT',message:'Aparelho ou consentimento mudou. Recarregue antes de confirmar.'});return true;}
   console.error('[crewcheck:gate-consent]',String(error?.code||error?.name||'GATE_CONSENT_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,80));
   sendJson(res,500,{ok:false,code:'GATE_CONSENT_UNAVAILABLE',message:'Não foi possível registrar agora.'});return true;
  }
  sendJson(res,200,{ok:true,...result});return true;
 }
 const own={email:identity.email,ownerId};
 if(body.action==='revoke'){sendJson(res,200,{ok:true,...await revokeAccountInstallations(identity.db,own,body.installationId,clock())});return true;}
 if(body.action==='receipts'){
  const reports=Array.isArray(body.reports)?body.reports.filter(item=>item.envelope?.installationId===body.installationId):null;
  sendJson(res,200,{ok:true,...await reconcilePushReceipts(identity.db,own,reports)});return true;
 }
 if(body.action!=='subscribe'||config.enabled!==true||config.configured!==true){sendJson(res,503,{ok:false,message:'Avisos neste aparelho ainda não estão disponíveis.'});return true;}
 const result=await mutateInstallation(identity.db,{identity:own,installationId:body.installationId,expectedRevision:body.expectedRevision,action:'subscribe',consent:body.consent,subscription:body.subscription,key:config.encryptionKey,now:clock()});
 sendJson(res,200,{ok:true,ownerId,installationId:result.installationId,consentRevision:result.revision,subscriptionHash:result.subscriptionHash,registered:result.active,received:null});return true;
}
