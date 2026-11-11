import {mutateNativeInstallation,readNativeInstallation,NATIVE_PROJECT,NATIVE_PACKAGE,createNativeRegistryPlatformAdapter} from './registry.mjs';
import {createHash} from 'node:crypto';
import {requireExistingIdentity,safeEmail} from '../v139/common.mjs';
import {mysqlAdapter} from '../mysql-platform-adapter.mjs';

// Unmounted protocol only. This module neither obtains authority nor enables I/O.
const fail=()=>{throw Object.assign(new Error('NATIVE_PROTOCOL_INVALID'),{code:'NATIVE_PROTOCOL_INVALID',status:400});};
const counter=(value,increment=false)=>{
  if(typeof value==='string') {
    if(!/^(0|[1-9][0-9]{0,15})$/.test(value))fail();
    value=Number(value);
  }
  if(!Number.isSafeInteger(value)||value<0||(increment&&value===Number.MAX_SAFE_INTEGER))fail();
  return value;
};
const identifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(value);
export function nativeProtocolMutation(identity,body) {
  if(!identity||!identifier(identity.ownerId)||typeof identity.email!=='string'||!identity.email.includes('@'))fail();
  if(!body||typeof body!=='object'||Array.isArray(body))fail();
  const allowed=new Set(['action','projectId','package','installationId','mutationId','expectedRevision','expectedConsentRevision','generation','tokenRevision','consent','token']);
  if(Object.keys(body).some(key=>!allowed.has(key))||body.projectId!==NATIVE_PROJECT||body.package!==NATIVE_PACKAGE
    ||!identifier(body.installationId)||!identifier(body.mutationId)||!['register','rotate','revoke'].includes(body.action))fail();
  const input={identity:{ownerId:identity.ownerId,email:identity.email},action:body.action,project:NATIVE_PROJECT,package:NATIVE_PACKAGE,
    installationId:body.installationId,mutationId:body.mutationId,expectedRevision:counter(body.expectedRevision,true),
    expectedConsentRevision:counter(body.expectedConsentRevision,body.action!=='rotate'),generation:counter(body.generation),tokenRevision:counter(body.tokenRevision)};
  if(input.generation<1||input.tokenRevision<1)fail();
  if(body.action==='register'&&body.consent!==true)fail();
  if(body.action!=='register'&&body.consent!==undefined&&body.consent!==false)fail();
  input.consent=body.action==='register';
  if(body.action!=='revoke') {
    if(typeof body.token!=='string'||body.token.length<20||body.token.length>4096||/[\x00-\x20\x7f]/.test(body.token))fail();
    input.token=body.token;
  }else if(body.token!==undefined)fail();
  return input;
}
export function nativeProtocolAcknowledgement(input,result) {
  const active=input.action!=='revoke';
  if(!result||result.registryConfirmed!==true||result.received!==null||typeof result.duplicate!=='boolean'
    ||result.installationId!==input.installationId||result.generation!==input.generation||result.tokenRevision!==input.tokenRevision
    ||result.revision!==input.expectedRevision+1||result.consentRevision!==input.expectedConsentRevision+(input.action==='rotate'?0:1)
    ||result.active!==active)fail();
  return {registered:active,revoked:!active,registryConfirmed:true,installationId:result.installationId,
    generation:result.generation,tokenRevision:result.tokenRevision,revision:result.revision,consentRevision:result.consentRevision,
    mutationId:input.mutationId,duplicate:result.duplicate,received:null};
}
// A future authenticated route must supply its independently verified identity,
// protection adapter and durable request ID. Never retry an uncertain commit here.
export async function applyNativeProtocolMutation(db,identity,body,options) {
  const input=nativeProtocolMutation(identity,body);
  return nativeProtocolAcknowledgement(input,await mutateNativeInstallation(db,input,options));
}
// Supplies CAS revisions from the canonical owner scope. This is a registry
// receipt, not device delivery or permission to reuse another session's result.
export async function readNativeProtocolInstallation(db,identity,installationId) {
  const result=await readNativeInstallation(db,identity,installationId);
  if(result.registryConfirmed!==true||result.received!==null||result.installationId!==installationId
    ||typeof result.active!=='boolean')fail();
  const revision=counter(result.revision),consentRevision=counter(result.consentRevision);
  const output={installationId,revision,consentRevision,registered:result.active,registryConfirmed:true,received:null};
  if(revision===0) {
    if(consentRevision!==0||result.active||result.generation!==undefined||result.tokenRevision!==undefined)fail();
  }else {
    output.generation=counter(result.generation);output.tokenRevision=counter(result.tokenRevision);
    if(output.generation<1||output.tokenRevision<1||consentRevision<1)fail();
  }
  return output;
}
export async function nativeProtocolHost(){return {enabled:false,configured:false,registered:false,received:null};}

