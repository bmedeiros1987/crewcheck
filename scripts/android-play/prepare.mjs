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

// Keep the main Play app Health-Connect-free while preserving optional Samsung Companion summaries.
update('client/src/components/v1434/CrewCheckLifeView.tsx', s => {
  s = s.replace(/\n    return undefined; \/\* Play: Health Connect integration removed\. \*\//g, '')
    .replace(/\n    return false; \/\* No health permission requests or reads\. \*\//g, '')
    .replace(/return; \/\* Ignore legacy health events, including cached hosted clients\. \*\/\n      /g, '');
  s = s.replace('function getAndroidBridge() {', 'function getAndroidBridge() {\n    return undefined; /* Play: Health Connect integration removed. */');
  s = s.replace('() => readStored(KEYS.nativeSummary, {})', '() => ({})');
  s = s.replace('function postAndroid(action: string, payload: Record<string, unknown> = {}): boolean {', 'function postAndroid(action: string, payload: Record<string, unknown> = {}): boolean {\n    return false; /* No health permission requests or reads. */');
  s = s.replace("const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;", "return; /* Ignore legacy health events, including cached hosted clients. */\n      const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthSummary;");
  s = s.replace(/    <div className="cc-life-sync-strip"[^\n]+/, '    <div className="cc-life-sync-strip"><div><strong>CrewLife opcional · Samsung automático via Companion ou manual</strong><small>Seus registros ficam neste aparelho. Nenhuma conexão com contas de saúde.</small></div></div>');
  s = s.replace(/        <article className=\{nativeStatus\.allGranted[^]*?        <\/article>/, '        <article><Smartphone/><div><h3>Registros sob seu controle</h3><p>O CrewCheck principal não acessa Health Connect. Samsung Health automático é lido somente pelo CrewLife Companion separado; a entrada manual continua disponível.</p></div></article>');
  s = s.replace('Sono, passos, distância, atividade física, tendência resumida de frequência em repouso e sua próxima programação.', 'Sono, passos e atividade do Companion Samsung quando autorizado, ou registros manuais, além da sua próxima programação.');
  s = s.replace('Li e entendi que o recurso é opcional e que permissões de saúde serão pedidas separadamente.', 'Li e entendi que o recurso é opcional; o CrewCheck principal não pede permissões de saúde e a sincronização Samsung, quando usada, ocorre pelo Companion separado.');
  s = s.replace('Envia somente sono, passos/atividade e FC em repouso agregados quando disponíveis.', 'Envia somente o resumo automático do Companion Samsung ou os registros manuais que você informar.');
  s = s.replace('if (!consent.active || !watchMirrorEnabled || !nativeSummary.ok) return;', 'if (!consent.active || !watchMirrorEnabled) return;');
  const start = s.indexOf('    if (Number.isFinite(Number(nativeSummary.sleepMinutes))) {');
  const end = s.indexOf('    try { bridge.publishWatchCrewLife', start);
  if (start >= 0 && end > start) s = s.slice(0, start) + `    const recordedAt = Date.parse(manual.updatedAt);
    if (Number.isFinite(recordedAt) && recordedAt <= now && now - recordedAt < 24 * 60 * 60 * 1000) {
      payload.validUntilEpochMs = Math.min(now + 6 * 60 * 60 * 1000, recordedAt + 24 * 60 * 60 * 1000);
      if (Number.isFinite(manual.sleepHours) && manual.sleepHours > 0) {
        payload.sleepMinutes = Math.round(manual.sleepHours * 60);
        payload.sleepLabel = hoursLabel(manual.sleepHours * 60) + ' manual';
      }
      if (Number.isFinite(manual.steps) && manual.steps > 0) payload.steps = Math.round(manual.steps);
      if (Number.isFinite(manual.activityMinutes) && manual.activityMinutes > 0) payload.activeMinutes = Math.round(manual.activityMinutes);
    }
\n` + s.slice(end);
  s = s.replace('[consent.active, nativeSummary, watchMirrorEnabled]', '[consent.active, manual, watchMirrorEnabled]');
  return s;
});
update('client/src/lib/lifeConcierge.ts', source => {
  // Samsung Companion source union + local snapshot survive the terminal Play policy.
  let s = source
    .replace("source: 'health-connect' | 'manual';", "source: 'health-connect' | 'samsung-companion' | 'manual';")
    .replace('shareGymCheckins: true,', 'shareGymCheckins: false,')
    .replace(/export function ingestHealthSummary\(value: unknown\): LifeHealthSnapshot \| null \{[^]*?\n\}/, `export function ingestHealthSummary(value: unknown): LifeHealthSnapshot | null {
  return null; // Health Connect imports are disabled; manual records remain available.
}`)
    .replace(/function currentSnapshot\(\): LifeHealthSnapshot \| null \{[^]*?\n\}/, `function currentSnapshot(): LifeHealthSnapshot | null {
  const companion = parseHealthSnapshot(readJson<any>(KEYS.companionSummary, null), 'samsung-companion');
  if (companion) return companion;
  const history = readJson<LifeHealthSnapshot[]>(KEYS.healthHistory, []);
  if (!Array.isArray(history)) return null;
  for (const item of history) {
    if (item.source !== 'manual' && item.source !== 'samsung-companion') continue;
    const parsed = parseHealthSnapshot(item, item.source);
    if (parsed) return parsed;
  }
  return null;
}`);
  if (!s.includes("companionSummary: 'crewcheck:life:companion-summary:v1'")) {
    s = s.replace(
      "  nativeSummary: 'crewcheck:life:health-summary:v1',",
      "  nativeSummary: 'crewcheck:life:health-summary:v1',\n  companionSummary: 'crewcheck:life:companion-summary:v1',"
    );
  }
  return s;
});
update('client/src/components/v14314/RoutineDailyConcierge.tsx', s => s
  .replace(/  async function connectHealth\(\) \{[^]*?\n  \}/, `  function openManualLife() {
    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'life' }));
  }`)
  .replace('<button onClick={connectHealth}><HeartPulse/><span><strong>Health Connect</strong><small>Samsung Health e Galaxy Watch</small></span><Check/></button>', '<button onClick={openManualLife}><HeartPulse/><span><strong>CrewLife opcional</strong><small>Registros manuais neste aparelho</small></span><Navigation/></button>'));
console.log('[android-play] Separate version codes, API 36 and Health-Connect-free CrewLife applied.');

update('client/public/manual.html', s => s.replace('O Health Connect pode trazer resumos autorizados. Samsung Health e Galaxy Watch chegam ao CrewCheck por essa sincronização oficial.', 'O CrewCheck principal não acessa Health Connect. Quando o usuário instala e autoriza o CrewLife Companion Samsung, o Companion lê no Samsung Health apenas os resumos escolhidos e os entrega localmente ao CrewCheck. A entrada manual continua disponível.'));

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', s => s.includes('retryPendingRevocation(this, this::dispatchCrewCheckWatchSyncResult)') ? s : s
  .replace('CrewLifeWatchPublisher.revoke(MainActivity.this, null);', 'CrewLifeWatchPublisher.revoke(MainActivity.this, MainActivity.this::dispatchCrewCheckWatchSyncResult);')
  .replace('                java.util.Set<String> categories = java.util.Set.of(', `                if (WatchHealthConsent.isRevocationPending(MainActivity.this)) {
                    CrewLifeWatchPublisher.retryPendingRevocation(MainActivity.this, MainActivity.this::dispatchCrewCheckWatchSyncResult);
                    return false;
                }
                java.util.Set<String> categories = java.util.Set.of(`)
  .replace('                        WatchHealthConsent.CATEGORY_HEART,\n', '')
  .replace('        super.onResume();', `        super.onResume();
        CrewLifeWatchPublisher.retryPendingRevocation(this, this::dispatchCrewCheckWatchSyncResult);`));
update('client/src/components/v1434/CrewCheckLifeView.tsx', s => s.includes('Play store: confirm deletion') ? s : s
  .replace("      toast.success(enabled\n        ? 'CrewLife no relógio ativado. Somente resumos agregados serão enviados.'\n        : 'CrewLife removido do relógio.');", `      if (enabled) toast.success('CrewLife no relógio ativado. Resumos do Companion Samsung ou registros manuais poderão ser enviados.');
      else toast.info('Envio interrompido. Aguardando confirmação da remoção no relógio.');`)
  .replace('  function setWatchMirror(enabled: boolean) {', `  // Play store: confirm deletion only after both Wear data channels acknowledge it.
  useEffect(() => {
    const onRevocation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.code === 'revoked' && detail?.ok === true) toast.success('Remoção dos dados do CrewLife confirmada.');
      if (detail?.code === 'revocation_incomplete') toast.error('Envio desativado. A remoção no relógio ainda está pendente; reabra o app com os aparelhos conectados.');
    };
    window.addEventListener('crewcheck:watch-sync-result', onRevocation);
    return () => window.removeEventListener('crewcheck:watch-sync-result', onRevocation);
  }, []);

  function setWatchMirror(enabled: boolean) {`));
update('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java', s => s
  .replace('TextView sync = heroAction("Sincronizar CrewLife", MAGENTA);\n            sync.setOnClickListener(view -> requestSync());', 'TextView sync = text("Abra CrewLife no celular para atualizar o resumo do Companion ou seus registros manuais.", 9, MUTED, false, Gravity.CENTER);'));
