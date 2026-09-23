import fs from 'node:fs';
const destination = 'client/src/components/wellness';
fs.mkdirSync(destination, { recursive: true });
for (const name of ['WellnessDashboard.tsx', 'wellness.ts', 'wellness.css']) fs.copyFileSync(`scripts/crewlife-wellness/${name}`, `${destination}/${name}`);
function patch(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  if (source.includes('// crewlife-wellness prepared')) return;
  const next = transform(source);
  fs.writeFileSync(path, '// crewlife-wellness prepared\n' + next);
}
function replace(source, before, after) {
  if (!source.includes(before)) throw new Error(`CrewLife source anchor missing: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}
patch('client/src/components/v1434/CrewCheckLifeView.tsx', source => {
  source = "import { disconnectSamsung } from '@/components/wellness/samsung';\nimport WellnessDashboard from '@/components/wellness/WellnessDashboard';\n" + source;
  source = replace(source, 'const [manual, setManual]', 'const [wellnessEpoch, setWellnessEpoch] = useState(0);\n  const [manual, setManual]');
  source = replace(source, 'function revokeNative() {', 'function revokeNative() {\n    disconnectSamsung();\n    setWellnessEpoch(value => value + 1);');
  source = replace(source, 'function pauseLife() {', 'function pauseLife() {\n    disconnectSamsung();');
  source = replace(source, '    Object.values(KEYS).forEach', '    disconnectSamsung();\n    Object.values(KEYS).forEach');
  const start = source.indexOf('    <section className={`cc-life-recommendation');
  const end = source.indexOf('    <div className="cc-life-sync-strip">', start);
  if (start < 0 || end < start) throw new Error('CrewLife recommendation region missing');
  source = source.slice(0, start) + '    <WellnessDashboard key={wellnessEpoch} manual={readStored(KEYS.manual, DEFAULT_MANUAL)} sleepGoalHours={profile.sleepTarget}/>\n\n' + source.slice(end);
  source = replace(source, '<LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>', '<details className="cw-habits"><summary>Hábitos, metas e histórico</summary><LifeConciergePanel hideRecommendation nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/></details>');
  source = source.replace('Seus registros ficam neste aparelho. Nenhuma conexão com contas de saúde.', 'Conexões opcionais são gerenciadas no painel acima.');
  source = source.replace('Esta versão não acessa Health Connect ou Samsung Health.', 'A conexão Samsung depende de disponibilidade e autorização. Health Connect não é usado.');
  const metricsStart = source.indexOf('    <section className="cc-life-metrics"');
  const metricsEnd = source.indexOf('    <section className="cc-life-block cc-life-integrations">', metricsStart);
  if (metricsStart < 0 || metricsEnd < metricsStart) throw new Error('CrewLife metrics region missing');
  return source.slice(0, metricsStart) + source.slice(metricsEnd);
});
patch('client/src/components/v14313/LifeConciergePanel.tsx', source => {
  source = replace(source, '({ nextProgram, healthSummary, profile }: {', '({ nextProgram, healthSummary, profile, hideRecommendation = false }: { hideRecommendation?: boolean;');
  source = replace(source, '<article className={`cc-life-ai-recommendation', '{!hideRecommendation && <article className={`cc-life-ai-recommendation');
  return replace(source, '    </article>\n\n    <div className="cc-life-ai-dashboard">', '    </article>}\n\n    <div className="cc-life-ai-dashboard">');
});

