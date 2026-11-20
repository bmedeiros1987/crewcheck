export async function sendTelegram(chatId,text,binding=null){
 const token=telegramToken();if(!token||!chatId)return {ok:false,uncertain:false,configured:Boolean(token),provider:'telegram'};
 return submitVerifiedTelegramBinding(await dbPool(),binding,{chatId},async recipient=>{
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10_000),body:JSON.stringify({chat_id:recipient.chatId,text:String(text).slice(0,3900),disable_web_page_preview:true})});
  const payload=await response.json().catch(()=>({}));return {ok:Boolean(response.ok&&payload.ok===true),uncertain:payload.ok!==false&&!(response.ok&&payload.ok===true),definitiveRejection:payload.ok===false,configured:true,provider:'telegram'};
 });
}
export async function callTelegram(username,text,{locale,binding}={}){
 return submitVerifiedTelegramBinding(await dbPool(),binding,{username},recipient=>sendTelegramWakeupCall({username:recipient.username,text,locale}));
}
