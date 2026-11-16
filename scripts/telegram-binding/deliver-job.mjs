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
  let deliveryBinding=null;
  if(telegramChannels.length){
    try{deliveryBinding=await linkedTelegramRecord(await dbPool(),job.email);}catch{}
  }
  const eligible=channels.filter(channel=>{
    if(channel!=='telegram'&&channel!=='telegram-call')return true;
    const valid=deliveryBinding?.chatId && (channel==='telegram'
      ? String(job.chat_id||'')===deliveryBinding.chatId
      : Boolean(job.telegram_username)&&String(job.telegram_username).replace(/^@/,'')===deliveryBinding.username);
    if(!valid)results.push({channel,ok:false,uncertain:false,blocked:true,reason:'LINK_DESTINATION_CHANGED'});
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
        results.push({ channel, ...(await callTelegram(job.telegram_username, job.message, { ...callOptions, binding: deliveryBinding })) });
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
