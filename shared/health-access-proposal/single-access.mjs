// OFF contract: no route, token generation, DB, NFC writing or permission change.
// Integration MUST persist one row per owner and CAS revision inside a transaction.
export function transitionHealthAccess(current, command) {
 if(!command?.ownerId||!Number.isInteger(command.expectedRevision)||command.expectedRevision<0)throw Error('INVALID_OWNER_REVISION');
 const revision=current?.revision||0;
 if(current&&current.ownerId!==command.ownerId)throw Error('OWNER_MISMATCH');
 if(command.expectedRevision!==revision)throw Error('REVISION_CONFLICT');
 if(command.type==='revoke'){if(!current)throw Error('NOT_FOUND');return {...current,revision:revision+1,status:'revoked'};}
 if(command.type!=='replace'||!command.tokenFingerprint||command.tokenFingerprint===current?.tokenFingerprint)throw Error('ROTATION_REQUIRED');
 const at=Date.parse(command.now);if(!Number.isFinite(at))throw Error('INVALID_TIME');
 if(!['never','at'].includes(command.expiryMode))throw Error('EXPLICIT_EXPIRY_CHOICE_REQUIRED');
 const expiry=Date.parse(command.expiresAt);
 if(command.expiryMode==='at'&&(!Number.isFinite(expiry)||expiry<=at))throw Error('INVALID_EXPIRY');
 if(command.expiryMode==='never'&&command.expiresAt!==null)throw Error('INVALID_EXPIRY');
 if(!Array.isArray(command.fields)||!command.fields.length||new Set(command.fields).size!==command.fields.length||!command.fields.every(x=>['displayName','bloodType','allergies','medications','conditions','criticalNotes','contactName','contactPhone'].includes(x)))throw Error('INVALID_FIELDS');
 return {ownerId:command.ownerId,revision:revision+1,status:'active',tokenFingerprint:command.tokenFingerprint,expiryMode:command.expiryMode,expiresAt:command.expiryMode==='never'?null:command.expiresAt,fields:[...command.fields]};
}
export function canOpenHealthAccess({enabled=false,record,tokenFingerprint,now}={}) {
 const at=Date.parse(now);return Boolean(enabled===true&&record?.status==='active'&&record.tokenFingerprint&&record.tokenFingerprint===tokenFingerprint&&Number.isFinite(at)&&((record.expiryMode==='never'&&record.expiresAt===null)||(record.expiryMode==='at'&&Number.isFinite(Date.parse(record.expiresAt))&&Date.parse(record.expiresAt)>at)));
}
export function healthNdefPreview(url) {
 const parsed=new URL(url);
 if(parsed.origin!=='https://crewcheck.online'||parsed.pathname!=='/guardian'||[...parsed.searchParams].length!==1||!parsed.searchParams.get('token')||parsed.hash)throw Error('INVALID_HEALTH_LINK');
 return {recordType:'url',data:parsed.href}; // Same URI as QR; no additional grant or token.
}
