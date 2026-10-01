import fs from 'node:fs';

const MARKER = 'wake-briefing-mycrewcare-v1';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[${MARKER}] arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[${MARKER}] âncora ausente: ${label}`);
  return source.replace(before, after);
}
function functionBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[${MARKER}] bloco ausente: ${startMarker}`);
  return { start, end, value: source.slice(start, end) };
}

// ---------------------------------------------------------------------------
// Home: briefing contextual + wake surface contextual.
// Runs after the existing canonical/UX finalizers so older anchors stay intact.
// ---------------------------------------------------------------------------
{
  const path = 'client/src/pages/Home.tsx';
  let source = read(path);

  const importLine = "import { CrewTripBriefingCard, CrewWakePremiumPanel, CrewWakeRuntimeBridge } from '@/components/wakeup/CrewWakeSurface';";
  if (!source.includes(importLine)) {
    const typeAnchor = '\ntype ZeroView =';
    if (!source.includes(typeAnchor)) throw new Error(`[${MARKER}] limite dos imports de Home ausente`);
    source = source.replace(typeAnchor, `\n${importLine}\nimport StayNavigationContext from '@/components/navigation/StayNavigationContext';\n${typeAnchor.slice(1)}`);
  } else if (!source.includes("from '@/components/navigation/StayNavigationContext'")) {
    source = source.replace(importLine, importLine + "\nimport StayNavigationContext from '@/components/navigation/StayNavigationContext';");
  }

  if (!source.includes('peekPendingNavigationContext')) {
    const typeAnchor = '\ntype ZeroView =';
    source = source.replace(typeAnchor, "\nimport { peekPendingNavigationContext } from '@/lib/navigationContext';\n" + typeAnchor.slice(1));
  }

  if (!source.includes('<CrewWakeRuntimeBridge/>')) {
    source = required(
      source,
      '    <div className="cz-wallpaper"/>',
      '    <div className="cz-wallpaper"/>\n    <CrewWakeRuntimeBridge/>',
      'runtime Wake no shell',
    );
  }

  if (!source.includes('<CrewTripBriefingCard events={events}/>')) {
    const personalized = functionBlock(source, 'function PersonalizedCockpit(', '\nfunction rosterCode');
    let block = personalized.value;
    const homeShell = '  return <HomeLayoutShell slots={slots} standardContent={canonicalContent}/>;';
    if (block.includes(homeShell)) {
      block = block.replace(homeShell, '  return <><CrewTripBriefingCard events={events}/><HomeLayoutShell slots={slots} standardContent={canonicalContent}/></>;');
      source = source.slice(0, personalized.start) + block + source.slice(personalized.end);
    } else {
      const cockpit = functionBlock(source, 'function Cockpit(', '\nfunction rosterCode');
      let cockpitBlock = cockpit.value;
      const smart = '<SmartCard event={event} setView={setView}/>';
      if (!cockpitBlock.includes(smart)) throw new Error(`[${MARKER}] ação inteligente do Cockpit ausente`);
      cockpitBlock = cockpitBlock.replace(smart, smart + '<CrewTripBriefingCard events={events}/>');
      source = source.slice(0, cockpit.start) + cockpitBlock + source.slice(cockpit.end);
    }
  }

  if (!source.includes('const wakeupSurfaceContext =')) {
    const homeStart = source.indexOf('export default function Home() {');
    if (homeStart < 0) throw new Error(`[${MARKER}] Home ausente`);
    const anchorAfter = source.indexOf('  const departureEvent = nextDepartureEvent(events);', homeStart);
    const fallbackAnchor = source.indexOf('  const event = nextFlight(events);', homeStart);
    if (anchorAfter >= 0) {
      const anchor = '  const departureEvent = nextDepartureEvent(events);';
      source = source.replace(anchor, `${anchor}
  const wakeupSurfaceContext = view === 'wakeup' ? peekPendingNavigationContext('wakeup') : null;
  const contextualWakeEvent = wakeupSurfaceContext?.stayId
    ? events.find((candidate) => candidate.id === wakeupSurfaceContext.stayId && (candidate.kind === 'stay' || Boolean(candidate.hotel))) || null
    : null;
  const wakeupSurfaceEvent = wakeupSurfaceContext?.stayId ? contextualWakeEvent : departureEvent;`);
    } else if (fallbackAnchor >= 0) {
      const anchor = '  const event = nextFlight(events);';
      source = source.replace(anchor, `${anchor}
  const wakeupSurfaceContext = view === 'wakeup' ? peekPendingNavigationContext('wakeup') : null;
  const contextualWakeEvent = wakeupSurfaceContext?.stayId
    ? events.find((candidate) => candidate.id === wakeupSurfaceContext.stayId && (candidate.kind === 'stay' || Boolean(candidate.hotel))) || null
    : null;
  const wakeupSurfaceEvent = wakeupSurfaceContext?.stayId ? contextualWakeEvent : event;`);
    } else {
      throw new Error(`[${MARKER}] seleção de programação do Home ausente`);
    }
  }

  if (!source.includes("wakeupSurfaceEvent ? <WakeupView")) {
    const pattern = /\{view === 'wakeup' && <WakeupView event=\{[^}]+\}\/>\}/;
    if (!pattern.test(source)) throw new Error(`[${MARKER}] render do Wakeup ausente`);
    source = source.replace(pattern,
      "{view === 'wakeup' && (wakeupSurfaceEvent ? <WakeupView event={wakeupSurfaceEvent}/> : <><Brand back/><article className=\"cz-empty-real\"><Hotel/><h2>Pernoite não disponível</h2><p>A programação selecionada não está mais na escala ativa. Volte à Escala e escolha o pernoite novamente.</p></article></>)}");
  }

  const wake = functionBlock(source, 'function WakeupView(', '\nfunction PresentationManagerView');
  let wakeBlock = wake.value;
  if (!wakeBlock.includes('<CrewWakePremiumPanel event={event}/>')) {
    wakeBlock = required(
      wakeBlock,
      'return <><Brand back/>',
      'return <><Brand back/><StayNavigationContext targetView="wakeup"/><CrewWakePremiumPanel event={event}/>',
      'painel Wake premium',
    );
  }
  if (!wakeBlock.includes('className="cc-wake-advanced"')) {
    wakeBlock = required(
      wakeBlock,
      '<section className="cz-panel-head">',
      '<details className="cc-wake-advanced"><summary>Opções avançadas</summary><section className="cz-panel-head">',
      'opções avançadas Wake',
    );
    const close = wakeBlock.lastIndexOf('</section></>;');
    if (close < 0) throw new Error(`[${MARKER}] fechamento do Wakeup ausente`);
    wakeBlock = wakeBlock.slice(0, close) + '</section></details></>;' + wakeBlock.slice(close + '</section></>;'.length);
  }
  source = source.slice(0, wake.start) + wakeBlock + source.slice(wake.end);

  for (const marker of [
    '<CrewWakeRuntimeBridge/>',
    '<CrewTripBriefingCard events={events}/>',
    '<CrewWakePremiumPanel event={event}/>',
    'wakeupSurfaceContext',
  ]) {
    if (!source.includes(marker)) throw new Error(`[${MARKER}] Home incompleto: ${marker}`);
  }
  write(path, source);
}

