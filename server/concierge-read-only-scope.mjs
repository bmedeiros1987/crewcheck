import {AsyncLocalStorage} from 'node:async_hooks';

const scope=new AsyncLocalStorage();
export function withConciergeConversationWritesOnly(email,run) {
 if(typeof email!=='string'||!email||typeof run!=='function')throw Error('CONCIERGE_READ_ONLY_SCOPE');
 return scope.run(Object.freeze({email:email.trim().toLowerCase()}),run);
}
export function isConciergeConversationWritesOnly(profile) {
 const current=scope.getStore();return Boolean(current&&profile?.email?.trim().toLowerCase()===current.email);
}
// Called before either the memory snapshot or persistent snapshot is changed.
// Outside this explicit scope the general engine retains its existing behavior.
export function restrictConciergeSnapshotWrite(profile,roster,metadata) {
 const current=scope.getStore();if(!current)return null;
 if(profile?.email?.trim().toLowerCase()!==current.email)throw Error('CONCIERGE_READ_ONLY_OWNER');
 const conversation=metadata?.preferences?.conciergeConversation;
 return {metadata:roster===null&&conversation&&typeof conversation==='object'&&!Array.isArray(conversation)
   ?{preferences:{conciergeConversation:structuredClone(conversation)}}:null};
}
