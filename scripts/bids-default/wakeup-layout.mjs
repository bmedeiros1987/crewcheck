import fs from 'node:fs';
const file='client/src/pages/Home.tsx';let source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function WakeupView('),end=source.indexOf('\nfunction ',start+10);if(start<0||end<0)throw Error('Wakeup presentation boundary missing');
let block=source.slice(start,end);
const card=block.indexOf('<section className="cz-toolbox cz-wakeup-card">'),finish=block.indexOf('</section>',card)+10;
if(card<0||finish<10)throw Error('Wakeup action card missing');
const activate=block.includes('async function activateServerAlarm(')?'activateServerAlarm':'activateServerReminder';
const busy=activate==='activateServerAlarm'?'scheduleBusy':'Boolean(activeTest)';
block=block.slice(0,card)+`<section className="cz-toolbox cz-wakeup-card"><h2>Despertador desta programação</h2><p>Revise o horário calculado e o canal antes de ativar. Aceitação pelo provedor não confirma entrega.</p><button className="primary cc-wakeup-primary" onClick={${activate}} disabled={${busy}}><Bell/> Ativar despertador</button><p><button className="cc-wakeup-settings-link" onClick={openNotificationSettings}>Menu → Notificações</button></p><details className="cc-wakeup-channel-details"><summary>Detalhes do canal e diagnóstico</summary><p>Os testes abaixo são ações explícitas. Ligações podem consumir a franquia; o teste telefônico permanece exclusivo do administrador.</p><div className="cz-tool-actions"><button onClick={() => testAlarm('telegram-message')} disabled={Boolean(activeTest)}><Send/> Testar Telegram</button><button onClick={() => testAlarm('telegram-call')} disabled={Boolean(activeTest)}><Phone/> Testar ligação via Telegram</button>{admin && <button onClick={() => testAlarm('phone-call')} disabled={Boolean(activeTest)}><Phone/> Testar Infobip Premium</button>}<button onClick={snoozeTelegram}><Clock/> Soneca 10 min</button></div><p>{health?.message || 'Disponibilidade do canal ainda não verificada.'}</p>{admin && <p>{health?.phoneCallMessage || 'Disponibilidade telefônica ainda não verificada.'}</p>}</details></section>`+block.slice(finish);
if(!block.includes('className="cc-wakeup-history"')){
 const history=block.indexOf('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>');
 if(history>=0){const stop=block.indexOf('</section>',history)+10;if(stop<10)throw Error('Wakeup history boundary missing');block=block.slice(0,history)+block.slice(history,stop).replace('<section className="cz-toolbox"><h2>Despertadores no servidor</h2>','<details className="cz-toolbox cc-wakeup-history"><summary>Despertadores no servidor · histórico e pendências</summary>').replace(/<\/section>$/,'</details>')+block.slice(stop);}
}
if(!block.includes('className="cc-wakeup-page"'))block=block.replace('<Brand back/>','<Brand back/><div className="cc-wakeup-page">').replace('</>;','</div></>;');
source=source.slice(0,start)+block+source.slice(end);
source=source.replace('deviceSettings={<><NotificationReadiness/>','deviceSettings={<><details className="cc-notification-channels"><summary>Vínculos de canais</summary><p>Vincular é uma ação explícita, distinta de salvar preferências.</p><button onClick={openTelegramBinding}>Vincular Telegram</button><button onClick={openWhatsAppBinding}>Vincular WhatsApp</button></details><NotificationReadiness/>');
fs.writeFileSync(file,source);
