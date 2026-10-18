import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';

// Actual components and auth client; all account/device/network data below are synthetic.
const built=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{NotificationCenter}from'./client/src/components/notifications/NotificationCenter';import{NotificationReadiness}from'./client/src/components/notifications/NotificationReadiness';import{openNotificationSettings}from'./client/src/lib/notificationNavigation';
const root=createRoot(document.getElementById('root'));
function render(view){root.render(view==='notifications'?<NotificationCenter deviceSettings={<NotificationReadiness/>}/>:<section><h1>Configurações</h1><button onClick={()=>render('notifications')}>Notificações</button></section>);}
window.addEventListener('crewcheck:set-view',e=>render(e.detail));
document.getElementById('fixture-back').onclick=()=>render('settings');
document.getElementById('fixture-phone').onclick=()=>openNotificationSettings('phone');
render('notifications');`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'',loader:'js'}));
 b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));
 b.onResolve({filter:/^@shared\//},({path:p})=>({path:path.resolve('shared',p.slice(8))}));
}}]});
const styles=['client/src/components/v139/v139.css','client/src/components/v139/bids-alert-preferences.css','client/src/components/notifications/wakeup-selection.css','client/src/components/notifications/notification-settings.css'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
function setupFixture(){
 const prefs={enabled:false,mode:'manual',preferredTime:'10:30',quietStart:'22:00',quietEnd:'08:00',timezone:'UTC',channels:{all:false,individual:{mobilePwa:true,watch:false,crewCierge:false}}};
 window.qa={writes:[],permissionRequests:0,scenario:'android-denied',failure:false,account:'fixtureA',revision:0,prefs};
 localStorage.setItem('crewcheck_auth_token','fixtureA');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'fixtureA'}));
 Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{}});Object.defineProperty(navigator,'locks',{configurable:true,value:{request:()=>{throw Error('OFF fixture must not acquire push subscription');}}});
 window.confirm=()=>true;window.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=function(){};
 let permission='denied';Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return permission;},requestPermission:async()=>{window.qa.permissionRequests++;return permission;}}});
 window.setFixtureScenario=function(value){window.qa.scenario=value;permission=value==='web-granted'?'granted':'denied';
  if(value.startsWith('android'))window.CrewCheckNative={permissionStatus:()=>({notifications:value!=='android-denied',notificationAppEnabled:true,notificationChannelEnabled:value!=='android-channel-blocked'}),requestNotifications:()=>{window.qa.permissionRequests++;return false;}};
  else {delete window.CrewCheckNative;Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});}
  window.dispatchEvent(new Event('crewcheck:permissions-updated'));window.dispatchEvent(new Event('focus'));
 };
 window.setFixtureScenario('android-denied');
 document.getElementById('fixture-scenario').onchange=e=>window.setFixtureScenario(e.target.value);
 document.getElementById('fixture-theme').onchange=e=>{document.documentElement.dataset.crewTheme=e.target.value;};
 window.fetch=async(url,init={})=>{
  if(!String(url).startsWith('/api/'))throw Error('External network prohibited');
  let value;
  if(String(url).startsWith('/api/platform/notifications/crewcheck-installation'))value={ownerId:window.qa.account,enabled:false,registered:false,revision:0,publicKey:null};
  else if(url==='/api/alarm/scheduled')value={readiness:{telegramConfigured:false,telegramLinked:false},jobs:[]};
  else if(url==='/api/platform/bids/default-window')value={ownerId:window.qa.account,revision:0,profile:null};
  else if(url==='/api/platform/notifications/preferences'){
   if(init.method==='POST'){
    const body=JSON.parse(init.body);window.qa.writes.push(body);
    if(window.qa.failure)return{ok:false,status:503,json:async()=>({message:'Falha sintética ao salvar.'})};
    assertFixture(body.ownerId===window.qa.account,'owner mismatch');window.qa.prefs=body.preferences;window.qa.revision++;
   }
   value={ownerId:window.qa.account,revision:window.qa.revision,preferences:window.qa.prefs,pending:['Fonte oficial','Fuso oficial'],plan:{candidateAt:null},campaign:null,canConfirmAlreadyDid:false,alreadyDid:false,message:init.method==='POST'?'Preferências salvas. Nenhum aviso foi agendado ou enviado.':'Preferências consultadas. Nenhum aviso agendado.'};
  }else throw Error('Unexpected endpoint '+url);
  return{ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(value))};
 };
 function assertFixture(ok,message){if(!ok)throw Error(message);}
}
const html=`<!doctype html><html data-crew-theme="light"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · Notificações CrewCheck</title><style>${styles}
*{box-sizing:border-box}body{margin:0;background:#f4f6f9;color:#183348;font:16px system-ui}main{padding:20px 14px}button,select{font:inherit;min-height:44px}button{cursor:pointer}#fixture-controls{max-width:760px;margin:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px}#fixture-controls select{max-width:100%}#fixture-controls button{background:white;border:1px solid #ccd7e1;border-radius:12px;padding:8px 12px}#fixture-footer{position:fixed;inset:auto 0 0;background:#fff;border-top:1px solid #ccd7e1;padding:20px;text-align:center;height:76px}html[data-crew-theme=dark] body{background:#071322;color:#f4f6fa}html[data-crew-theme=dark] #fixture-footer{background:#122238}
</style><header id="fixture-controls"><button id="fixture-back">Voltar</button><strong>CrewCheck · QA</strong><label>Cenário <select id="fixture-scenario"><option value="android-denied">Android · negada</option><option value="android-channel-blocked">Android · canal bloqueado</option><option value="android-ready">Android · permissão disponível</option><option value="web-denied">Web · negada</option><option value="web-granted">Web · concedida</option></select></label><label>Tema <select id="fixture-theme"><option value="light">Claro</option><option value="dark">Escuro</option></select></label><button id="fixture-phone">Revisar telefone</button></header><main id="root"></main><nav id="fixture-footer">FlightDeck · Escala · Saída · Alertas · Menu</nav><script>(${setupFixture.toString()})();</script><script src="/fixture.js"></script></html>`;
if(process.argv.includes('--serve')){
 const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(built.outputFiles[0].text);}else{res.setHeader('content-type','text/html');res.end(html);}});
 server.listen(4179,'127.0.0.1',()=>console.log('Synthetic notification settings QA: http://127.0.0.1:4179; no external network or real identities'));
}else{
 const {JSDOM}=createRequire(process.env.NOTIFICATIONS_JSDOM_PACKAGE||import.meta.url)('jsdom');
 const dom=new JSDOM(html.replace('<script src="/fixture.js"></script>',''),{url:'https://fixture.invalid',runScripts:'dangerously',pretendToBeVisual:true});
 const w=dom.window;w.eval(built.outputFiles[0].text);
 const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Fixture timeout');};
 const text=()=>w.document.getElementById('root').textContent;
 const button=name=>[...w.document.querySelectorAll('button')].find(e=>(e.getAttribute('aria-label')||e.textContent)===name);
 const summary=name=>[...w.document.querySelectorAll('summary')].find(e=>e.textContent.startsWith(name));
 const input=w.document.querySelector.bind(w.document);
 const visible=e=>!e.closest('details:not([open])');
 try{
  await wait(()=>text().includes('Preferências consultadas.'));
  assert.equal(w.document.querySelectorAll('.cc139-brand').length,0,'no duplicate brand/back header');
  assert.equal(w.qa.permissionRequests,0);assert.equal(w.qa.writes.length,0);for(const help of w.document.querySelectorAll('.cc-notification-help-icon > summary')){assert.equal(help.textContent,'?');assert(help.getAttribute('aria-label')?.startsWith('Ajuda: '),'icon help must have an accessible name');}
  assert(text().includes('Notificações não autorizadas.'));
  assert(text().includes('Push Android indisponível.'));assert(visible([...w.document.querySelectorAll('[role=status]')].find(e=>e.textContent==='Push Android indisponível.')));
  assert(!text().includes('Este navegador não oferece'),'Android does not receive misleading browser diagnosis');
  assert(visible(button('Autorizar notificações')));
  button('Autorizar notificações').click();await wait(()=>w.qa.permissionRequests===1);
  assert(text().includes('Notificações não autorizadas'),'denial never becomes success');
  for(const name of ['Onde receber','Horário e silêncio','Outros avisos e despertador']){assert(summary(name));assert(!summary(name).parentElement.open);}
  const toggle=input('input[aria-label="Quero avisos BIDS quando a janela estiver validada"]');toggle.click();
  assert.equal(w.qa.writes.length,0,'toggle stages draft only');
  summary('Onde receber').click();const all=[...w.document.querySelectorAll('label')].find(e=>e.textContent.trim()==='Todos').querySelector('input');all.click();
  assert.equal(w.qa.writes.length,0);button('Salvar preferências').click();await wait(()=>w.qa.revision===1);
  assert.equal(w.qa.writes[0].preferences.enabled,true);assert.equal(w.qa.writes[0].preferences.channels.all,true);assert.equal(w.qa.writes[0].preferences.preferredTime,'10:30');
  await wait(()=>text().includes('Nenhum aviso foi agendado ou enviado.'));
  w.setFixtureScenario('android-channel-blocked');await wait(()=>text().includes('Canal Alertas CrewCheck bloqueado'));
  assert(visible([...w.document.querySelectorAll('[role=status]')].find(e=>e.textContent.includes('Canal Alertas'))));
  w.setFixtureScenario('android-ready');await wait(()=>text().includes('Permissão disponível.'));
  w.setFixtureScenario('web-denied');await wait(()=>text().includes('Bloqueado no navegador.'));
  assert(!text().includes('Novos alertas do servidor no Android'));
  assert(text().includes('Avisos com app fechado indisponíveis.'));
  assert(!button('Ativar neste aparelho'),'OFF cannot activate from UI');
  w.setFixtureScenario('web-granted');await wait(()=>text().includes('Permissão do navegador concedida.'));
  assert(!button('Ativar neste aparelho'));
  button('Voltar').click();await wait(()=>text().includes('Configurações'));
  button('Notificações').click();await wait(()=>text().includes('Preferências consultadas.'));
  assert.equal(input('input[aria-label="Quero avisos BIDS quando a janela estiver validada"]').checked,true,'saved preference survives return');
  button('Revisar telefone').click();await wait(()=>input('#cc-notification-phone')?.open);assert(summary('Outros avisos e despertador').parentElement.open,'deep-link opens grouped ancestor');
  w.qa.failure=true;button('Salvar preferências').click();await wait(()=>w.qa.writes.length===2);await wait(()=>!button('Salvando…'));
  assert.equal(w.qa.revision,1);assert(!text().includes('Preferências salvas.'),'save failure is not old success');
  localStorageFixture('fixtureB');await wait(()=>text().includes('Preferências consultadas.'));assert(!text().includes('Falha sintética'));assert.equal(input('input[aria-label="Quero avisos BIDS quando a janela estiver validada"]').checked,false,'new account cannot inherit saved toggle');
  assert.equal(w.qa.permissionRequests,1,'no automatic permission prompts');
  console.log('PASS notification settings: grouped actual React controls, staged save, owner reset, denial/channel/web/native states, OFF gate, back/remount, phone deep-link and failed save; no real provider or account access.');
 }finally{dom.window.close();}
 function localStorageFixture(id){w.qa.account=id;w.qa.failure=false;w.qa.prefs={...w.qa.prefs,enabled:false,channels:{all:false,individual:{mobilePwa:false,watch:false,crewCierge:false}}};w.localStorage.setItem('crewcheck_auth_token',id);w.localStorage.setItem('crewcheck_auth_user',JSON.stringify({id}));w.dispatchEvent(new w.Event('crewcheck:auth-changed'));}
}
