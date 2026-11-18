/* CrewCheck worker receiver. No browser subscription exists before explicit
 * authenticated device activation; server transport is disabled by default. */
(function (root) {
  const sameBinding = (a, b) => a && b && a.ownerId === b.ownerId && a.installationId === b.installationId && a.consentRevision === b.consentRevision;
  const valid = value => value && value.schema === 'crewcheck-notice-v1' && ['ownerId', 'installationId', 'eventKey'].every(key => typeof value[key] === 'string' && value[key].length >= 8 && value[key].length <= 160) && Number.isSafeInteger(value.consentRevision) && value.consentRevision > 0 && value.route === '/app';
  const gate = value => value && (Object.hasOwn(value, 'authorityEpoch') || Object.hasOwn(value, 'topicRevision') || (typeof value.eventKey === 'string' && value.eventKey.startsWith('gate-change-v1:')));
  const gateFields = ['ownerId', 'installationId', 'consentRevision', 'topicRevision', 'authorityEpoch'];
  async function gateCurrent(store, envelope) {
    if (!gate(envelope)) return true;
    if (Object.keys(envelope).length !== 9 || typeof envelope.authorityEpoch !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(envelope.authorityEpoch)
      || !Number.isSafeInteger(envelope.topicRevision) || envelope.topicRevision < 1 || !/^gate-change-v1:[a-f0-9]{64}$/.test(envelope.eventKey || '')
      || typeof store.gateBinding !== 'function') return false;
    const binding = await store.gateBinding();
    return binding?.active === true && gateFields.every(key => binding[key] === envelope[key]);
  }
  function indexedStore(indexedDB) {
    const database = new Promise((resolve, reject) => {
      const request = indexedDB.open('crewcheck-notification-installation-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = async (operation) => {
      const db = await database;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'); let value;
        tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        operation(store, result => { value = result; });
      });
    };
    return {
      binding: () => transaction((store, done) => { const req = store.get('binding'); req.onsuccess = () => done(req.result || null); }),
      snapshot: ownerId => transaction((store,done)=>{const binding=store.get('binding'),generation=store.get('generation'),renewal=store.get('subscription-renewal:v1'),cancelled=store.get('cancelled-owner:'+String(ownerId));cancelled.onsuccess=()=>done({binding:binding.result||null,generation:generation.result||0,renewal:renewal.result||null,cancelled:cancelled.result===true});}),
      subscriptionChanged: expectedHash => transaction((store,done)=>{const binding=store.get('binding');binding.onsuccess=()=>{const current=binding.result;if(!current||!expectedHash||current.subscriptionHash!==expectedHash)return done(false);const generation=store.get('generation'),gate=store.get('gate-binding:v1');gate.onsuccess=()=>{store.put((generation.result||0)+1,'generation');store.put(null,'binding');store.put(null,'candidateOwner');if(gate.result)store.put({...gate.result,active:false},'gate-binding:v1');store.put({ownerId:current.ownerId,installationId:current.installationId,consentRevision:current.consentRevision,reason:'subscription_changed'},'subscription-renewal:v1');done(true);};};}),
      setBinding: binding => transaction((store, done) => { store.put(binding, 'binding'); done(null); }),
      begin: (ownerId,confirmed=false) => transaction((store,done)=>{const cancelled=store.get('cancelled-owner:'+ownerId);cancelled.onsuccess=()=>{if(cancelled.result===true&&confirmed!==true)return done(null);const req=store.get('generation');req.onsuccess=()=>{const generation=(req.result||0)+1;store.put(generation,'generation');store.put(ownerId,'candidateOwner');store.put(null,'binding');store.put(null,'subscription-renewal:v1');done(generation);};};}),
      bind: (binding,generation,confirmed=false) => transaction((store,done)=>{const req=store.get('generation');req.onsuccess=()=>{if(req.result!==generation)return done(false);const candidate=store.get('candidateOwner'),cancelled=store.get('cancelled-owner:'+binding.ownerId);cancelled.onsuccess=()=>{if(candidate.result!==binding.ownerId||cancelled.result===true&&confirmed!==true)return done(false);store.put(binding,'binding');if(confirmed===true)store.delete('cancelled-owner:'+binding.ownerId);done(true);};};}),
      cancel: (generation,ownerId,cancelled=false) => transaction((store,done)=>{const req=store.get('generation');req.onsuccess=()=>{if(generation!==undefined&&req.result!==generation)return done(false);const finish=()=>{if(cancelled===true&&ownerId)store.put(true,'cancelled-owner:'+ownerId);store.put((req.result||0)+1,'generation');store.put(null,'candidateOwner');store.put(null,'binding');done(true);};if(!ownerId)return finish();const binding=store.get('binding'),candidate=store.get('candidateOwner');candidate.onsuccess=()=>{if(!binding.result&&!candidate.result)return finish();if(binding.result?.ownerId!==ownerId&&candidate.result!==ownerId)return done(false);finish();};};}),
      prune: now => transaction((store,done)=>{let count=0,visited=0;const req=store.openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor)return done(count);if(String(cursor.key).startsWith('event:')&&Date.parse(cursor.value.expiresAt)<=now){cursor.delete();count++;}if(count<100&&++visited<200)cursor.continue();else done(count);};}),
      claim: (key, envelope) => transaction((store, done) => {
        const binding = store.get('binding'); binding.onsuccess = () => {
          if (!sameBinding(binding.result, envelope)) return done(false);
          const count=store.count();count.onsuccess=()=>{if(count.result>=1500)return done(false);const req = store.get('event:' + key); req.onsuccess = () => { if (req.result) return done(false); store.put({ status: 'displaying', expiresAt: envelope.expiresAt }, 'event:' + key); done(true); };};
        };
      }),
      reports: () => transaction((store,done)=>{const values=[];const req=store.openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor)return done(values);if(String(cursor.key).startsWith('event:')&&cursor.value.report&&values.length<50)values.push({key:cursor.key,...cursor.value.report});cursor.continue();};}),
      acknowledge: keys => transaction((store,done)=>{for(const key of keys){const req=store.get(key);req.onsuccess=()=>{if(req.result)store.put({...req.result,report:null},key);};}done(null);}),
      report: (key,envelope,status) => transaction((store,done)=>{const req=store.get('event:'+key);req.onsuccess=()=>{if(req.result)store.put({...req.result,report:{envelope,status}},'event:'+key);done(null);};}),
      record: (key, status) => transaction((store, done) => { const req=store.get('event:'+key);req.onsuccess=()=>{store.put({...req.result,status},'event:'+key);done(null);}; }),
    };
  }
  async function processPush({ enabled = false, envelope, store, registration, now = Date.now(), clock = () => now }) {
    if (enabled !== true || !valid(envelope) || !Number.isFinite(now) || !Number.isFinite(Date.parse(envelope.expiresAt)) || Date.parse(envelope.expiresAt) <= now || !sameBinding(await store.binding(), envelope) || !await gateCurrent(store, envelope)) return { status: 'blocked', received: null };
    const key = JSON.stringify([envelope.ownerId, envelope.eventKey, envelope.installationId, envelope.consentRevision]);
    if (!await store.claim(key, envelope)) return { status: 'duplicate_or_revoked', received: null };
    if (Date.parse(envelope.expiresAt) <= clock()) { await store.record(key, 'expired'); return { status: 'expired', received: null }; }
    // Check binding again after the persistent claim. Never show account details.
    if (!sameBinding(await store.binding(), envelope) || !await gateCurrent(store, envelope)) { await store.record(key, 'revoked'); return { status: 'revoked', received: null }; }
    try {
      if (Date.parse(envelope.expiresAt) <= clock()) { await store.record(key, 'expired'); return { status: 'expired', received: null }; }
      await registration.showNotification('CrewCheck', { body: 'Há uma atualização para conferir no CrewCheck.', tag: key, data: { route: '/app', envelope, binding: { ownerId: envelope.ownerId, installationId: envelope.installationId, consentRevision: envelope.consentRevision } } });
      await store.record(key, 'display_api_resolved');
      if(store.report)await store.report(key,envelope,'display_api_resolved');
      return { status: 'display_api_resolved', received: null }; // Not proof the user received/read it.
    } catch { await store.record(key, 'uncertain'); return { status: 'uncertain', received: null }; }
  }
  async function processClick({ notification, store, clients, origin }) {
    notification.close();
    if (notification.data?.route !== '/app' || !sameBinding(await store.binding(), notification.data.binding) || !await gateCurrent(store, notification.data.envelope)) return { opened: false };
    if(store.report&&valid(notification.data.envelope))await store.report(JSON.stringify([notification.data.envelope.ownerId,notification.data.envelope.eventKey,notification.data.envelope.installationId,notification.data.envelope.consentRevision]),notification.data.envelope,'clicked');
    const target = new URL('/app', origin).href;
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const own = windows.find(client => { try { return new URL(client.url).origin === origin; } catch { return false; } });
    if (own) { await own.navigate(target); await own.focus(); } else await clients.openWindow(target);
    return { opened: true }; // Opening does not declare BIDS complete or acknowledge reading.
  }
  root.CrewCheckPushOffline = { indexedStore, processPush, processClick };
})(typeof self !== 'undefined' ? self : globalThis);

