import fs from 'node:fs';

const runtimePath = 'server/telegram-fast-ack.mjs';
let runtime = fs.readFileSync(runtimePath, 'utf8');
const importLine = "import { prepareScheduledWakeup, wakeupPrivateModelSupportsLocale } from './wakeup-spoken-program.mjs';";
if (!runtime.includes(importLine)) runtime = importLine + '\n' + runtime;
const start = runtime.indexOf('async function deliverJob(job) {'), end = runtime.indexOf('\nfunction commuteRouteKey(', start);
if (start < 0 || end < start) throw Error('Wakeup script delivery boundary missing');
let delivery = runtime.slice(start, end);
if (!delivery.includes('const spoken = await prepareScheduledWakeup')) delivery = delivery.replace('async function deliverJob(job) {', `async function deliverJob(job) {
  const spoken = await prepareScheduledWakeup(job, { getPool: dbPool });
  if (!spoken.ok) return spoken;
  job = { ...job, message: spoken.text };
  const callOptions = spoken.locale ? { locale: spoken.locale } : {};
`);
delivery = delivery.replaceAll('callTelegram(job.telegram_username, job.message)', 'callTelegram(job.telegram_username, job.message, callOptions)');
delivery = delivery.replaceAll('sendInfobipPhone(job.phone, job.message)', 'sendInfobipPhone(job.phone, job.message, callOptions)');
fs.writeFileSync(runtimePath, runtime.slice(0, start) + delivery + runtime.slice(end));

const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
const consentImport="import {useWakeupSpokenConsent} from '@/components/notifications/useWakeupSpokenConsent';";
if(!home.includes(consentImport))home=consentImport+'\n'+home;
const wakeStart = home.indexOf('function WakeupView('), wakeEnd = home.indexOf('function PresentationManagerView', wakeStart);
let wake = home.slice(wakeStart, wakeEnd);
if (!wake.includes('const wakeEditor=')) throw Error('Prepared canonical wakeup editor missing');
if (!wake.includes('const spokenConsent=')) {
  wake=wake.replace(/  const spokenScope=[\s\S]*?const spokenProgram=[^\n]*;\n/, '');
  const anchor = '  const planned=wakeEditor.automatic?scalePlanned:wakeCivilDate(wakeEditor.day,wakeEditor.time);';
  if (!wake.includes(anchor)) throw Error('Wakeup clock ownership boundary missing');
  wake = wake.replace(anchor, anchor + `
  const spokenConsent=useWakeupSpokenConsent(JSON.stringify([wakeOwner,event,lead,wakeEditor.automatic,wakeEditor.day,wakeEditor.time,planned?.toISOString()]),Boolean(wakeOwner)&&wakeEditor.automatic&&!event.stayWakeup);
  const spokenProgram=spokenConsent.selected;
`);
  const actionStart = wake.indexOf('  async function activateServerAlarm()'), actionEnd = wake.indexOf('\n  async function cancelScheduledJob', actionStart);
  if (actionStart < 0 || actionEnd < actionStart) throw Error('Wakeup activation boundary missing');
  let action = wake.slice(actionStart, actionEnd);
  const message = "        message: 'Despertador CrewCheck: confira sua preparação no aplicativo.',";
  if (!action.includes(message)) throw Error('Wakeup neutral request boundary missing');
  action=action.replace(/\n        spokenProgram,\n        \.\.\.\(spokenProgram\?\{eventId:event.canonical\?\.id\|\|event.id\}:\{\}\),/,'');
  action = action.replace(message, message + '\n        spokenProgram:spokenConsent.selectedNow(),\n        ...(spokenConsent.selectedNow()?{eventId:event.canonical?.id||event.id}:{}),');
  wake = wake.slice(0, actionStart) + action + wake.slice(actionEnd);
  wake=wake.replace(/      <label><input type="checkbox" checked=\{spokenProgram\}[\s\S]*?<\/p>\n/, '');
  wake=wake.replace('    if(wakeSubmitting.current)return;\n    setWakeDraft', '    if(wakeSubmitting.current)return;\n    spokenConsent.invalidate();\n    setWakeDraft');
  wake=wake.replace('onChange={event=>setLead(event.target.value)}','onChange={event=>{spokenConsent.invalidate();setLead(event.target.value);}}');
  wake = wake.replace('      <WakeClockOptions ', `      <label><input type="checkbox" checked={spokenProgram} disabled={scheduleBusy||!wakeEditor.automatic||Boolean(event.stayWakeup)} onChange={change=>spokenConsent.choose(change.target.checked)}/> Incluir programação confirmada neste alerta</label><p>Compartilha a apresentação e o próximo trecho no idioma do perfil. Horários não confirmados ficam de fora. No hotel, a APZ continua separada da apresentação da escala.</p>
      <WakeClockOptions `);
}
if (!wake.includes('Incluir programação confirmada neste alerta') || !wake.includes('...(spokenConsent.selectedNow()?{eventId:event.canonical?.id||event.id}:{}),')) throw Error('Wakeup explicit consent control missing');
fs.writeFileSync(homePath, home.slice(0, wakeStart) + wake + home.slice(wakeEnd));