// ---------------------------------------------------------------------------
// Escala real exibida ao usuário: o pernoite ganha a faixa Wake contextual.
// ---------------------------------------------------------------------------
{
  const path = 'client/src/components/v1391/RosterLaunchView.tsx';
  let source = read(path);

  if (!source.includes("from '@/components/wakeup/CrewWakeSurface'")) {
    const typeAnchor = '\ntype RosterEvent =';
    if (!source.includes(typeAnchor)) throw new Error(`[${MARKER}] limite de imports da Escala ausente`);
    source = source.replace(typeAnchor,
      "\nimport { StayWakeStrip } from '@/components/wakeup/CrewWakeSurface';\nimport { setPendingNavigationContext } from '@/lib/navigationContext';\n" + typeAnchor.slice(1));
  }

  if (!source.includes('function openWakeForStay(event: RosterEvent)')) {
    const returnAnchor = '  return <div className="cc-roster-premium-v1397">';
    if (!source.includes(returnAnchor)) throw new Error(`[${MARKER}] retorno da Escala premium ausente`);
    source = source.replace(returnAnchor, `  function openWakeForStay(event: RosterEvent) {
    setPendingNavigationContext({
      sourceView: 'roster',
      targetView: 'wakeup',
      dateEpochMs: dateOf(event).getTime(),
      stayId: event.id,
      airportCode: String(event.destination || event.origin || '').trim() || undefined,
      returnView: 'roster',
      returnLabel: 'Voltar à Escala',
      policy: 'persistent-until-return',
    });
    setView('wakeup');
  }

${returnAnchor}`);
  }

  if (!source.includes('<StayWakeStrip event={event}')) {
    const chipsAnchor = '                <div className="cc-roster-detail-chips-v1397">';
    if (!source.includes(chipsAnchor)) throw new Error(`[${MARKER}] detalhes do card de pernoite ausentes`);
    source = source.replace(chipsAnchor,
      "                {mode === 'stay' && <StayWakeStrip event={event} onOpen={() => openWakeForStay(event)}/>}\n\n" + chipsAnchor);
  }

  write(path, source);
}