export const NATIVE_REGISTRY_PATH='/api/platform/notifications/android-installation';
const hostError=(code,status)=>Object.assign(new Error(code),{code,status});
const responseUnavailable=res=>res.destroyed===true||res.writableEnded===true||res.headersSent===true;
const requestCancelled=(req,res)=>req.aborted===true||(req.destroyed===true&&req.complete===false)||responseUnavailable(res);
const sendHost=(res,status,value)=>{
  if(responseUnavailable(res))return false;
  // A failed write cannot undo SQL or justify a second response/automatic retry.
  try{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));return true;}catch{return false;}
};
async function nativeHostBody(req,live){
  const chunks=[];let size=0;
  for await(const chunk of req){live();const bytes=Buffer.from(chunk);size+=bytes.length;if(size>16384)throw hostError('NATIVE_INPUT_TOO_LARGE',413);chunks.push(bytes);}
  live();
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw hostError('NATIVE_INVALID_JSON',400);}
}
const publicErrors=new Set(['NATIVE_PROTOCOL_INVALID','NATIVE_IDENTITY_REQUIRED','NATIVE_INVALID_INSTALLATION','NATIVE_INVALID_MUTATION','NATIVE_INVALID_TOKEN','NATIVE_OWNER_HINT_MISMATCH','NATIVE_REGISTRY_STATE_INVALID','NATIVE_TOKEN_CLAIM_INVALID','NATIVE_TOKEN_CLAIM_CHANGED','NATIVE_MUTATION_REUSED','NATIVE_REVISION_CHANGED','NATIVE_STALE_GENERATION','NATIVE_GENERATION_REVOKED','NATIVE_TOKEN_VERSION_REUSED','NATIVE_ROTATION_STALE','NATIVE_EXPLICIT_CONSENT_REQUIRED','NATIVE_TOKEN_ALREADY_BOUND','NATIVE_SESSION_REVOKED','NATIVE_PROTECTION_INVALID','NATIVE_PROTECTION_FAILED','NATIVE_INPUT_TOO_LARGE','NATIVE_INVALID_JSON','NATIVE_AUTH_REQUIRED','NATIVE_ORIGIN_REQUIRED','NATIVE_JSON_REQUIRED','NATIVE_INVALID_QUERY','NATIVE_REGISTRY_LIMITED','NATIVE_INGRESS_LIMITED','NATIVE_IDENTITY_CHANGED','NATIVE_HOST_UNCONFIGURED']);
/** Unmounted composition only. Default OFF precedes authority/body/DB I/O.
 * Identity, admission and protection must come from independently trusted server
 * adapters. This factory never verifies an owner hint, obtains a key or creates
 * a pool; no environment flag or current router invokes it.
 */
export function createNativeRegistryAuthenticatedHandler({enabled=false,admitIngress,identityProvider,isIdentityCurrent,admitRequest,poolProvider,protectionProvider,allowedOrigin}={}){
  if(typeof enabled!=='boolean')throw hostError('NATIVE_HOST_UNCONFIGURED',503);
  return async(req,res,url)=>{
    if(url.pathname!==NATIVE_REGISTRY_PATH)return false;
    if(responseUnavailable(res))return true;
    if(!enabled){sendHost(res,503,{ok:false,code:'NATIVE_REGISTRY_OFF',state:'disabled',registryConfirmed:false,received:null});return true;}
    let cancelled=false;
    const live=()=>{if(cancelled||requestCancelled(req,res)){cancelled=true;throw hostError('NATIVE_REQUEST_CANCELLED',503);}};
    const waitLive=async value=>{const result=await value;live();return result;};
    try{
      live();
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');sendHost(res,405,{ok:false,code:'METHOD_NOT_ALLOWED',registryConfirmed:false,received:null});return true;}
      if([admitIngress,identityProvider,isIdentityCurrent,admitRequest,poolProvider,allowedOrigin].some(fn=>typeof fn!=='function'))throw hostError('NATIVE_HOST_UNCONFIGURED',503);
      // No cookie-only or development email/header fallback for enrollment.
      if(!/^Bearer\s+\S+$/i.test(req.headers.authorization||''))throw hostError('NATIVE_AUTH_REQUIRED',401);
      const origin=await waitLive(allowedOrigin());let trusted=false;
      try{const u=new URL(origin);trusted=u.protocol==='https:'&&u.origin===origin&&!u.username&&!u.password;}catch{}
      if(!trusted||(req.headers.origin&&req.headers.origin!==origin)||(req.method==='POST'&&req.headers.origin!==origin))throw hostError('NATIVE_ORIGIN_REQUIRED',403);
      // Separate trusted ingress budget from authenticated-owner admission.
      // No verifier/key/profile work starts without an explicit ingress grant.
      if(await waitLive(admitIngress(req))!==true)throw hostError('NATIVE_INGRESS_LIMITED',429);
      const authority=await waitLive(identityProvider(req));
      if(authority?.authenticated!==true||authority.role!=='owner'||!identifier(authority.ownerId)||typeof authority.email!=='string'||authority.email.length>254||!authority.email.includes('@'))throw hostError('NATIVE_AUTH_REQUIRED',401);
      const captured=Object.freeze({...authority}),identity=Object.freeze({ownerId:captured.ownerId,email:captured.email});
      if(await waitLive(isIdentityCurrent(req,captured))!==true)throw hostError('NATIVE_IDENTITY_CHANGED',401);
      if(await waitLive(admitRequest(req,captured))!==true)throw hostError('NATIVE_REGISTRY_LIMITED',429);
      const query=[...url.searchParams];let body,installationId,protection;
      if(req.method==='GET'){
        if(query.length!==1||query[0][0]!=='installationId'||!identifier(query[0][1]))throw hostError('NATIVE_INVALID_QUERY',400);
        installationId=query[0][1];
      }else{
        if(query.length)throw hostError('NATIVE_INVALID_QUERY',400);
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw hostError('NATIVE_JSON_REQUIRED',415);
        body=await waitLive(nativeHostBody(req,live));nativeProtocolMutation(identity,body);
        if(body.action!=='revoke'){
          if(typeof protectionProvider!=='function')throw hostError('NATIVE_HOST_UNCONFIGURED',503);
          protection=await waitLive(protectionProvider());
          if(typeof protection?.seal!=='function')throw hostError('NATIVE_HOST_UNCONFIGURED',503);
        }
      }
      if(await waitLive(isIdentityCurrent(req,captured))!==true)throw hostError('NATIVE_IDENTITY_CHANGED',401);
      const platformDb=await waitLive(poolProvider());
      if(await waitLive(isIdentityCurrent(req,captured))!==true)throw hostError('NATIVE_IDENTITY_CHANGED',401);
      const {registryDb}=createNativeRegistryPlatformAdapter(platformDb);
      const receipt=await waitLive(req.method==='GET'?readNativeProtocolInstallation(registryDb,identity,installationId):applyNativeProtocolMutation(registryDb,identity,body,{protection}));
      // A mutation may already be durable. A late revoked/replaced scope gets no
      // ACK; the client's fixed mutation ID must reconcile any uncertainty.
      if(await waitLive(isIdentityCurrent(req,captured))!==true)throw hostError('NATIVE_IDENTITY_CHANGED',401);
      sendHost(res,200,{ok:true,...receipt});
    }catch(error){
      if(cancelled||requestCancelled(req,res))return true;
      const known=publicErrors.has(error?.code),status=known&&[400,401,403,409,413,415,429,503].includes(error.status)?error.status:503;
      sendHost(res,status,{ok:false,code:known?error.code:'NATIVE_REGISTRY_UNAVAILABLE',state:'unconfirmed',registryConfirmed:false,received:null});
    }
    return true;
  };
}

