import {AsyncLocalStorage} from 'node:async_hooks';
import {readVerifiedTelegramBinding,telegramBindingRevision,TelegramBindingError} from './telegram-binding-state.mjs';
import {submitVerifiedTelegramBinding} from './telegram-binding-delivery.mjs';
const replies=new AsyncLocalStorage();
// Preserve the owner generation from receipt, not whichever account is linked
// after an expensive reply is computed. This does not authenticate public flows.
export async function withTelegramBindingReplyScope(pool,selector,run){
 const selected=structuredClone(selector),binding=await readVerifiedTelegramBinding(pool,selected);
 return replies.run(binding?{pool,binding:structuredClone(binding)}:null,run);
}
export async function submitScopedTelegramReply(chatId,submit){
 const scope=replies.getStore();if(!scope)return submit();
 return submitVerifiedTelegramBinding(scope.pool,scope.binding,{chatId},submit);
}

export function assertTelegramReplyScopeBinding(binding){
 const scope=replies.getStore();if(scope&&telegramBindingRevision(scope.binding)!==telegramBindingRevision(binding))throw new TelegramBindingError('LINK_GENERATION_CHANGED');
}
export function hasTelegramBindingReplyScope(){return replies.getStore()!==undefined;}
