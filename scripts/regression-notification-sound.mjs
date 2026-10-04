import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const root = 'client/src/components/pulse/';
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.equal((home.match(/<NotificationSoundSetting\/>/g) || []).length, 1, 'one existing-settings integration');
assert(home.includes("import NotificationSoundSetting from '@/components/pulse/NotificationSoundSetting';"));
const prepare = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
assert(prepare.indexOf("../p1-notification-sound/apply.mjs") < prepare.indexOf("../ci/sync-canonical-manual.mjs"));
const ui = fs.readFileSync(root + 'NotificationSoundSetting.tsx', 'utf8');
assert(ui.includes('stopCrewCheckNotificationSound(true)'));
assert(ui.includes('role="status"') && ui.includes('htmlFor=') && ui.includes('aria-describedby='));
assert(!ui.includes('autoPlay') && !ui.includes('requestPermission'));
const source = fs.readFileSync(root + 'pulseSound.ts', 'utf8');
assert(!source.includes('requestPermission') && !source.includes('fetch(') && !source.includes('AudioContext'));
const bytes = fs.readFileSync('client/public/assets/sounds/a320-interphone-cc0.mp3');
const provenance = JSON.parse(fs.readFileSync('client/public/assets/sounds/ATTRIBUTION.json', 'utf8'))['a320-interphone-cc0.mp3'];
assert.equal(bytes.length, provenance.bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), provenance.sha256);
assert.equal(provenance.license, 'CC0-1.0');
assert(bytes.length < 120_000);

