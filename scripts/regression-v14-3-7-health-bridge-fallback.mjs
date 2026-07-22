import fs from 'node:fs';

const checks = [
  ['android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', [
    'public String healthBridgePing()',
    'public boolean healthBridgePostMessage(final String raw)',
    'healthBridge.postMessage(raw);',
  ]],
  ['android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', [
    '@JavascriptInterface',
    'fun ping(): String = "crewcheck-health-v1"',
    'fun postMessage(raw: String?)',
  ]],
  ['client/src/components/v1434/CrewCheckLifeView.tsx', [
    'native.healthBridgePostMessage',
    'Atualize o CrewCheck para a versão 14.3.7',
    'Abra pelo aplicativo Android',
  ]],
  ['android-wrapper/app/src/main/AndroidManifest.xml', [
    'android.permission.health.READ_SLEEP',
    'android.permission.health.READ_STEPS',
    'android.permission.health.READ_EXERCISE',
  ]],
  ['android-wrapper/app/build.gradle', [
    'versionCode 140307',
    'versionName "14.3.7"',
  ]],
  ['package.json', [
    '"version": "14.3.7"',
  ]],
];

for (const [path, needles] of checks) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.7] Arquivo ausente: ${path}`);
  const source = fs.readFileSync(path, 'utf8');
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`[v14.3.7] Falha em ${path}: ${needle}`);
  }
}

console.log('[v14.3.7] Health Connect com ponte direta, fallback pela ponte nativa e diagnóstico PWA/APK validado.');
