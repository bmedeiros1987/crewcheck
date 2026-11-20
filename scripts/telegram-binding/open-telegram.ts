async function openTelegramBinding(){
 const session=captureTelegramBindingSession();if(!session.token){toast.message('Entre na sua conta para vincular o Telegram.');return;}
 const identity=telegramConciergeIdentity();if(!session.isCurrent())return;
 try{
  const payload=await telegramBindingAuthFetch<{ok?:boolean;code?:string;link?:string;message?:string}>('/api/telegram/link/start',{method:'POST',body:JSON.stringify(identity)});if(!session.isCurrent())return;
  if(!payload||payload.ok===false){toast.message(payload?.message||'Não foi possível iniciar o vínculo.');return;}
  if(payload.code)storage.set('crewcheck_telegram_link_code',String(payload.code));
  if(payload.link){window.open(String(payload.link),'_blank','noopener,noreferrer');toast.success('Telegram aberto. Confira a confirmação no bot.');return;}
  toast.message(payload.message||'Use o comando gerado no bot do CrewCheck.');
 }catch(error){if(session.isCurrent())toast.error(error instanceof Error?error.message:'Não foi possível iniciar o vínculo.');}
}
