// Design contract only: no Android source patch, server, build, installation,
// credentials or provider access. Passing it cannot attest runtime isolation.
export function createCheckpointQaContract({commit,origin,applicationId='com.crewcheck.app.qacheckpoint'}={}){
 if(typeof commit!=='string'||!(/^[a-f0-9]{40}$/).test(commit))throw Error('QA_SOURCE_REQUIRED');
 if(applicationId!=='com.crewcheck.app.qacheckpoint')throw Error('QA_DISTINCT_PACKAGE_REQUIRED');
 let url;try{url=new URL(origin);}catch{throw Error('QA_LOOPBACK_ORIGIN_REQUIRED');}
 if(typeof origin!=='string'||url.origin!==origin||!origin.startsWith('http://127.0.0.1:')||url.hostname!=='127.0.0.1'||url.protocol!=='http:'||url.username||url.password||!url.port||Number(url.port)<1024||Number(url.port)>65535)throw Error('QA_LOOPBACK_ORIGIN_REQUIRED');
 return Object.freeze({designOnly:true,runtimeIsolationNotAttested:true,buildOrInstallNotAuthorizedByContract:true,commit,applicationId,proposedVariant:'checkpointQa',origin,entrypoint:origin+'/app?view=exports',recovery:origin+'/app?view=exports',transport:'adb-reverse',nativeBridgeMode:'checkpoint-file-only; other providers disabled',apiMode:'synthetic-503-no-forwarding',releaseSigning:false,storePublication:false,realAccount:false,productionFallback:false});
}
export function allowsQaNetworkUrl(contract,value){
 if(contract?.designOnly!==true||typeof value!=='string')return false;
 try{const url=new URL(value);return url.origin===contract.origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&(value===contract.origin||value.startsWith(contract.origin+'/'));}catch{return false;}
}
// Object URLs are a separate file-download capability, never network authority.
export function allowsQaCheckpointBlob(contract,value){
 if(contract?.designOnly!==true||typeof value!=='string')return false;
 const prefix='blob:'+contract.origin+'/';return value.startsWith(prefix)&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.slice(prefix.length));
}
