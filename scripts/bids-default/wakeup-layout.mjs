import fs from 'node:fs';
const file='client/src/pages/Home.tsx';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function WakeupView('),end=source.indexOf('\nfunction ',start+10);if(start<0||end<0)throw Error('Wakeup presentation boundary missing');
let block=source.slice(start,end);
let card=block.indexOf('<section className="cz-toolbox cz-wakeup-card">'),finish=block.indexOf('</section>',card)+10;
if(card<0||finish<10)throw Error('Wakeup action card missing');
const activate=block.includes('async function activateServerAlarm(')?'activateServerAlarm':'activateServerReminder';
const busy=activate==='activateServerAlarm'?'scheduleBusy':'Boolean(activeTest)';
if(!source.includes("import {WakeupChannelSelection"))source="import {WakeupChannelSelection,type WakeupChannelDecision} from '@/components/notifications/WakeupChannelSelection';\n"+source;
if(!block.includes('const [wakeChannelDecision,')){
 block=block.replace('  const [health, setHealth]',`  const [wakeChannelDecision,setWakeChannelDecision]=useState<WakeupChannelDecision>({ownerId:null,eventId:'',instant:'',ready:false,channel:null,reason:'Escolha ainda não verificada.',channels:[]});
  const [wakeReadiness,setWakeReadiness]=useState<any>(null);
  const wakeInstant=(()=>{try{const value=eventStartDateTime(event);return Number.isFinite(value?.getTime())?value.toISOString():'';}catch{return '';}})();
  const [health, setHealth]`);
 block=block.replace("setScheduledJobs(payload.jobs); setJobsState('ready');","setScheduledJobs(payload.jobs); setWakeReadiness(payload.readiness||null); setJobsState('ready');");
 block=block.replaceAll("setScheduledJobs([]); setJobsState('unavailable');","setScheduledJobs([]); setWakeReadiness(null); setJobsState('unavailable');");
 block=block.replace("setScheduledJobs([]); setHealth(null);","setScheduledJobs([]); setWakeReadiness(null); setHealth(null);");
 block=block.replace("fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json())","authFetch<any>('/api/alarm/health', { cache: 'no-store' })");
 const marker='  async function '+activate+'() {';
 if(!block.includes(marker))throw Error('Alarm activation boundary missing');
 block=block.replace(marker,marker+`
    if(!wakeChannelDecision.ready || wakeChannelDecision.ownerId!==getStoredUser()?.id || wakeChannelDecision.eventId!==event.id || wakeChannelDecision.instant!==wakeInstant)return toast.info(wakeChannelDecision.reason||'Escolha ainda não verificada.');
    const alarmPrefix='wakeup:'+String(event.id).replace(/[^a-zA-Z0-9:_-]+/g,'_')+':';
    if(scheduledJobs.some((job:any)=>job.status==='pending'&&String(job.jobKey||'').startsWith(alarmPrefix)))return toast.info('Este alarme já tem uma solicitação pendente. A escolha salva não altera o servidor; confira o histórico antes de habilitar novamente.');`);

 const activationStart=block.indexOf(marker),activationEnd=block.indexOf('\n  }',activationStart)+4;
 const operation=block.slice(activationStart,activationEnd).replace(/        chatId,\n/, '').replace(/        telegramUsername: storage.get\('crewcheck_telegram_username', ''\),\n/,'').replace(/        phone: admin \? phone : '',\n/,'');
 block=block.slice(0,activationStart)+operation+block.slice(activationEnd);
 if(activate==='activateServerAlarm')block=block.replace('const normalizedChannel = serverChannel();','const normalizedChannel = wakeChannelDecision.channel;');
 else block=block.replace("const serverChannel = channel === 'telegram-call' ? 'telegram-call' : channel === 'ligacao' ? 'phone' : channel === 'ambos' ? 'both' : 'telegram';","const serverChannel = wakeChannelDecision.channel;");
}

block=block.replace(/<KpiCard icon=\{Bell\} title="Canal"[\s\S]*?\/>/,`<KpiCard icon={Bell} title="Meios selecionados" value={wakeChannelDecision.channels.map(value=>value==='phone-call'?'Ligação telefônica':value==='telegram-call'?'Ligação via Telegram':value==='telegram'?'Mensagem Telegram':'A confirmar').join(' + ')||'A confirmar'} detail={wakeChannelDecision.reason}/>`);
block=block.replace('Mensagens Telegram ficam disponíveis para todos; ligações via Telegram respeitam a franquia mensal do plano. O teste telefônico segue exclusivo do administrador.','Confira os meios e a disponibilidade desta conta. Salvar preferência não agenda, confirma entrega ou comprova despertar.');
block=block.replaceAll("'Ligação Telegram disponível'","'Ligação Telegram: configuração consultada; autorização e franquia ainda pendentes'").replace('<span>Fallback local</span>','<span>Entrega não confirmada</span>');
card=block.indexOf('<section className="cz-toolbox cz-wakeup-card">');finish=block.indexOf('</section>',card)+10;
block=block.slice(0,card)+`<section className="cz-toolbox cz-wakeup-card"><h2>Despertador desta programação</h2><p>Revise o horário calculado e o canal antes de ativar. Aceitação pelo provedor não confirma entrega.</p><WakeupChannelSelection eventId={String(event.id||'')} instant={wakeInstant} readiness={wakeReadiness} onDecision={setWakeChannelDecision}/><button className="primary cc-wakeup-primary" onClick={${activate}} disabled={${busy} || !wakeChannelDecision.ready}><Bell/> Ativar despertador</button><p><button className="cc-wakeup-settings-link" onClick={openNotificationSettings}>Menu → Notificações</button></p><details className="cc-wakeup-channel-details"><summary>Detalhes do canal e diagnóstico</summary><p>Os testes abaixo são ações explícitas. Ligações podem consumir a franquia; o teste telefônico permanece exclusivo do administrador.</p><div className="cz-tool-actions"><button onClick={() => testAlarm('telegram-message')} disabled={Boolean(activeTest)}><Send/> Testar Telegram</button><button onClick={() => testAlarm('telegram-call')} disabled={Boolean(activeTest)}><Phone/> Testar ligação via Telegram</button>{admin && <button onClick={() => testAlarm('phone-call')} disabled={Boolean(activeTest)}><Phone/> Testar Infobip Premium</button>}<button onClick={snoozeTelegram}><Clock/> Soneca 10 min</button></div><p>{health?.message || 'Disponibilidade do canal ainda não verificada.'}</p>{admin && <p>{health?.phoneCallMessage || 'Disponibilidade telefônica ainda não verificada.'}</p>}</details></section>`+block.slice(finish);
if(!block.includes('className="cc-wakeup-history"')){
 const history=block.indexOf('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>');
 if(history>=0){const stop=block.indexOf('</section>',history)+10;if(stop<10)throw Error('Wakeup history boundary missing');block=block.slice(0,history)+block.slice(history,stop).replace('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>','<details className="cz-toolbox cc-wakeup-history"><summary>Despertadores no servidor · histórico e pendências</summary>').replace(/<\/section>$/,'</details>')+block.slice(stop);}
}
if(!block.includes('className="cc-wakeup-page"'))block=block.replace('<Brand back/>','<Brand back/><div className="cc-wakeup-page">').replace('</>;','</div></>;');
source=source.replace(source.slice(source.indexOf('function WakeupView('),source.indexOf('\nfunction ',source.indexOf('function WakeupView(')+10)),block);
source=source.replace('deviceSettings={<><NotificationReadiness/>','deviceSettings={<><details className="cc-notification-channels"><summary>Vínculos de canais</summary><p>Vincular é uma ação explícita, distinta de salvar preferências.</p><button onClick={openTelegramBinding}>Vincular Telegram</button><button onClick={openWhatsAppBinding}>Vincular WhatsApp</button></details><NotificationReadiness/>');
fs.writeFileSync(file,source);
