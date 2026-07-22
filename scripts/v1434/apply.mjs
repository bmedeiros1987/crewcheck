import fs from 'node:fs';

const VERSION = '14.3.4';
const MARKER = 'crewcheck-life-v1434';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1434] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1434] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  next = required(next,
    '  BriefcaseBusiness,\n  CalendarDays,',
    '  BriefcaseBusiness,\n  BookOpen,\n  CalendarDays,\n  HeartPulse,',
    'ícones Life e manual');
  next = required(next,
    "import FirstAccessTour from '@/components/v1432/FirstAccessTour';",
    "import FirstAccessTour from '@/components/v1432/FirstAccessTour';\nimport CrewCheckLifeView from '@/components/v1434/CrewCheckLifeView';\nimport ManualCenterView from '@/components/v1434/ManualCenterView';",
    'componentes CrewCheck Life e manual');
  next = required(next,
    "| 'compare' | 'regulation' | 'bids' | 'admin';",
    "| 'compare' | 'regulation' | 'bids' | 'life' | 'manual' | 'admin';",
    'views Life e manual');
  next = required(next,
    "['reports','Relatórios','Indicadores premium',FileText], ['routine','Rotina','Academia e descanso',ShieldCheck], ['crew','Crew / Chefe'",
    "['reports','Relatórios','Indicadores premium',FileText], ['routine','Rotina','Academia e descanso',ShieldCheck], ['life','CrewCheck Life','Sono, rotina e bem-estar',HeartPulse], ['manual','Manual CrewCheck','Ajuda, PDFs e tutorial',BookOpen], ['crew','Crew / Chefe'",
    'itens Life e manual no menu');
  next = required(next,
    "if (value === 'manual' || value === 'departure' || value === 'smartDeparture') return 'departure';",
    "if (value === 'life' || value === 'crewcheck-life' || value === 'saude' || value === 'saúde' || value === 'bem-estar') return 'life';\n  if (value === 'manual' || value === 'ajuda' || value === 'guia') return 'manual';\n  if (value === 'departure' || value === 'smartDeparture') return 'departure';",
    'normalização de rotas Life e manual');
  next = required(next,
    "{view === 'routine' && <RoutineView bundle={bundle}/>}",
    "{view === 'routine' && <RoutineView bundle={bundle}/>}\n    {view === 'life' && <CrewCheckLifeView nextProgram={event ? { title: event.title, date: event.day?.date, presentation: event.presentation, departure: event.departure, kind: event.kind } : null}/>}\n    {view === 'manual' && <ManualCenterView/>}",
    'renderização CrewCheck Life e manual');
  next = next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: CrewCheck Life opcional, Health Connect local, manual incorporado e tutorial ampliado';`);
  if (!next.includes("['life','CrewCheck Life'") || !next.includes("view === 'manual'") || !next.includes("return 'life';")) {
    throw new Error('[v1434] Home não recebeu CrewCheck Life e Manual Center.');
  }
  return next;
});

update('client/src/main.tsx', (source) => {
  if (source.includes('v1434/crewcheck-life.css')) return source;
  const lines = source.split('\n');
  let lastImport = -1;
  lines.forEach((line, index) => { if (/^import\s/.test(line)) lastImport = index; });
  if (lastImport < 0) throw new Error('[v1434] Nenhum import encontrado em client/src/main.tsx.');
  lines.splice(lastImport + 1, 0, 'import "./components/v1434/crewcheck-life.css";');
  return lines.join('\n');
});

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));

update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`)
  .replace(/CREWCHECK V[^•<]+• PREMIUM BETA/g, `CREWCHECK V${VERSION} • PREMIUM BETA`), { optional: true });

update('server/platform.mjs', (source) => source
  .replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });

update('server.mjs', (source) => source
  .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
  .replace(/CrewCheck \d+\.\d+\.\d+ - Safe Shell/g, `CrewCheck ${VERSION} - Safe Shell`)
  .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
  .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`));

update('android-wrapper/build.gradle', (source) => required(source,
  "id 'com.android.application' version '8.7.3' apply false",
  "id 'com.android.application' version '8.7.3' apply false\n    id 'org.jetbrains.kotlin.android' version '2.0.21' apply false",
  'plugin Kotlin Android'), { optional: true });

