export const NOTIFICATION_SETTING_KEYS=['crewcheck_pulse_enabled','crewcheck_telegram_notifications','crewcheck_traffic_alerts','crewcheck_concierge','crewcheck_wakeup_lead_minutes','crewcheck_wakeup_channel','crewcheck_telegram_chat_id','crewcheck_wakeup_phone'];
export function validateNotificationSettings(value){
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!NOTIFICATION_SETTING_KEYS.includes(key)))throw Object.assign(Error('Confira as configurações de notificação.'),{status:400});
 for(const key of NOTIFICATION_SETTING_KEYS.slice(0,4))if(typeof value[key]!=='boolean')throw Object.assign(Error('Confirme as escolhas de notificação.'),{status:400});
 if(![60,75,90,120].includes(value.crewcheck_wakeup_lead_minutes)||!['telegram','telegram-call','ligacao','ambos'].includes(value.crewcheck_wakeup_channel)||typeof value.crewcheck_telegram_chat_id!=='string'||value.crewcheck_telegram_chat_id.length>100||typeof value.crewcheck_wakeup_phone!=='string'||value.crewcheck_wakeup_phone.length>60)throw Object.assign(Error('Confira canal e antecedência do despertador.'),{status:400});
 return Object.fromEntries(NOTIFICATION_SETTING_KEYS.map(key=>[key,value[key]]));
}