// CI compiles Samsung debug mode; public builds use a SDK-free stub until approval.
fs.cpSync('scripts/crewlife-wellness/native', 'android-wrapper/app/src/samsung', { recursive: true });
const nativeDir = 'android-wrapper/app/src/samsung/java/com/crewcheck/app';
fs.mkdirSync(nativeDir, { recursive: true });
for (const name of ['SamsungWellnessReader.kt', 'SamsungWellnessStorage.kt', 'SamsungWellnessWorker.kt', 'SamsungWellnessBridge.kt']) fs.copyFileSync(`scripts/crewlife-wellness/native/${name}`, `${nativeDir}/${name}`);
fs.mkdirSync('android-wrapper/app/src/samsung-disabled/java/com/crewcheck/app', { recursive: true });
fs.copyFileSync('scripts/crewlife-wellness/native/SamsungWellnessDisabled.kt', 'android-wrapper/app/src/samsung-disabled/java/com/crewcheck/app/SamsungWellnessBridge.kt');
fs.copyFileSync('scripts/crewlife-wellness/samsung.ts', `${destination}/samsung.ts`);
const gradle = 'android-wrapper/app/build.gradle';
const gradleSource = fs.readFileSync(gradle, 'utf8');
if (!gradleSource.includes("apply from: 'src/samsung/samsung.gradle'")) fs.appendFileSync(gradle, "\napply from: 'src/samsung/samsung.gradle'\n");
const manifest = 'android-wrapper/app/src/main/AndroidManifest.xml';
let manifestSource = fs.readFileSync(manifest, 'utf8').replace('android:label="CrewCheck"', 'android:label="${crewcheckAppLabel}"');
fs.writeFileSync(manifest, manifestSource);
if (!manifestSource.includes('com.sec.android.app.shealth')) fs.writeFileSync(manifest, manifestSource.replace('    <application', '    <queries><package android:name="com.sec.android.app.shealth" /></queries>\n    <application'));
patch('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', source => {
  source = replace(source, '    private boolean isCrewCheckWebUrl(', '    private SamsungWellnessBridge samsungWellnessBridge;\n\n    private boolean isCrewCheckWebUrl(');
  source = replace(source, '        configureWebView(webView, false);', '        configureWebView(webView, false);\n        samsungWellnessBridge = new SamsungWellnessBridge(this, webView);\n        samsungWellnessBridge.install();');
  source = replace(source, 'webView.setWebViewClient(new WebViewClient() {', 'webView.setWebViewClient(new WebViewClient() {\n            @Override\n            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {\n                super.onPageStarted(view, url, icon);\n                if (samsungWellnessBridge != null) samsungWellnessBridge.navigationStarted();\n            }');
  return replace(source, '        closePortalOnly();\n        if (billingBridge', '        closePortalOnly();\n        if (samsungWellnessBridge != null) samsungWellnessBridge.destroy();\n        if (billingBridge');
});
patch('client/src/lib/authClient.ts', source => {
  source = `function clearNativeWellnessConsent() {
    try {
      const bridge = (window as unknown as { CrewCheckSamsung?: { postMessage: (value: string) => void } }).CrewCheckSamsung;
      bridge?.postMessage(JSON.stringify({ version: 1, requestId: crypto.randomUUID(), action: 'disconnect' }));
      window.dispatchEvent(new Event('crewcheck:samsung-disconnected'));
    } catch {}
  }
` + source;
  source = replace(source, 'export function clearSession() {', 'export function clearSession() {\n  clearNativeWellnessConsent();');
  source = replace(source, 'export function expireSession() {', 'export function expireSession() {\n  clearNativeWellnessConsent();');
  return replace(source, 'if (previousKey && nextKey && previousKey !== nextKey) {', 'if (previousKey && nextKey && previousKey !== nextKey) {\n      clearNativeWellnessConsent();');
});
patch('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java', source => {
  const start = source.indexOf('    private void renderCrewLife(long now) {');
  const end = source.indexOf('    private void renderSchedule(', start);
  if (start < 0 || end < start) throw new Error('Watch CrewLife render region changed');
  source = source.slice(0, start) + fs.readFileSync('scripts/crewlife-wellness/watch-life.snippet', 'utf8') + source.slice(end);
  source = replace(source, 'view.setTextSize(sp);', 'view.setTextSize(Math.max(sp, 12));');
  return source;
});

// The bundled/mobile web shell must invalidate the previous service-worker cache.
const releasePolicy = JSON.parse(fs.readFileSync('scripts/android-play/release-policy.json', 'utf8'));
const webRelease = JSON.parse(fs.readFileSync('client/public/release.json', 'utf8'));
webRelease.version = releasePolicy.versionName;
webRelease.notes = 'Novo painel CrewLife e leitura mais clara no relógio. Integração Samsung disponível apenas em validação, aguardando aprovação.';
fs.writeFileSync('client/public/release.json', JSON.stringify(webRelease, null, 2) + '\n');
const { syncServiceWorkerVersion } = await import('../ci/sync-service-worker-version.mjs');
fs.writeFileSync('client/public/sw.js', syncServiceWorkerVersion(fs.readFileSync('client/public/sw.js', 'utf8'), webRelease.version));
