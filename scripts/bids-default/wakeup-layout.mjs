import fs from 'node:fs';
const file='client/src/pages/Home.tsx';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function WakeupView('),end=source.indexOf('\nfunction ',start+10);if(start<0||end<0)throw Error('Wakeup presentation boundary missing');
if(!source.includes("import {WakeDiagnostic}"))source="import {WakeDiagnostic} from '@/components/notifications/WakeDiagnostic';\n"+source;
let block=source.slice(source.indexOf('function WakeupView('),source.indexOf('\nfunction ',source.indexOf('function WakeupView(')+10));
let card=block.indexOf('<section className="cz-toolbox cz-wakeup-card">'),finish=block.indexOf('</section>',card)+10;
if(card<0||finish<10)throw Error('Wakeup action card missing');
const activate=block.includes('async function activateServerAlarm(')?'activateServerAlarm':'activateServerReminder';
const busy=activate==='activateServerAlarm'?'scheduleBusy':'Boolean(activeTest)';
if(!source.includes("import {WakeupChannelSelection"))source="import {WakeupChannelSelection,type WakeupChannelDecision} from '@/components/notifications/WakeupChannelSelection';\n"+source;
if(!block.includes('const [wakeChannelDecision,')){
 block=block.replace('  const [health, setHealth]',`  const [wakeChannelDecision,setWakeChannelDecision]=useState<WakeupChannelDecision>({ownerId:null,eventId:'',instant:'',ready:false,channel:null,reason:'Escolha ainda não verificada.',channels:[]});
  const [wakeReadiness,setWakeReadiness]=useState<any>(null);
  const wakeJobsReady=useRef(false);
  const wakeInstant=(()=>{try{const value=eventStartDateTime(event);return Number.isFinite(value?.getTime())?value.toISOString():'';}catch{return '';}})();
  const [health, setHealth]`);
 block=block.replace("setScheduledJobs(payload.jobs); setJobsState('ready');","setScheduledJobs(payload.jobs); wakeJobsReady.current=true; setWakeReadiness(payload.readiness||null); setJobsState('ready');");
 block=block.replace('async function refreshScheduledJobs() {','async function refreshScheduledJobs() { wakeJobsReady.current=false;');
 block=block.replaceAll("setScheduledJobs([]); setJobsState('unavailable');","setScheduledJobs([]); wakeJobsReady.current=false; setWakeReadiness(null); setJobsState('unavailable');");
 block=block.replace("setScheduledJobs([]); setHealth(null);","setScheduledJobs([]); wakeJobsReady.current=false; setWakeReadiness(null); setHealth(null);");
 block=block.replace("fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json())","authFetch<any>('/api/alarm/health', { cache: 'no-store' })");
 const marker='  async function '+activate+'() {';
 if(!block.includes(marker))throw Error('Alarm activation boundary missing');
 block=block.replace(marker,marker+`
    if(jobsState!=='ready'||!wakeJobsReady.current)return toast.info('Consulte os alarmes pendentes antes de habilitar. Aguarde a consulta ou reconecte.');
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
block=block.slice(0,card)+`<section className="cz-toolbox cz-wakeup-card"><h2>Despertador desta programação</h2><p>Revise o horário calculado e o canal antes de ativar. Aceitação pelo provedor não confirma entrega.</p><WakeupChannelSelection eventId={String(event.id||'')} instant={wakeInstant} readiness={wakeReadiness} onDecision={setWakeChannelDecision}/><button className="primary cc-wakeup-primary" onClick={${activate}} disabled={${busy} || jobsState!=='ready' || !wakeChannelDecision.ready}><Bell/> Ativar despertador</button><p><button className="cc-wakeup-settings-link" onClick={openNotificationSettings}>Menu → Notificações</button></p><details className="cc-wakeup-channel-details"><summary>Detalhes do canal e diagnóstico</summary><p>Os testes abaixo são ações explícitas. Ligações podem consumir a franquia; o teste telefônico permanece exclusivo do administrador.</p><div className="cz-tool-actions"><button onClick={() => testAlarm('telegram-message')} disabled={Boolean(activeTest)}><Send/> Testar Telegram</button><button onClick={() => testAlarm('telegram-call')} disabled={Boolean(activeTest)}><Phone/> Testar ligação via Telegram</button>{admin && <button onClick={() => testAlarm('phone-call')} disabled={Boolean(activeTest)}><Phone/> Testar Infobip Premium</button>}<button onClick={snoozeTelegram}><Clock/> Soneca 10 min</button></div><p>{health?.message || 'Disponibilidade do canal ainda não verificada.'}</p>{admin && <p>{health?.phoneCallMessage || 'Disponibilidade telefônica ainda não verificada.'}</p>}</details></section>`+block.slice(finish);
if(!block.includes('className="cc-wakeup-history"')){
 const history=block.indexOf('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>');
 if(history>=0){const stop=block.indexOf('</section>',history)+10;if(stop<10)throw Error('Wakeup history boundary missing');block=block.slice(0,history)+block.slice(history,stop).replace('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>','<details className="cz-toolbox cc-wakeup-history"><summary>Despertadores no servidor · histórico e pendências</summary>').replace(/<\/section>$/,'</details>')+block.slice(stop);}
}
if(!block.includes('className="cc-wakeup-page"'))block=block.replace('<Brand back/>','<Brand back/><div className="cc-wakeup-page">').replace('</>;','</div></>;');
if(!block.includes('<WakeDiagnostic/>'))block=block.replace('<WakeupChannelSelection ', '<WakeDiagnostic/><WakeupChannelSelection ');
// Keep the existing generated WakeupView and its account/session fences. This is
// its final presentation and receipt boundary, not a second route or scheduler.
if (activate==='activateServerAlarm') {
 if(!source.includes("import {WakeClockOptions}")) source="import {WakeClockOptions} from '@/components/notifications/WakeClockOptions';\n"+source;
 if(!source.includes("import {WakeupSimpleCard}")) source="import {WakeupSimpleCard} from '@/components/notifications/WakeupSimpleCard';\n"+source;
 if(!source.includes("import {wakeCivilDate")) source="import {wakeCivilDate,wakeDateFields,wakePlanConflict,wakeReceiptConfirmed,wakeReceiptState,wakeNextConfirmed} from '@shared/wakeupPlan.mjs';\n"+source;
 block=block.replace('  const [health, setHealth]',`  const [wakeDraft,setWakeDraft]=useState<any>(null);
  const [wakeJobsOwner,setWakeJobsOwner]=useState<string|null>(null);
  const wakeSubmitting=useRef<{generation:number;operation:number}|null>(null);
  const wakeOperation=useRef(0);
  const [wakeNow,setWakeNow]=useState(()=>Date.now());
  useEffect(()=>{const clock=window.setInterval(()=>setWakeNow(Date.now()),30000);return()=>window.clearInterval(clock);},[]);
  const [health, setHealth]`);
 block=block.replace('  const planned = (() => {','  const scalePlanned = (() => {');
 const editor=`  const scaleFields=wakeDateFields(scalePlanned);
  const wakeOwner=getStoredUser()?.id;
  const wakeEditor=wakeDraft && Boolean(wakeOwner) && wakeDraft.ownerId===wakeOwner?wakeDraft:{ownerId:wakeOwner,automatic:true,directMessage:true,...scaleFields};
  const planned=wakeEditor.automatic?scalePlanned:wakeCivilDate(wakeEditor.day,wakeEditor.time);
  const wakeScopeId=wakeEditor.automatic?String(event.id||''):'manual:'+wakeEditor.day;
  const wakeScopeInstant=wakeEditor.automatic?wakeInstant:(planned?.toISOString()||'');
  const wakePrefix='wakeup:'+wakeScopeId.replace(/[^a-zA-Z0-9:_-]+/g,'_')+':';
  const wakeJobsCurrent=Boolean(wakeOwner) && wakeJobsOwner===wakeOwner;
  const wakeSnapshot=wakeNextConfirmed(scheduledJobs,jobsState,wakeNow);
  const wakeConflict=wakePlanConflict(scheduledJobs,wakePrefix);
  const wakeChannelReason=wakeChannelDecision.channels.length>1?'Escolha um canal em Mais opções. Telegram e ligação juntos ainda não estão disponíveis.':wakeChannelDecision.channels[0]==='phone-call'?'Agendamento de ligação ainda não liberado nesta tela. O teste manual é separado.':wakeChannelDecision.reason;
  const wakeScopeReady=wakeChannelDecision.ownerId===wakeOwner && wakeChannelDecision.eventId===wakeScopeId && wakeChannelDecision.instant===wakeScopeInstant;
  const wakeReason=(!wakeJobsCurrent||jobsState!=='ready'||wakeSnapshot.kind==='unavailable')?'Estado do servidor não confirmado. Atualize antes de ativar.':wakeConflict?'Já existe uma solicitação para esta programação. Consulte o histórico em Mais opções.':!planned?'Confira um horário e uma data válidos. Horários ambíguos de mudança de fuso exigem a opção pela escala.':planned.getTime()<=wakeNow?'O horário escolhido já passou. Escolha outro dia ou horário.':!wakeScopeReady?'Escolha do canal ainda não verificada.':!wakeChannelDecision.ready?wakeChannelReason:wakeEditor.directMessage===false?'Nenhum envio selecionado. O alarme local e a ligação automática ainda não estão liberados nesta tela.':'';
  function editWake(patch:any) {
    if(wakeSubmitting.current)return;
    setWakeDraft({...wakeEditor,...(wakeEditor.automatic?scaleFields:{}),...patch,ownerId:getStoredUser()?.id});
    setWakeNow(Date.now());
  }
`;
 block=block.replace('  const hotel =',editor+'  const hotel =');
 block=block.replace("if (!owner) { setJobsState('unavailable'); return; }", "if (!owner || navigator.onLine===false) { setJobsState('unavailable'); return; }");
 block=block.replace('    const onStorage = (event: StorageEvent)', "    const onOffline=()=>{jobsRequest.current++;wakeJobsReady.current=false;setScheduledJobs([]);setJobsState('unavailable');setScheduleBusy(false);};\n    window.addEventListener('offline',onOffline);\n    const onStorage = (event: StorageEvent)");
 block=block.replace("      window.removeEventListener('storage', onStorage);", "      window.removeEventListener('storage', onStorage);\n      window.removeEventListener('offline',onOffline);");
 // A successful read returns the same account-bound snapshot used by the page.
 block=block.replace('const version = wakeSession.current, owner = getToken(), request = ++jobsRequest.current;', 'const version = wakeSession.current, owner = getToken(), ownerId=getStoredUser()?.id, request = ++jobsRequest.current;');
 block=block.replaceAll('!sameWakeSession(version, owner) || jobsRequest.current !== request', '!sameWakeSession(version, owner) || jobsRequest.current !== request || ownerId!==getStoredUser()?.id');
 block=block.replace("setWakeReadiness(payload.readiness||null); setJobsState('ready');","setWakeReadiness(payload.readiness||null); setJobsState('ready'); setWakeJobsOwner(ownerId||null); setWakeNow(Date.now()); return payload.jobs;");
 block=block.replace('  async function activateServerAlarm() {',`  async function activateServerAlarm() {
    if(wakeSubmitting.current)return;
    if(wakeReason)return toast.info(wakeReason);`);
 block=block.replace('wakeChannelDecision.eventId!==event.id || wakeChannelDecision.instant!==wakeInstant','wakeChannelDecision.eventId!==wakeScopeId || wakeChannelDecision.instant!==wakeScopeInstant');
 block=block.replace("const alarmPrefix='wakeup:'+String(event.id).replace(/[^a-zA-Z0-9:_-]+/g,'_')+':';","const alarmPrefix=wakePrefix;");
 block=block.replace('    setScheduleBusy(true);\n    try {\n      const normalizedChannel', '    const submission={generation:version,operation:++wakeOperation.current};\n    wakeSubmitting.current=submission;\n    setScheduleBusy(true);\n    try {\n      const normalizedChannel');
 const begin=block.indexOf('  async function activateServerAlarm()'), finish=block.indexOf('\n  async function cancelScheduledJob',begin);
 let action=block.slice(begin,finish);
 action=action.replace("const eventKey = [event.id, programDateLabel(event), presentation, lead, normalizedChannel].join(':').replace(/[^a-zA-Z0-9:_-]+/g, '_');", "const eventKey = wakeEditor.automatic?[event.id, programDateLabel(event), presentation, lead, normalizedChannel].join(':').replace(/[^a-zA-Z0-9:_-]+/g, '_'):wakeScopeId+':'+planned.getTime()+':'+normalizedChannel;");
 action=action.replace("      const payload = await postCrewCheckJson('/api/alarm/schedule', {",'      const request = {');
 action=action.replace("        message: 'Despertador CrewCheck: confira sua preparação no aplicativo.',\n      });", "        message: 'Despertador CrewCheck: confira sua preparação no aplicativo.',\n      };\n      const payload = await postCrewCheckJson('/api/alarm/schedule',request);");
 action=action.replace('      await refreshScheduledJobs();','      const confirmationRead=refreshScheduledJobs();\n      const confirmationSequence=jobsRequest.current;\n      const confirmedJobs=await confirmationRead;');
 action=action.replace("      window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success(payload?.message || 'Solicitação registrada no servidor; entrega não confirmada.');", "      if(confirmedJobs===undefined && confirmationSequence!==jobsRequest.current)return toast.info('Consulta de confirmação substituída por uma atualização mais recente. Confira o estado atual na tela.');\n      if(!wakeReceiptConfirmed(request,payload,confirmedJobs)) { const receiptState=wakeReceiptState(request,payload,confirmedJobs); if(receiptState==='unconfirmed')return toast.error('Não foi possível confirmar este agendamento. Consulte o estado antes de tentar novamente.'); return toast.info(receiptState==='terminal'?'Registro persistido já encerrado. Consulte o status real no histórico.':receiptState==='uncertain'?'Registro persistido com resultado não confirmado. Consulte o histórico antes de tentar novamente.':receiptState==='sending'?'Registro persistido com envio em andamento; entrega não confirmada.':'Registro persistido com horário passado; envio não confirmado.'); }\n      window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));\n      toast.success('Registro confirmado no servidor. Recebimento ainda não confirmado.');");
 action=action.replace('    } finally {','    } finally {\n      if(wakeSubmitting.current===submission)wakeSubmitting.current=null;');
 if(!action.includes('wakeReceiptConfirmed(request,payload,confirmedJobs)') || !action.includes('const payload = await postCrewCheckJson'))throw Error('Wake receipt boundary not materialized');
 block=block.slice(0,begin)+action+block.slice(finish);
 // Identity change invalidates the old latch; its finally owns only its own operation.
 block=block.replace('wakeIdentity.current = {token:owner,userId};','wakeIdentity.current = {token:owner,userId}; wakeSubmitting.current=null;');
 // Refresh on return to the page; this is a GET, never an activation or retry.
 block=block.replaceAll("'crewcheck:auth-expired', 'online']","'crewcheck:auth-expired', 'online', 'focus']");
 const historyStart=block.indexOf('<details className="cz-toolbox cc-wakeup-history">'),historyEnd=block.indexOf('</details>',historyStart)+10;
 if(historyStart<0||historyEnd<10)throw Error('Existing Wake history missing');
 const history=block.slice(historyStart,historyEnd);
 const returnStart=block.indexOf('  return <><Brand back/>');
 if(returnStart<0)throw Error('Existing Wake return missing');
 block=block.slice(0,returnStart)+`  return <><Brand back/><div className="cc-wakeup-page"><StayNavigationContext targetView="wakeup"/><section className="cz-panel-head"><h1>Despertador</h1></section>
    <WakeupSimpleCard automatic={wakeEditor.automatic} day={wakeEditor.day||''} time={wakeEditor.time||''} onEdit={editWake} planned={planned} jobs={wakeJobsCurrent?scheduledJobs:[]} jobsState={wakeJobsCurrent?jobsState:jobsState==='unavailable'?'unavailable':'loading'} now={wakeNow} reason={wakeReason} busy={scheduleBusy} onActivate={activateServerAlarm} onRefresh={refreshScheduledJobs}>
      <WakeClockOptions messageSelected={wakeEditor.directMessage!==false&&wakeChannelDecision.channels.includes('telegram')} messageAvailable={wakeScopeReady&&wakeChannelDecision.ready&&wakeChannelDecision.channel==='telegram'} onMessageChange={selected=>editWake({directMessage:selected})} busy={scheduleBusy} planned={planned}/>
      <section aria-label="Ajustes da escala"><h2>Automático pela escala</h2><p>{programDateLabel(event)} · apresentação {presentation} · {hotel}</p><label>Antecedência da escala<select value={lead} onChange={event=>setLead(event.target.value)} disabled={scheduleBusy}>{[60,75,90,120].map(value=><option key={value} value={String(value)}>{value} minutos</option>)}</select></label><p>Este ajuste vale para a próxima solicitação; não altera alarmes salvos.</p></section>
      <section aria-label="Canal deste alarme"><h2>Canal</h2><p>{wakeChannelDecision.channels.map(value=>value==='phone-call'?'Ligação telefônica':value==='telegram-call'?'Ligação via Telegram':value==='telegram'?'Mensagem Telegram':'A confirmar').join(' + ')||'A confirmar'}</p><WakeupChannelSelection eventId={wakeScopeId} instant={wakeScopeInstant} readiness={wakeReadiness} onDecision={setWakeChannelDecision}/><button type="button" onClick={openNotificationSettings}>Menu → Notificações</button></section>
      ${history}
      <details><summary>Diagnóstico da conta</summary><WakeDiagnostic/><NotificationReadiness/></details>
      <details className="cc-wakeup-channel-details"><summary>Testes e soneca</summary><p>São ações separadas. Ligações podem consumir a franquia.</p><div className="cz-tool-actions"><button onClick={()=>testAlarm('telegram-message')} disabled={Boolean(activeTest)}>Testar Telegram</button><button onClick={()=>testAlarm('telegram-call')} disabled={Boolean(activeTest)}>Testar ligação via Telegram</button>{admin&&<button onClick={()=>testAlarm('phone-call')} disabled={Boolean(activeTest)}>Testar Infobip Premium</button>}<button onClick={snoozeTelegram}>Soneca 10 min</button></div></details>
    </WakeupSimpleCard></div></>;
}
`;
}
source=source.replace(source.slice(source.indexOf('function WakeupView('),source.indexOf('\nfunction ',source.indexOf('function WakeupView(')+10)),block);
source=source.replace('deviceSettings={<><NotificationReadiness/>','deviceSettings={<><details className="cc-notification-channels"><summary>Vínculos de canais</summary><p>Vincular é uma ação explícita, distinta de salvar preferências.</p><button onClick={openTelegramBinding}>Vincular Telegram</button><button onClick={openWhatsAppBinding}>Vincular WhatsApp</button></details><NotificationReadiness/>');
fs.writeFileSync(file,source);
