import {consumeTelegramBindingChallenge,readVerifiedTelegramBinding,updateTelegramBindingMetadata,TelegramBindingError} from './telegram-binding-state.mjs';

// Dependency-injected adapter. This module does not install routes or touch a
// cache unless its caller supplies one. Cache contents never grant identity.
const safeError=error=>error instanceof TelegramBindingError?error:new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');
export function createTelegramBindingRuntime({pool,readCache=()=>({pending:{},linked:{}}),writeCache=()=>{}}){
 function invalidate({email,chatId,code}={}){
  try{const cache=readCache();let changed=false;for(const[key,value]of Object.entries(cache.linked||{})){if((email&&value?.email===email)||(chatId&&String(value?.chatId)===String(chatId))||(code&&value?.code===code)){delete cache.linked[key];changed=true;}}
   if(code&&cache.pending&&Object.hasOwn(cache.pending,code)){delete cache.pending[code];changed=true;}if(changed)writeCache(cache);
  }catch{/* Cache failure cannot turn into binding authority or undo SQL. */}
 }
 async function resolve(selector){
  try{return await readVerifiedTelegramBinding(await pool(),selector);}
  catch(error){invalidate({...selector,code:selector.linkCode});throw safeError(error);}
 }
 return {
  async resolveChat(chatId){return resolve({chatId:String(chatId)});},
  async resolveEmail(email){return resolve({email:String(email).trim().toLowerCase()});},
  async resolveCode(linkCode){return resolve({linkCode});},
  async consume(input,options){
   const request={...input};
   try{const result=await consumeTelegramBindingChallenge(await pool(),request,options);if(result.status!=='confirmation_required')invalidate({email:result.binding?.email,chatId:request.chatId,code:request.code});return result;}
   catch(error){invalidate({chatId:request.chatId,code:request.code});throw safeError(error);}
  },
  async update(expected,changes){const initial={email:expected?.email,chatId:expected?.chatId};try{return await updateTelegramBindingMetadata(await pool(),expected,changes);}catch(error){throw safeError(error);}finally{invalidate(initial);}},
 };
}
