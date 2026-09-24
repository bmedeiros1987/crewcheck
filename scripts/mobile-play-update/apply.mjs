import fs from 'node:fs';

const activityFile = 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java';
const helperFile = 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckPlayUpdateCoordinator.java';
const gradleFile = 'android-wrapper/app/build.gradle';

for (const file of [activityFile, helperFile, gradleFile]) {
  if (!fs.existsSync(file)) throw new Error(`[mobile-play-update] arquivo ausente: ${file}`);
}

const gradle = fs.readFileSync(gradleFile, 'utf8');
if (!/implementation ['"]com\.google\.android\.play:app-update:2\.1\.0['"]/.test(gradle)) {
  throw new Error('[mobile-play-update] dependência oficial com.google.android.play:app-update:2.1.0 ausente.');
}

let source = fs.readFileSync(activityFile, 'utf8');

if (!source.includes('private CrewCheckPlayUpdateCoordinator playUpdateCoordinator;')) {
  const anchor = '    private CrewCheckBillingBridge billingBridge;';
  if (!source.includes(anchor)) throw new Error('[mobile-play-update] anchor do billing bridge mudou.');
  source = source.replace(anchor, `${anchor}\n    private CrewCheckPlayUpdateCoordinator playUpdateCoordinator;`);
}

if (!source.includes('playUpdateCoordinator = new CrewCheckPlayUpdateCoordinator(this, webView);')) {
  const anchor = '        webView.addJavascriptInterface(billingBridge, "AndroidCrewCheckBilling");';
  if (!source.includes(anchor)) throw new Error('[mobile-play-update] anchor de inicialização do WebView mudou.');
  source = source.replace(anchor, `${anchor}\n        playUpdateCoordinator = new CrewCheckPlayUpdateCoordinator(this, webView);`);
}

if (!source.includes('playUpdateCoordinator.onPageReady();')) {
  const anchor = '                injectCrewCheckBridge();';
  if (!source.includes(anchor)) throw new Error('[mobile-play-update] anchor onPageFinished mudou.');
  source = source.replace(anchor, `${anchor}\n                if (playUpdateCoordinator != null) playUpdateCoordinator.onPageReady();`);
}

if (!source.includes('if (playUpdateCoordinator != null) playUpdateCoordinator.checkForUpdate();')) {
  const resumeAnchor = '    protected void onResume() {\n        super.onResume();';
  if (!source.includes(resumeAnchor)) throw new Error('[mobile-play-update] anchor onResume mudou.');
  source = source.replace(
    resumeAnchor,
    `${resumeAnchor}\n        if (playUpdateCoordinator != null) playUpdateCoordinator.checkForUpdate();`,
  );
}

if (!source.includes('if (playUpdateCoordinator != null) playUpdateCoordinator.destroy();')) {
  const destroyAnchor = '    protected void onDestroy() {';
  if (!source.includes(destroyAnchor)) throw new Error('[mobile-play-update] anchor onDestroy mudou.');
  source = source.replace(
    destroyAnchor,
    `${destroyAnchor}\n        if (playUpdateCoordinator != null) playUpdateCoordinator.destroy();`,
  );
}

for (const required of [
  'private CrewCheckPlayUpdateCoordinator playUpdateCoordinator;',
  'playUpdateCoordinator = new CrewCheckPlayUpdateCoordinator(this, webView);',
  'playUpdateCoordinator.onPageReady();',
  'playUpdateCoordinator.checkForUpdate();',
  'playUpdateCoordinator.destroy();',
]) {
  if (!source.includes(required)) throw new Error(`[mobile-play-update] contrato final ausente: ${required}`);
}

fs.writeFileSync(activityFile, source, 'utf8');
console.log('[mobile-play-update] disponibilidade do Google Play conectada ao lifecycle do app sem instalação/reload forçados.');