// The browser has no push subscription until explicit authenticated activation.
// Binding/control messages are restricted to same-origin WindowClients, not tokens.
if(typeof ServiceWorkerGlobalScope!=='undefined'&&self instanceof ServiceWorkerGlobalScope){
 const base=self.CrewCheckPushOffline.indexedStore(self.indexedDB);
 const store=self.CrewCheckGateReceiverOffline?self.CrewCheckGateReceiverOffline.withGateStore(base,self.indexedDB):base;
 const gateReceiver=self.CrewCheckGateReceiverOffline&&self.navigator?.locks?.request?self.CrewCheckGateReceiverOffline.create({enabled:true,store,registration:self.registration,locks:self.navigator.locks,processPush:self.CrewCheckPushOffline.processPush}):null;
 const gateExclusive=run=>self.navigator?.locks?.request?self.navigator.locks.request('crewcheck:gate-notice:v1',{mode:'exclusive'},run):run();
 self.addEventListener('message',event=>{if(!event.data?.crewcheckPush)return;event.waitUntil((async()=>{let result={ok:false};try{const source=event.source;if(!source||new URL(source.url).origin!==self.location.origin||source.type!=='window')return;const v=event.data;
 if(v.action==='begin'&&/^[a-zA-Z0-9_-]{8,160}$/.test(v.ownerId||''))result=await gateExclusive(async()=>{const generation=await store.begin(v.ownerId,v.confirmed===true);return{ok:Number.isSafeInteger(generation),generation};});
 else if(v.action==='bind'&&v.binding&&Number.isSafeInteger(v.generation)&&/^[a-zA-Z0-9_-]{8,160}$/.test(v.binding.ownerId||'')&&/^[a-zA-Z0-9_-]{8,160}$/.test(v.binding.installationId||'')&&Number.isSafeInteger(v.binding.consentRevision)&&v.binding.consentRevision>0)result=await gateExclusive(async()=>({ok:await store.bind(v.binding,v.generation,v.confirmed===true)}));
 else if(v.action==='cancel'&&/^[a-zA-Z0-9_-]{8,160}$/.test(v.ownerId||'')){result=await gateExclusive(async()=>{const ok=await store.cancel(v.generation,v.ownerId,v.cancelled===true);if(ok){for(const item of await self.registration.getNotifications())item.close();}return{ok};});}
 else if(v.action==='status')result={ok:true,...await store.snapshot(v.ownerId)};
 else if(v.action==='gate-sync'&&gateReceiver)result=await gateReceiver.sync(v.gateBinding??null,v.binding,v.generation);
 else if(v.action==='reports')result={ok:true,reports:await store.reports()};
 else if(v.action==='acknowledge'&&Array.isArray(v.keys)&&v.keys.length<=50){await store.acknowledge(v.keys.filter(key=>typeof key==='string'&&key.startsWith('event:')));result={ok:true};}
 }catch{}finally{event.ports[0]?.postMessage(result);}})());});
 self.addEventListener('push',event=>event.waitUntil((async()=>{try{await store.prune(Date.now());const envelope=event.data?.json();if(envelope&&(Object.hasOwn(envelope,'authorityEpoch')||Object.hasOwn(envelope,'topicRevision')||String(envelope.eventKey||'').startsWith('gate-change-v1:'))){if(gateReceiver)await gateReceiver.receive(envelope);}else await self.CrewCheckPushOffline.processPush({enabled:true,envelope,store,registration:self.registration,clock:()=>Date.now()});}catch{}})()));
 // This event is optional browser evidence, not a universal renewal guarantee.
 // No token, permission prompt, subscribe or authenticated HTTP exists in worker.
 self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{
   let changed=false;
   try{
     const endpoint=event.oldSubscription?.endpoint;
     if(typeof endpoint==='string'&&self.crypto?.subtle&&self.navigator?.locks?.request){
       const bytes=await self.crypto.subtle.digest('SHA-256',new TextEncoder().encode(new URL(endpoint).href));
       const hash=Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
       changed=await self.navigator.locks.request('crewcheck:push-subscription:v1',()=>gateExclusive(async()=>{const changed=await store.subscriptionChanged(hash);if(changed)for(const notice of await self.registration.getNotifications())notice.close();return changed;}));
     }
     for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({crewcheckPush:true,action:'subscription-recheck',changed});
   }catch{}
 })()));
 self.addEventListener('notificationclick',event=>event.waitUntil(self.CrewCheckPushOffline.processClick({notification:event.notification,store,clients:self.clients,origin:self.location.origin})));
}
