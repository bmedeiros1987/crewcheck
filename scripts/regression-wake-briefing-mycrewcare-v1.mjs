import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const home = read('client/src/pages/Home.tsx');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const wake = read('client/src/components/wakeup/CrewWakeSurface.tsx');
const engine = read('client/src/lib/crewWake.ts');
const portal = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortal.java');
const main = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const scheduler = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWakeScheduler.java');
const alarm = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWakeAlarmActivity.java');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const server = read('server.mjs');

assert.match(roster, /<StayWakeStrip event=\{event\}/, 'Pernoite da escala deve mostrar início/fim/pickup/despertar');
assert.match(roster, /openWakeForStay/, 'Pernoite da escala deve abrir o CrewCheck Wake');
assert.match(home, /<CrewWakePremiumPanel event=\{event\}/, 'Despertador deve usar a superfície premium');
assert.match(home, /<CrewTripBriefingCard events=\{events\}/, 'Cockpit deve mostrar briefing pré-chave');
assert.match(home, /wakeupSurfaceContext/, 'Wake deve resolver o pernoite explicitamente selecionado');

assert.match(engine, /state\.manualPickup[\s\S]*source: 'manual'/, 'Override manual deve ter prioridade');
assert.match(engine, /state\.automatic[\s\S]*matchMyCrewCarePickup/, 'MyCrewCare só deve ser consultado no modo automático');
assert.match(engine, /source: 'presentation'/, 'Sem pickup, apresentação deve permanecer fallback');
assert.match(engine, /manualPickupAt|manualPickup/, 'Estado manual deve permanecer explícito');
assert.match(engine, /briefingLeadHours/, 'Antecedência do briefing deve ser configurável');

assert.match(wake, /isPwaLike\(\) \|\| !native/, 'Web/PWA deve ser reconhecido sem ponte nativa');
assert.match(wake, /if \(pwa\)[\s\S]*schedulePhoneWake\(wakeAt/, 'PWA deve agendar Infobip como mecanismo de despertar');
assert.match(wake, /scheduleWakeAlarm/, 'Android deve usar CrewCheck Wake nativo');
assert.match(wake, /infobipFallback/, 'Android deve oferecer fallback Infobip opcional');
assert.match(wake, /cancelPhoneWake/, 'Confirmação/alteração deve poder cancelar fallback');
assert.match(wake, /myCrewCareConnectionStatus/, 'UI deve expor somente estado conectado/desconectado');
assert.match(wake, /forecastDays/, 'Briefing deve usar previsão por data do pernoite');

assert.doesNotMatch(portal, /addJavascriptInterface/, 'Portal externo não pode receber ponte Java nativa');
assert.match(portal, /api2\.apicrewcare\.com/, 'Portal deve limitar o domínio MyCrewCare');
assert.match(portal, /login\.microsoftonline\.com/, 'SSO Microsoft deve ser permitido');
assert.match(portal, /isMyCrewCareUrl\(url\)[\s\S]*extractTransportation/, 'Extração só deve ocorrer depois do retorno ao MyCrewCare');
assert.match(portal, /Transportation\\s\+To\\s\+Airport/, 'Parser deve reconhecer transporte ao aeroporto');
assert.match(portal, /Pick\[- \]\?up\[- \]\?time/, 'Parser deve reconhecer pickup time');

assert.match(main, /openMyCrewCare\(\)/, 'Ponte Android deve abrir MyCrewCare');
assert.match(main, /scheduleWakeAlarm/, 'Ponte Android deve programar CrewCheck Wake');
assert.match(main, /syncSystemAlarm/, 'Espelhamento opcional com despertador do celular deve existir');
assert.match(main, /crewcheck:wake-ack/, 'Acordei deve voltar ao cliente para cancelar fallback');

assert.match(scheduler, /setAlarmClock/, 'CrewCheck Wake deve usar alarme exato do Android');
assert.match(scheduler, /rescheduleAll/, 'Alarmes devem sobreviver a reboot');
assert.match(alarm, /Acordei/, 'Tela de alarme deve ter confirmação simples');
assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/, 'Manifest deve permitir alarme exato');
assert.match(manifest, /android\.permission\.VIBRATE/, 'Alarme deve poder vibrar');
assert.match(manifest, /CrewCheckWakeBootReceiver/, 'Boot receiver deve estar registrado');

assert.match(server, /forecast_days=7/, 'Briefing deve ter horizonte meteorológico de 7 dias');
assert.match(server, /forecastDays/, 'API deve expor os dias previstos');

for (const protectedFile of ['client/src/lib/pdfParser.ts', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/complianceEngine.ts']) {
  assert.ok(fs.existsSync(protectedFile), protectedFile + ' deve permanecer presente e fora do motor Wake');
}

console.log('OK CrewCheck Wake + MyCrewCare + briefing pré-chave');
