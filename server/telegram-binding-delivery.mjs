import {admitTelegramBindingDelivery,finishTelegramBindingDelivery,TelegramBindingError} from './telegram-binding-state.mjs';

// Admission is committed before the provider is invoked. A crash or uncertain
// provider/finalization outcome stays blocking. No automatic retry or expiry.
// Transfer remains disabled until legacy queues and all local transports adopt
// the protocol; this helper does not prove receipt or stop caller-level retries.
export async function submitVerifiedTelegramBinding(db,expected,destination,submit){
 let admission;
 try{admission=await admitTelegramBindingDelivery(db,expected,destination);}
 catch(error){return {ok:false,uncertain:error?.code==='LINK_COMMIT_UNCERTAIN',blocked:true,reason:error instanceof TelegramBindingError?error.code:'LINK_STORAGE_UNAVAILABLE'};}
 let result;try{result=await submit({chatId:admission.binding.chatId,username:admission.binding.username});}
 catch{result={ok:false,uncertain:true,reason:'TELEGRAM_OUTCOME_UNKNOWN'};}
 const outcome=result?.uncertain?'uncertain':result?.ok===true?'accepted':result?.ok===false&&result?.definitiveRejection===true?'rejected':'uncertain';
 try{await finishTelegramBindingDelivery(db,admission.id,outcome);}
 catch{return {ok:false,uncertain:true,reason:'DELIVERY_FINALIZATION_UNCERTAIN'};}
 return outcome==='uncertain'?{...result,ok:false,uncertain:true}:result;
}