/** Existing-account authority composition, still OFF/unmounted. It never uses
 * ensureProfile or a caller's email/owner hint. The existing auth helper alone
 * verifies the bearer and supplies its current canonical profile and pool.
 */
export function createNativeRegistryExistingIdentityHandler({enabled=false,identify=requireExistingIdentity,admitIngress,admitRequest,protectionProvider,allowedOrigin,clock=()=>Date.now()}={}){
  return async(req,res,url)=>{
    let currentDb;
    const readAuthority=async()=>{
      let rejectedStatus=503;
      // Do not let the auth helper write a second HTTP response or disclose its
      // diagnostic message. The outer boundary emits only safe protocol codes.
      const sink={setHeader(){},writeHead(status){rejectedStatus=status;},end(){}};
      const context=await identify(req,sink);
      if(!context)throw hostError(rejectedStatus===401?'NATIVE_AUTH_REQUIRED':'NATIVE_HOST_UNCONFIGURED',rejectedStatus===401?401:503);
      const {payload,profile,db}=context,now=clock(),email=safeEmail(context.email);
      if(!Number.isFinite(now)||typeof db?.getConnection!=='function'||typeof db.query!=='function')throw hostError('NATIVE_HOST_UNCONFIGURED',503);
      if(currentDb&&currentDb!==db)throw hostError('NATIVE_IDENTITY_CHANGED',401);
      if(!email||payload?.iss!=='crewcheck'||payload.aud!=='crewcheck-web'||payload.role==='visitor'
        ||payload.mustChangePassword!==false||![false,0].includes(profile?.must_change_password)
        ||typeof payload.exp!=='number'||!Number.isFinite(payload.exp)||payload.exp*1000<=now
        ||!identifier(payload.sub)||profile?.public_id!==payload.sub||safeEmail(payload.email)!==email||safeEmail(profile?.email)!==email)throw hostError('NATIVE_AUTH_REQUIRED',401);
      currentDb=db;
      return Object.freeze({authenticated:true,role:'owner',ownerId:payload.sub,email,
        sessionFingerprint:createHash('sha256').update(req.headers.authorization).digest('hex')});
    };
    return createNativeRegistryAuthenticatedHandler({enabled,allowedOrigin,admitIngress,admitRequest,protectionProvider,
      identityProvider:readAuthority,
      isIdentityCurrent:async(_request,captured)=>{
        const fresh=await readAuthority();return ['ownerId','email','sessionFingerprint'].every(key=>fresh[key]===captured[key]);
      },
      poolProvider:()=>mysqlAdapter(currentDb),
    })(req,res,url);
  };
}