update('android-wrapper/app/build.gradle', (source) => {
  let next = source;
  next = required(next,
    "plugins {\n    id 'com.android.application'\n}",
    "plugins {\n    id 'com.android.application'\n    id 'org.jetbrains.kotlin.android'\n}",
    'plugin Kotlin no app');
  if (!next.includes('kotlinOptions')) {
    next = required(next,
      "    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }",
      "    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }\n\n    kotlinOptions {\n        jvmTarget = '17'\n    }",
      'Kotlin JVM 17');
  }
  if (!next.includes('androidx.health.connect:connect-client:1.1.0')) {
    next = required(next,
      '    implementation "com.android.billingclient:billing:$billing_version"',
      '    implementation "com.android.billingclient:billing:$billing_version"\n    implementation "androidx.health.connect:connect-client:1.1.0"\n    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0"',
      'dependências Health Connect');
  }
  return next
    .replace(/versionCode\s+\d+/, 'versionCode 140304')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`);
}, { optional: true });

update('android-wrapper/app/src/main/AndroidManifest.xml', (source) => {
  let next = source;
  if (!next.includes('android.permission.health.READ_SLEEP')) {
    next = required(next,
      '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
      '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n    <uses-permission android:name="android.permission.health.READ_SLEEP" />\n    <uses-permission android:name="android.permission.health.READ_STEPS" />\n    <uses-permission android:name="android.permission.health.READ_DISTANCE" />\n    <uses-permission android:name="android.permission.health.READ_EXERCISE" />\n    <uses-permission android:name="android.permission.health.READ_RESTING_HEART_RATE" />',
      'permissões mínimas Health Connect');
  }
  if (!next.includes('com.google.android.apps.healthdata')) {
    next = required(next,
      '    <application',
      '    <queries>\n        <package android:name="com.google.android.apps.healthdata" />\n    </queries>\n    <application',
      'consulta ao provedor Health Connect');
  }
  if (!next.includes('.HealthPermissionsRationaleActivity')) {
    next = required(next,
      '        <receiver android:name=".CrewCheckNotificationReceiver" android:exported="false" />',
      '        <activity android:name=".HealthPermissionsRationaleActivity" android:exported="true">\n            <intent-filter>\n                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />\n            </intent-filter>\n        </activity>\n        <activity-alias android:name=".ViewHealthPermissionUsageActivity" android:exported="true" android:targetActivity=".HealthPermissionsRationaleActivity" android:permission="android.permission.START_VIEW_PERMISSION_USAGE">\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />\n                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />\n            </intent-filter>\n        </activity-alias>\n        <receiver android:name=".CrewCheckNotificationReceiver" android:exported="false" />',
      'política de privacidade Health Connect');
  }
  if (/READ_(?:BLOOD|GLUCOSE|WEIGHT|BODY|MEDICAL|MENSTRUATION)/.test(next)) throw new Error('[v1434] Manifest solicitou dado clínico fora do escopo CrewCheck Life.');
  return next;
}, { optional: true });

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;
  next = required(next,
    '    private CrewCheckBillingBridge billingBridge;',
    '    private CrewCheckBillingBridge billingBridge;\n    private CrewCheckHealthBridge healthBridge;',
    'campo da ponte Health Connect');
  next = required(next,
    '        webView.addJavascriptInterface(new CrewCheckNativeBridge(), "AndroidCrewCheckNative");\n        billingBridge = new CrewCheckBillingBridge(this, webView);',
    '        webView.addJavascriptInterface(new CrewCheckNativeBridge(), "AndroidCrewCheckNative");\n        healthBridge = new CrewCheckHealthBridge(this, webView);\n        webView.addJavascriptInterface(healthBridge, "AndroidCrewCheckHealth");\n        billingBridge = new CrewCheckBillingBridge(this, webView);',
    'registro da ponte Health Connect');
  next = required(next,
    '        super.onActivityResult(requestCode, resultCode, data);\n        if (requestCode == FILE_CHOOSER_REQUEST_CODE)',
    '        super.onActivityResult(requestCode, resultCode, data);\n        if (healthBridge != null && healthBridge.handleActivityResult(requestCode, resultCode, data)) return;\n        if (requestCode == FILE_CHOOSER_REQUEST_CODE)',
    'resultado de permissões Health Connect');
  next = required(next,
    '        if (billingBridge != null) {\n            billingBridge.destroy();\n            billingBridge = null;\n        }\n        if (webView != null)',
    '        if (billingBridge != null) {\n            billingBridge.destroy();\n            billingBridge = null;\n        }\n        if (healthBridge != null) {\n            healthBridge.destroy();\n            healthBridge = null;\n        }\n        if (webView != null)',
    'limpeza da ponte Health Connect');
  return next;
}, { optional: true });

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - optional local-first CrewCheck Life, Health Connect bridge, embedded manuals and extended tutorial`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.4'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-4-crewcheck-life.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1434] CrewCheck ${VERSION}: ${MARKER}, Life local-first, Health Connect, manual incorporado e tutorial ampliado.`);
