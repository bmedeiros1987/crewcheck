import fs from 'node:fs';
const update = (p, fn) => { const before = fs.readFileSync(p, 'utf8'); const after = fn(before); if (after !== before) fs.writeFileSync(p, after); };
const policy = JSON.parse(fs.readFileSync('scripts/android-play/release-policy.json'));
for (const [module, artifact] of Object.entries(policy.artifacts)) {
  update(`android-wrapper/${module}/build.gradle`, s => {
    s = s.replace(/versionCode\s+\d+/, `versionCode ${artifact.versionCode}`)
      .replace(/versionName\s+['"][^'"]+['"]/, `versionName '${policy.versionName}${module === 'app' ? '' : '-' + module}'`);
    const line = "apply from: rootProject.file('store-policy.gradle')";
    return s.includes(line) ? s : s + '\n' + line + '\n';
  });
}
update('android-wrapper/app/src/main/AndroidManifest.xml', s => s
  .replace(/\s*<uses-permission\b[^>]*android:name="android\.permission\.health\.[^"]+"[^>]*\/>/g, '')
  .replace(/\s*<queries>\s*<package android:name="com.google.android.apps.healthdata"\s*\/>\s*<\/queries>/g, '')
  .replace(/\s*<activity\s+android:name="\.HealthPermissionsRationaleActivity"[\s\S]*?<\/activity>/g, '')
  .replace(/\s*<activity-alias\s+android:name="\.ViewHealthPermissionUsageActivity"[\s\S]*?<\/activity-alias>/g, ''));

// Keep the canonical source patch chain intact while making its terminal output manual-only.
update('client/src/components/v1434/CrewCheckLifeView.tsx', s => {
  s = s.replace(/\n    return undefined; \/\* Play: Health Connect integration removed\. \*\//g, '')
    .replace(/\n    return false; \/\* No health permission requests or reads\. \*\//g, '')
    .replace(/return; \/\* Ignore legacy health events, including cached hosted clients\. \*\/\n      /g, '');
  s = s.replace('function getAndroidBridge() {', 'function getAndroidBridge() {\n    return undefined; /* Play: Health Connect integration removed. */');
  s = s.replace('() => readStored(KEYS.nativeSummary, {})', '() => ({})');
  s = s.replace('function postAndroid(action: string, payload: Record<string, unknown> = {}): boolean {', 'function postAndroid(action: string, payload: Record<string, unknown> = {}): boolean {\n    return false; /* No health permission requests or reads. */');
  s = s.replace('function callNativeHealth(method:', 'function callNativeHealth(method:');
  s = s.replace("const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;", "return; /* Ignore legacy health events, including cached hosted clients. */\n      const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;");
  s = s.replace(/    <div className="cc-life-sync-strip"[^\n]+/, '    <div className="cc-life-sync-strip"><div><strong>CrewLife opcional · registros manuais</strong><small>Seus registros ficam neste aparelho. Nenhuma conexão com contas de saúde.</small></div></div>');
  s = s.replace(/        <article className=\{nativeStatus\.allGranted[^]*?        <\/article>/, '        <article><Smartphone/><div><h3>Registros sob seu controle</h3><p>Informe seus dados manualmente, somente se quiser. Esta versão não acessa Health Connect ou Samsung Health.</p></div></article>');
  s = s.replace('Envia somente sono, passos/atividade e FC em repouso agregados quando disponíveis.', 'Envia somente os registros manuais de sono, passos e atividade que você informar.');
  s = s.replace('if (!consent.active || !watchMirrorEnabled || !nativeSummary.ok) return;', 'if (!consent.active || !watchMirrorEnabled) return;');
  const start = s.indexOf('    if (Number.isFinite(Number(nativeSummary.sleepMinutes))) {');
  const end = s.indexOf('    try { bridge.publishWatchCrewLife', start);
  if (start >= 0 && end > start) s = s.slice(0, start) + `    if (manual.updatedAt) {
      if (Number.isFinite(manual.sleepHours) && manual.sleepHours > 0) {
        payload.sleepMinutes = Math.round(manual.sleepHours * 60);
        payload.sleepLabel = hoursLabel(manual.sleepHours * 60) + ' · manual';
      }
      if (Number.isFinite(manual.steps) && manual.steps > 0) payload.steps = Math.round(manual.steps);
      if (Number.isFinite(manual.activityMinutes) && manual.activityMinutes > 0) payload.activeMinutes = Math.round(manual.activityMinutes);
    }
\n` + s.slice(end);
  s = s.replace('[consent.active, nativeSummary, watchMirrorEnabled]', '[consent.active, manual, watchMirrorEnabled]');
  return s;
});
update('client/src/lib/lifeConcierge.ts', s => s.replace(/function currentSnapshot\(\): LifeHealthSnapshot \| null \{[^]*?\n\}/, `function currentSnapshot(): LifeHealthSnapshot | null {
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  if (!Array.isArray(history)) return null;
  for (const item of history) {
    if (item.source !== 'manual') continue;
    const parsed = parseHealthSnapshot(item, 'manual');
    if (parsed) return parsed;
  }
  return null;
}`));
console.log('[android-play] Separate version codes, API 36 and manual-only CrewLife applied.');