const originals = Object.fromEntries(['window', 'document', 'Audio', 'localStorage', 'sessionStorage'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
const originalNow = Date.now;
let now = 100_000;
Date.now = () => now;
const values = new Map();
let storageFails = false;
const storage = { getItem: k => { if (storageFails) throw Error('blocked'); return values.get(k) ?? null; }, setItem: (k,v) => { if(storageFails) throw Error('blocked'); values.set(k,v); } };
const windowEvents = new EventTarget();
const documentEvents = new EventTarget();
let focused = true;
Object.assign(windowEvents, { setTimeout, clearTimeout });
Object.assign(documentEvents, { visibilityState: 'visible', hasFocus: () => focused });
let nextPlay = 'ok';
let releasePlay;
const audios = [];
class MockAudio {
  constructor(src) { this.src = src; this.pauses = 0; this.loads = 0; audios.push(this); }
  play() {
    if(nextPlay === 'reject') { nextPlay = 'ok'; return Promise.reject(Error('autoplay denied')); }
    if(nextPlay === 'pending') { nextPlay = 'ok'; return new Promise(resolve => { releasePlay = resolve; }); }
    return Promise.resolve();
  }
  pause() { this.pauses++; }
  removeAttribute() { this.src = ''; }
  load() { this.loads++; }
}
for(const [k,v] of Object.entries({ window:windowEvents, document:documentEvents, Audio:MockAudio, localStorage:storage, sessionStorage:{ getItem:()=>null, setItem:()=>{} } })) Object.defineProperty(globalThis,k,{ configurable:true, value:v });
const harness = loadClientModules({files:['pulseTypes.ts','pulseSession.ts','pulseSound.ts','pulseRuntime.ts'].map(p=>root+p)});
const sound = harness.load('pulseSound');
const runtime = harness.load('pulseRuntime');
const tick = () => new Promise(resolve => setImmediate(resolve));
const count = () => audios.length;
const states = [];
const unsub = sound.subscribeSoundPreview(state => states.push(state));
const emit = (name, props = {}) => { const event = new Event(name); Object.assign(event, props); windowEvents.dispatchEvent(event); };
try {
  assert.equal(sound.getCrewCheckNotificationSound(), 'off');
  runtime.publishCrewCheckNotice({id:'default', title:'Synthetic default',systemNotification:'never'});
  assert.equal(count(),0, 'existing users remain silent');
  values.set(sound.NOTIFICATION_SOUND_KEY,'unexpected');
  assert.equal(sound.getCrewCheckNotificationSound(),'off');
  assert(sound.setCrewCheckNotificationSound('a320-interphone'));
  assert.equal(count(),0,'selection alone never plays');
  assert(await sound.previewCrewCheckNotificationSound());
  assert.equal(count(),1); assert.equal(audios[0].volume,.35); assert.equal(audios[0].loop,false);
  const beforePreviewNotice = count();
  runtime.publishCrewCheckNotice({id:'during-preview',title:'Synthetic preview notice',systemNotification:'never'});
  assert.equal(count(),beforePreviewNotice,'notice cannot interrupt preview');
  sound.stopCrewCheckNotificationSound(true); assert.equal(states.at(-1),'idle'); assert(audios[0].pauses);
  assert(await sound.previewCrewCheckNotificationSound());
  const superseded = audios.at(-1); assert(await sound.previewCrewCheckNotificationSound()); assert(superseded.pauses,'repeated preview replaces old playback');
  sound.setCrewCheckNotificationSound('off'); assert.equal(states.at(-1),'idle'); assert(audios.at(-1).pauses);
  assert.equal(await sound.previewCrewCheckNotificationSound(),false);
  sound.setCrewCheckNotificationSound('a320-interphone');
  for(const event of ['pagehide','popstate','blur','crewcheck:set-view']) {
    await sound.previewCrewCheckNotificationSound(); const old = audios.at(-1); emit(event); assert(old.pauses,event+' cancels');
  }
  await sound.previewCrewCheckNotificationSound(); documentEvents.visibilityState='hidden'; documentEvents.dispatchEvent(new Event('visibilitychange')); assert.equal(states.at(-1),'idle');
  const hiddenCount=count(); runtime.publishCrewCheckNotice({id:'hidden',title:'Hidden',systemNotification:'never'}); assert.equal(count(),hiddenCount);
  documentEvents.visibilityState='visible'; focused=false; assert.equal(await sound.previewCrewCheckNotificationSound(),false); focused=true;
  await sound.previewCrewCheckNotificationSound(); emit('storage',{key:sound.NOTIFICATION_SOUND_KEY}); assert.equal(states.at(-1),'idle');
  await sound.previewCrewCheckNotificationSound(); emit('storage',{key:null}); assert.equal(states.at(-1),'idle');
  nextPlay='pending'; const pending = sound.previewCrewCheckNotificationSound(); const pendingAudio = audios.at(-1);
  sound.stopCrewCheckNotificationSound(true); releasePlay(); assert.equal(await pending,false); assert(pendingAudio.pauses>=2,'late play cannot resurrect stopped preview');
  nextPlay='pending'; const pendingMute = sound.previewCrewCheckNotificationSound(); sound.setCrewCheckNotificationSound('off'); releasePlay(); assert.equal(await pendingMute,false);
  sound.setCrewCheckNotificationSound('a320-interphone');
  nextPlay='reject'; assert.equal(await sound.previewCrewCheckNotificationSound(),false); assert.equal(states.at(-1),'error');
  assert(await sound.previewCrewCheckNotificationSound()); audios.at(-1).onerror(); assert.equal(states.at(-1),'error');
  assert(await sound.previewCrewCheckNotificationSound()); audios.at(-1).onended(); assert.equal(states.at(-1),'idle');
  storageFails=true; assert.equal(sound.getCrewCheckNotificationSound(),'off'); assert.equal(sound.setCrewCheckNotificationSound('a320-interphone'),false); storageFails=false;
  const beforeNotice=count(); runtime.publishCrewCheckNotice({id:'live',title:'Synthetic notice',systemNotification:'never'}); await tick(); assert.equal(count(),beforeNotice+1);
  runtime.publishCrewCheckNotice({id:'burst',title:'Synthetic burst',systemNotification:'never'}); assert.equal(count(),beforeNotice+1,'burst stays quiet');
  now+=9_000; runtime.publishCrewCheckNotice({id:'live',title:'Repeated',systemNotification:'never'}); assert.equal(count(),beforeNotice+1,'repeat stays quiet');
  runtime.publishCrewCheckNotice({id:'other',title:'New context',systemNotification:'never'}); await tick(); assert.equal(count(),beforeNotice+2);
  runtime.dismissCrewCheckPulse(); assert(audios.at(-1).pauses,'dismiss stops sound');
  now+=9_000; runtime.publishCrewCheckNotice({id:'clear',title:'Clear',systemNotification:'never'}); runtime.clearCrewCheckPulse(); assert(audios.at(-1).pauses,'clear stops sound');
  now+=9_000; runtime.publishCrewCheckNotice({id:'disable',title:'Disable',systemNotification:'never'}); runtime.setCrewCheckPulseEnabled(false); assert(audios.at(-1).pauses,'disable stops sound');
  const disabledCount=count(); now+=9_000; runtime.publishCrewCheckNotice({id:'disabled',title:'Disabled',systemNotification:'never'}); assert.equal(count(),disabledCount);
  runtime.setCrewCheckPulseEnabled(true);
  now+=310_000; runtime.publishCrewCheckNotice({id:'live',title:'Later same context',systemNotification:'never'}); await tick(); assert.equal(count(),disabledCount+1,'cooldown expires');
  runtime.clearCrewCheckPulse();
  console.log('PASS notification sound: provenance, silent default, opt-in, foreground, dedupe, mute, interruption, failures, and actual Pulse integration');
} finally {
  unsub(); sound.stopCrewCheckNotificationSound(); runtime.clearCrewCheckPulse(); harness.cleanup(); Date.now=originalNow;
  for(const [k,d] of Object.entries(originals)) { if(d) Object.defineProperty(globalThis,k,d); else delete globalThis[k]; }
}
