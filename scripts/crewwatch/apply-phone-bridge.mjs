import fs from 'node:fs';

const mainPath = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
const buildPath = 'android-wrapper/app/build.gradle';

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`[crewwatch-phone] Arquivo ausente: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`[crewwatch-phone] Âncora ausente: ${label}`);
  return source.replace(needle, replacement);
}

let main = read(mainPath);
const nativeFacadeLine = main.split('\n').find((line) => line.includes('"window.CrewCheckNative={openExternal:function(url)'));
if (!nativeFacadeLine) throw new Error('[crewwatch-phone] Fachada CrewCheckNative não encontrada.');

if (!nativeFacadeLine.includes('syncWatchSnapshot:function')) {
  const extendedFacade = '                "window.CrewCheckNative={openExternal:function(url){try{return AndroidCrewCheckNative.openExternal(String(url));}catch(e){return false;}},requestLocation:function(){try{return AndroidCrewCheckNative.requestLocation();}catch(e){return false;}},requestCurrentLocation:function(callbackId){try{return AndroidCrewCheckNative.requestCurrentLocation(String(callbackId||\'\'));}catch(e){return false;}},requestNotifications:function(){try{return AndroidCrewCheckNative.requestNotifications();}catch(e){return false;}},requestBackgroundMode:function(){try{return AndroidCrewCheckNative.requestBackgroundMode();}catch(e){return false;}},openPowerSettings:function(){try{return AndroidCrewCheckNative.openPowerSettings();}catch(e){return false;}},permissionStatus:function(){try{return JSON.parse(AndroidCrewCheckNative.permissionStatus());}catch(e){return {location:false,notifications:false};}},watchSyncAvailable:function(){try{return AndroidCrewCheckNative.watchSyncAvailable();}catch(e){return false;}},syncWatchSnapshot:function(snapshot){try{var raw=(typeof snapshot===\'string\')?snapshot:JSON.stringify(snapshot||{});return AndroidCrewCheckNative.syncWatchSnapshot(String(raw));}catch(e){return false;}},requestWatchSnapshot:function(){try{return AndroidCrewCheckNative.requestWatchSnapshot();}catch(e){return false;}},notify:function(title,body){try{return AndroidCrewCheckNative.notify(String(title||\'CrewCheck\'),String(body||\'\'));}catch(e){return false;}},scheduleNotification:function(title,body,epochMillis){try{return AndroidCrewCheckNative.scheduleNotification(String(title||\'CrewCheck\'),String(body||\'\'),String(epochMillis||Date.now()));}catch(e){return false;}}};" +';
  main = main.replace(nativeFacadeLine, extendedFacade);
}

const premiumLine = '                "window.CrewCheckPremium=window.CrewCheckNative;" +';
const watchListenerLine = '                "if(!window.__crewcheckWatchSnapshotListener){window.__crewcheckWatchSnapshotListener=true;window.addEventListener(\'crewcheck:watch-snapshot\',function(event){try{window.CrewCheckNative.syncWatchSnapshot(event&&event.detail?event.detail:{});}catch(e){}});}" +';
if (!main.includes('__crewcheckWatchSnapshotListener')) {
  main = replaceOnce(main, premiumLine, `${watchListenerLine}\n${premiumLine}`, 'listener JS do relógio');
}

const bridgeAnchor = '    public class CrewCheckNativeBridge {';
const dispatchMethod = `    private void dispatchCrewCheckWatchSyncResult(boolean ok, String code, String message) {
        try {
            if (webView == null) return;
            JSONObject payload = new JSONObject();
            payload.put("ok", ok);
            payload.put("code", code == null ? "" : code);
            payload.put("message", message == null ? "" : message);
            payload.put("at", System.currentTimeMillis());
            final String js = "(function(){try{var detail=" + payload.toString() + ";" +
                    "window.__crewcheckLastWatchSync=detail;" +
                    "window.dispatchEvent(new CustomEvent('crewcheck:watch-sync-result',{detail:detail}));" +
                    "}catch(e){}})();";
            runOnUiThread(() -> {
                try { if (webView != null) webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

`;
if (!main.includes('dispatchCrewCheckWatchSyncResult(boolean ok')) {
  main = replaceOnce(main, bridgeAnchor, dispatchMethod + bridgeAnchor, 'método de retorno Watch');
}

const scheduleAnchor = `        @JavascriptInterface
        public boolean scheduleNotification(final String title, final String body, final String epochMillis) {`;
const watchMethods = `        @JavascriptInterface
        public boolean watchSyncAvailable() {
            return true;
        }

        @JavascriptInterface
        public boolean syncWatchSnapshot(final String snapshotJson) {
            if (snapshotJson == null || snapshotJson.trim().isEmpty()) {
                dispatchCrewCheckWatchSyncResult(false, "invalid_snapshot", "Snapshot vazio.");
                return false;
            }
            CrewCheckWatchPublisher.publish(
                    MainActivity.this,
                    snapshotJson,
                    MainActivity.this::dispatchCrewCheckWatchSyncResult
            );
            return true;
        }

        @JavascriptInterface
        public boolean requestWatchSnapshot() {
            runOnUiThread(() -> {
                try {
                    if (webView == null) return;
                    webView.evaluateJavascript(
                            "(function(){try{window.dispatchEvent(new CustomEvent('crewcheck:watch-snapshot-request',{detail:{reason:'native-request'}}));}catch(e){}})();",
                            null
                    );
                } catch (Exception ignored) {}
            });
            return true;
        }

`;
if (!main.includes('public boolean syncWatchSnapshot(final String snapshotJson)')) {
  main = replaceOnce(main, scheduleAnchor, watchMethods + scheduleAnchor, 'métodos nativos Watch');
}

fs.writeFileSync(mainPath, main);

let build = read(buildPath);
const billingDependency = '    implementation "com.android.billingclient:billing:$billing_version"';
const wearableDependency = "    implementation 'com.google.android.gms:play-services-wearable:20.0.1'";
if (!build.includes('play-services-wearable')) {
  build = replaceOnce(build, billingDependency, `${billingDependency}\n${wearableDependency}`, 'dependência Wearable Data Layer');
  fs.writeFileSync(buildPath, build);
}

for (const marker of [
  'syncWatchSnapshot:function',
  'crewcheck:watch-sync-result',
  'public boolean syncWatchSnapshot(final String snapshotJson)',
]) {
  if (!main.includes(marker)) throw new Error(`[crewwatch-phone] Marcador ausente após patch: ${marker}`);
}
if (!build.includes('play-services-wearable:20.0.1')) throw new Error('[crewwatch-phone] Dependência Wearable ausente.');
console.log('[crewwatch-phone] Ponte Android → Wear OS aplicada com sucesso.');