// ---------------------------------------------------------------------------
// Android native bridge is appended only after all existing Android finalizers.
// ---------------------------------------------------------------------------
{
  const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
  let source = read(path);

  if (!source.includes('private CrewCheckMyCrewCarePortal myCrewCarePortal;')) {
    source = required(
      source,
      '    private BroadcastReceiver watchSyncRequestReceiver;\n',
      '    private BroadcastReceiver watchSyncRequestReceiver;\n    private CrewCheckMyCrewCarePortal myCrewCarePortal;\n    private String pendingWakeAckKey;\n',
      'campos MyCrewCare/Wake',
    );
  }

  if (!source.includes('myCrewCarePortal = new CrewCheckMyCrewCarePortal')) {
    source = required(
      source,
      '        registerWatchSyncRequestReceiver();',
      '        registerWatchSyncRequestReceiver();\n        myCrewCarePortal = new CrewCheckMyCrewCarePortal(this, rootLayout, webView);\n        captureWakeAckIntent(getIntent());',
      'inicialização MyCrewCare',
    );
  }

  if (!source.includes('dispatchMyCrewCareStatus();')) {
    source = required(
      source,
      '                injectCrewCheckBridge();',
      '                injectCrewCheckBridge();\n                dispatchMyCrewCareStatus();\n                dispatchPendingWakeAck();',
      'estado MyCrewCare ao carregar',
    );
  }

  if (!source.includes('myCrewCarePortal.syncIfConnected();')) {
    source = required(
      source,
      '        super.onResume();',
      '        super.onResume();\n        if (myCrewCarePortal != null) myCrewCarePortal.syncIfConnected();',
      'sync oportunista MyCrewCare',
    );
  }

  const nativeMethods = "openMyCrewCare:function(){try{return AndroidCrewCheckNative.openMyCrewCare();}catch(e){return false;}},syncMyCrewCare:function(){try{return AndroidCrewCheckNative.syncMyCrewCare();}catch(e){return false;}},myCrewCareStatus:function(){try{return JSON.parse(AndroidCrewCheckNative.myCrewCareStatus());}catch(e){return {connected:false,status:'disconnected'};}},scheduleWakeAlarm:function(key,epochMillis,label){try{return AndroidCrewCheckNative.scheduleWakeAlarm(String(key||''),String(epochMillis||''),String(label||'CrewCheck'));}catch(e){return false;}},cancelWakeAlarm:function(key){try{return AndroidCrewCheckNative.cancelWakeAlarm(String(key||''));}catch(e){return false;}},syncSystemAlarm:function(epochMillis,label){try{return AndroidCrewCheckNative.syncSystemAlarm(String(epochMillis||''),String(label||'CrewCheck'));}catch(e){return false;}},";
  if (!source.includes('openMyCrewCare:function()')) {
    const facadeAnchor = 'window.CrewCheckNative={';
    const facadeIndex = source.indexOf(facadeAnchor);
    if (facadeIndex < 0) throw new Error(`[${MARKER}] fachada nativa ausente`);
    const insertAt = facadeIndex + facadeAnchor.length;
    source = source.slice(0, insertAt) + nativeMethods + source.slice(insertAt);
  }

  if (!source.includes('public boolean openMyCrewCare()')) {
    const methodAnchor = '        @JavascriptInterface\n        public boolean scheduleNotification(final String title, final String body, final String epochMillis) {';
    if (!source.includes(methodAnchor)) throw new Error(`[${MARKER}] método scheduleNotification nativo ausente`);
    const methods = `        @JavascriptInterface
        public boolean openMyCrewCare() {
            if (myCrewCarePortal == null) return false;
            myCrewCarePortal.open();
            return true;
        }

        @JavascriptInterface
        public boolean syncMyCrewCare() {
            if (myCrewCarePortal == null) return false;
            myCrewCarePortal.syncIfConnected();
            return true;
        }

        @JavascriptInterface
        public String myCrewCareStatus() {
            return myCrewCarePortal == null
                    ? "{\\\"connected\\\":false,\\\"status\\\":\\\"disconnected\\\"}"
                    : myCrewCarePortal.statusJson();
        }

        @JavascriptInterface
        public boolean scheduleWakeAlarm(final String wakeKey, final String epochMillis, final String label) {
            long when;
            try { when = Long.parseLong(epochMillis); }
            catch (Exception ignored) { return false; }
            boolean scheduled = CrewCheckWakeScheduler.schedule(MainActivity.this, wakeKey, when, label);
            if (!scheduled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !CrewCheckWakeScheduler.canScheduleExact(MainActivity.this)) {
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        startActivity(intent);
                        Toast.makeText(MainActivity.this, "Libere alarmes exatos para o CrewCheck Wake e toque em Ativar novamente.", Toast.LENGTH_LONG).show();
                    } catch (Exception ignored2) {}
                });
            }
            return scheduled;
        }

        @JavascriptInterface
        public boolean cancelWakeAlarm(final String wakeKey) {
            CrewCheckWakeScheduler.cancel(MainActivity.this, wakeKey);
            return true;
        }

        @JavascriptInterface
        public boolean syncSystemAlarm(final String epochMillis, final String label) {
            long when;
            try { when = Long.parseLong(epochMillis); }
            catch (Exception ignored) { return false; }
            long delta = when - System.currentTimeMillis();
            if (delta <= 0L || delta > 24L * 60L * 60L * 1000L) return false;
            try {
                java.util.Calendar calendar = java.util.Calendar.getInstance();
                calendar.setTimeInMillis(when);
                Intent intent = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM);
                intent.putExtra(android.provider.AlarmClock.EXTRA_HOUR, calendar.get(java.util.Calendar.HOUR_OF_DAY));
                intent.putExtra(android.provider.AlarmClock.EXTRA_MINUTES, calendar.get(java.util.Calendar.MINUTE));
                intent.putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, label == null ? "CrewCheck" : label);
                intent.putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, true);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }

`;
    source = source.replace(methodAnchor, methods + methodAnchor);
  }

  if (!source.includes('private void captureWakeAckIntent(Intent intent)')) {
    const helperAnchor = '    private void registerWatchSyncRequestReceiver() {';
    if (!source.includes(helperAnchor)) throw new Error(`[${MARKER}] helper de sync Watch ausente`);
    const helpers = `    private void captureWakeAckIntent(Intent intent) {
        if (intent == null) return;
        String key = intent.getStringExtra("crewcheckWakeAckKey");
        if (key != null && !key.trim().isEmpty()) pendingWakeAckKey = key.trim();
    }

    private void dispatchPendingWakeAck() {
        if (webView == null || pendingWakeAckKey == null || pendingWakeAckKey.isEmpty()) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("wakeKey", pendingWakeAckKey);
            detail.put("acknowledgedAt", System.currentTimeMillis());
            final String js = "(function(){try{var detail=" + detail.toString() + ";" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:wake-ack',{detail:detail}));" +
                    "}catch(e){}})();";
            webView.evaluateJavascript(js, null);
            pendingWakeAckKey = null;
        } catch (Exception ignored) {}
    }

    private void dispatchMyCrewCareStatus() {
        if (webView == null || myCrewCarePortal == null) return;
        try {
            final String status = myCrewCarePortal.statusJson();
            final String js = "(function(){try{var detail=" + status + ";" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-status',{detail:detail}));" +
                    "}catch(e){}})();";
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) {}
    }

`;
    source = source.replace(helperAnchor, helpers + helperAnchor);
  }

  if (!source.includes('captureWakeAckIntent(intent);')) {
    source = required(
      source,
      '        setIntent(intent);',
      '        setIntent(intent);\n        captureWakeAckIntent(intent);\n        dispatchPendingWakeAck();',
      'ack em novo intent',
    );
  }

  if (!source.includes('myCrewCarePortal != null && myCrewCarePortal.isVisible()')) {
    source = required(
      source,
      '    public void onBackPressed() {\n        if (portalWebView != null) {',
      '    public void onBackPressed() {\n        if (myCrewCarePortal != null && myCrewCarePortal.isVisible()) {\n            myCrewCarePortal.closeVisible();\n            return;\n        }\n        if (portalWebView != null) {',
      'back do MyCrewCare',
    );
  }

  if (!source.includes('myCrewCarePortal.destroy();')) {
    source = required(
      source,
      '    protected void onDestroy() {',
      '    protected void onDestroy() {\n        if (myCrewCarePortal != null) {\n            myCrewCarePortal.destroy();\n            myCrewCarePortal = null;\n        }',
      'destroy MyCrewCare',
    );
  }

  for (const marker of [
    'openMyCrewCare:function()',
    'public boolean scheduleWakeAlarm',
    'CrewCheckWakeScheduler.schedule',
    'dispatchPendingWakeAck',
  ]) {
    if (!source.includes(marker)) throw new Error(`[${MARKER}] Android incompleto: ${marker}`);
  }
  write(path, source);
}

console.log(`[${MARKER}] CrewCheck Wake, pernoite, briefing e conector MyCrewCare materializados após finalizadores canônicos.`);
