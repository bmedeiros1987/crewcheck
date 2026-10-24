import {mutateNativeInstallation,NATIVE_PROJECT,NATIVE_PACKAGE} from './registry.mjs';

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
export async function nativeProtocolHost(){return {enabled:false,configured:false,registered:false,received:null};}
