async function deliverJob(job) {
  const raw = String(job.channel || 'telegram').toLowerCase().trim();
  const aliases = {
    both: 'telegram+phone-call',
    phone: 'phone-call',
    infobip: 'phone-call',
    all: 'telegram+telegram-call+phone-call',
  };
  const normalized = aliases[raw] || raw;
  const channels = [...new Set(normalized.split('+').map((item) => item.trim()).filter(Boolean))];
  const results = [];
  const telegramChannels=channels.filter(channel=>channel==='telegram'||channel==='telegram-call');
  let deliveryBinding=null,proofFailure=false;
  if(telegramChannels.length){
    try{const queued=await readClaimedTelegramQueueJob(await dbPool(),job);deliveryBinding=queued.binding;job={...job,channel:queued.job.channel,chat_id:queued.job.chatId,telegram_username:queued.job.username,message:queued.job.message,scheduled_epoch:queued.job.at};}
    catch{proofFailure=true;}
  }
  const eligible=channels.filter(channel=>{
    if(channel!=='telegram'&&channel!=='telegram-call')return true;
    const valid=deliveryBinding?.chatId && (channel==='telegram'
      ? String(job.chat_id||'')===deliveryBinding.chatId
      : Boolean(job.telegram_username)&&String(job.telegram_username).replace(/^@/,'')===deliveryBinding.username);
    if(!valid)results.push({channel,ok:false,uncertain:proofFailure,blocked:true,reason:proofFailure?'QUEUE_BINDING_REVIEW_REQUIRED':'LINK_DESTINATION_CHANGED'});
    return Boolean(valid);
  });
  if(eligible.length){
    const spoken=await prepareScheduledWakeup(job,{getPool:dbPool});
    if(!spoken.ok)return {...spoken,results};
    job={...job,message:spoken.text};
    var callOptions=spoken.locale?{locale:spoken.locale}:{};
  }


  for (const channel of eligible) {
    try {
      if (channel === 'telegram') {
        results.push({ channel, ...(await sendTelegram(job.chat_id, job.message, deliveryBinding)) });
      } else if (channel === 'telegram-call') {
        results.push({channel,ok:false,uncertain:false,blocked:true,reason:'TELEGRAM_CALL_ADMISSION_REQUIRED'});
      } else if (channel === 'phone-call') {
        results.push({ channel, ...(await sendInfobipPhone(job.phone, job.message, callOptions)) });
      } else {
        results.push({ channel, ok: false, configured: false, raw: 'Canal inválido.' });
      }
    } catch (error) {
      results.push({ channel, ok: false, configured: true, raw: String(error?.message || error) });
    }
  }

  const successful = results.filter((item) => item?.ok);
  return {
    ok: successful.length > 0,
    configured: results.some((item) => item?.configured),
    provider: normalized,
    results,
    raw: successful.length ? '' : results.map((item) => item?.raw || item?.message || item.channel).join(' | '),
  };
}
