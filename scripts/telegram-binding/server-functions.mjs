// Source snippets for the terminal canonical preparation step; not imported by
// the server. The same real functions are executed by isolated integration tests.
function telegramProfileForChat(message = {}) {
  const chatId=String(message?.chat?.id||'');
  return {email:chatId?`telegram:${chatId}`:'',name:message?.from?.first_name||'Tripulante',chatId,linked:false};
}
async function telegramProfileForChatAsync(message = {}) {
  const cached = { ...telegramProfileForChat(message), channel: 'telegram', chatType: String(message?.chat?.type || '') };
  const base=cached;
  if(!base.chatId)return base;
  const linked=await telegramBindingRuntime.resolveChat(base.chatId);
  assertTelegramReplyScopeBinding(linked);
  return linked?{...base,...linked,channel:base.channel,chatType:base.chatType,linked:true}:base;
}
async function telegramLinkedRecordForEmail(email = '') {
  if(!String(email||'').trim())return null;
  return telegramBindingRuntime.resolveEmail(email);
}
async function handleTelegramLinkStart(req,res) {
  if(req.method!=='POST')return sendJson(res,200,{ok:true,configured:telegramConfigured(),botUsername:telegramBotUsername(),message:'Vínculo Telegram pronto.'});
  const body=await readJsonBody(req,300000),identity=await requireExistingIdentity(req,res);if(!identity)return;
  const user={...telegramRequestUser(req,body),email:identity.email,authenticated:true};
  try{
    let existing=null;try{existing=await telegramLinkedRecordForEmail(user.email);}catch(error){if(!user.authenticated||error?.code!=='LINK_STATE_AMBIGUOUS')throw error;}
    const snapshot=await conciergeLoadSnapshot(user),legacyChatId=String(existing?.chatId||snapshot?.chatId||'');
    const legacyMigration=Boolean(!user.authenticated&&user.accessKeyHash&&legacyChatId&&(!existing?.accessKeyHash||!snapshot?.accessKeyHash));
    if(existing&&!conciergeAccessMatches(user,existing)&&!legacyMigration)return sendJson(res,403,{ok:false,message:'Entre com a conta vinculada para refazer o vínculo.'});
    if(snapshot&&!conciergeAccessMatches(user,snapshot)&&!legacyMigration)return sendJson(res,403,{ok:false,message:'A escala do Concierge está protegida. Entre na conta para continuar.'});
    let challenge,code;for(let attempt=0;attempt<3;attempt++){code=telegramLinkCode();try{challenge=await createTelegramBindingChallenge(await conciergeDbPool(),{code,email:user.email,ownerId:String(identity.profile.public_id),name:user.name,accessKeyHash:user.accessKeyHash||existing?.accessKeyHash||'',allowedChatId:legacyMigration?legacyChatId:''});break;}catch(error){if(error?.code!=='LINK_CODE_COLLISION')throw error;}}
    if(!challenge)throw new TelegramBindingError('LINK_STORAGE_UNAVAILABLE');
    const username=telegramBotUsername(),link=username?`https://t.me/${username}?start=${encodeURIComponent(code)}`:'';
    return sendJson(res,200,{ok:Boolean(link),configured:telegramConfigured(),code,link,botUsername:username,expiresIn:challenge.expiresIn,command:`/start ${code}`,message:'Abra o Telegram e confirme no bot. Um vínculo existente exige confirmação de substituição.'});
  }catch(error){return sendJson(res,503,{ok:false,code:error instanceof TelegramBindingError?error.code:'LINK_STORAGE_UNAVAILABLE',message:'Não foi possível preparar o vínculo com segurança. Nenhum vínculo foi substituído.'});}
}
async function refreshLinkedTelegramUsername(linked = null,data = null) {
  if(!linked)return '';
  const existing=normalizeTelegramUsername(linked.username);if(existing)return existing;
  const expected=structuredClone(linked),discovered=await telegramUsernameFromChat(linked.chatId);if(!discovered)return '';
  const updated=await telegramBindingRuntime.update(expected,{username:discovered,usernameUpdatedAt:new Date().toISOString()});Object.assign(linked,updated);return discovered;
}
async function persistTelegramLinkRecord(linked = null,data = null,expected = null) {
  if(!linked?.email||!linked?.chatId||!expected)throw new TelegramBindingError('LINK_GENERATION_CHANGED');
  const fields=['username','usernameUpdatedAt','callMeBotOnboardingVersion','callMeBotAuthorizationRequestedAt','callMeBotVerifiedAt'];
  const changes=Object.fromEntries(fields.filter(key=>Object.hasOwn(linked,key)).map(key=>[key,linked[key]]));
  const updated=await telegramBindingRuntime.update(expected,changes);Object.assign(linked,updated);return true;
}
async function handleTelegramLinkStatus(req,res,url) {
  const identity=await requireExistingIdentity(req,res);if(!identity)return;const user={...telegramRequestUser(req,{conciergeKey:String(url.searchParams.get('conciergeKey')||'')}),email:identity.email,authenticated:true};
  try{
    // No getChat or metadata persistence in this status read.
    const linked=await telegramLinkedRecordForEmail(user.email);if(linked&&!conciergeAccessMatches(user,linked))return sendJson(res,403,{ok:false,linked:false,message:'Este dispositivo não está autorizado a consultar este vínculo.'});
    const snapshot=await conciergeLoadSnapshot(user);if(snapshot&&!conciergeAccessMatches(user,snapshot))return sendJson(res,403,{ok:false,linked:false,message:'Este dispositivo não está autorizado a consultar a escala vinculada.'});
    const username=normalizeTelegramUsername(linked?.username),legacy=Boolean(username&&linked?.linkedAt&&!linked?.callMeBotOnboardingVersion),ready=Boolean(username&&(linked?.callMeBotVerifiedAt||legacy));
    return sendJson(res,200,{ok:true,linked:Boolean(linked),accountEmail:identity.email,chatId:linked?.chatId||'',username,telegramUsername:username,linkedAt:linked?.linkedAt||'',hasRoster:Boolean(snapshot?.roster),rosterUpdatedAt:snapshot?.updatedAt||'',callMeBotReady:ready,callMeBotLegacyReady:legacy,callMeBotAuthorizationRequested:Boolean(linked?.callMeBotAuthorizationRequestedAt),callMeBotVerifiedAt:linked?.callMeBotVerifiedAt||'',callMeBotAuthorizationUrl:CALLMEBOT_TELEGRAM_BOT_URL,callMeBotMessage:ready?'Ligações via Telegram prontas.':'Autorize o CallMeBot antes de testar ligações.',message:linked?'Telegram vinculado para notificações.':'Telegram ainda não vinculado.'});
  }catch(error){return sendJson(res,503,{ok:false,linked:false,code:error instanceof TelegramBindingError?error.code:'LINK_STORAGE_UNAVAILABLE',message:'Não foi possível confirmar um vínculo único. Nenhuma troca foi realizada por esta consulta.'});}
}
async function telegramTryBindFromWebhook(message = {},text = '') {
  const match=String(text||'').trim().match(/^\/(start|confirmar_vinculo)(?:@\S+)?\s+(cc_[A-Za-z0-9_-]{12,80})\s*$/i);if(!match)return false;
  const chatId=String(message?.chat?.id||'');if(!chatId)return false;
  try{
    const result=await telegramBindingRuntime.consume({code:match[2],chatId,senderId:String(message?.from?.id||''),chatType:String(message?.chat?.type||''),username:normalizeTelegramUsername(message?.from?.username||message?.chat?.username||''),confirmed:match[1].toLowerCase()==='confirmar_vinculo'});
    if(result.status==='confirmation_required'){await sendTelegramMessage(chatId,'Este chat ou a conta já tem vínculo. A transferência encerra a associação anterior. Confirme somente se essa é sua intenção.',{reply_markup:{inline_keyboard:[[{text:'Confirmar substituição',callback_data:'cc_link_confirm:'+match[2]}]]}});return true;}
    // Keep snapshots/preferences scoped to their existing account. Never merge
    // transient chat data into a different account as a side effect of binding.
    await sendTelegramMessage(chatId,'Telegram vinculado. Os dados anteriores de outras contas não foram transferidos.',{reply_markup:conciergeKeyboard});
    if(result.binding.username)await sendTelegramMessage(chatId,'Para ligações, autorize o CallMeBot individualmente nas integrações. Nenhuma ligação foi iniciada.',{reply_markup:callMeBotAuthorizationKeyboard()});return true;
  }catch(error){const reason=error instanceof TelegramBindingError?error.code:'LINK_STORAGE_UNAVAILABLE';const messageText=reason==='LINK_DELIVERY_ADMISSION_REQUIRED'?'Transferência bloqueada até verificar alertas e envios existentes. Nenhum vínculo foi substituído.':reason==='PRIVATE_CHAT_REQUIRED'?'Use o chat privado do bot para vincular sua conta.':reason==='LINK_COMMIT_UNCERTAIN'?'Não consegui confirmar o resultado. Não repita a troca automaticamente; verifique o vínculo antes de continuar.':'Não foi possível confirmar esse vínculo com segurança. Gere um novo código no CrewCheck.';await sendTelegramMessage(chatId,messageText);return true;}
}
