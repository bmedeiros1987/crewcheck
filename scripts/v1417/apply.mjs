import fs from 'node:fs';

const VERSION = '14.1.7';

function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const current = fs.readFileSync(path, 'utf8');
  const next = transform(current);
  if (next !== current) fs.writeFileSync(path, next, 'utf8');
}

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: notificações persistentes, Telegram em fila, meteorologia legível e rota ao vivo';`)
  .replaceAll('activateLocalReminder', 'activateServerReminder')
  .replaceAll('Ativar lembrete local', 'Ativar no servidor')
  .replaceAll('Saída Inteligente', 'Planejador de Saída'));

update('server.mjs', (source) => {
  let next = source
    .replaceAll("version:'13.9.9'", `version:'${VERSION}'`)
    .replaceAll("version: '13.9.9'", `version: '${VERSION}'`)
    .replaceAll("version:'14.0.9'", `version:'${VERSION}'`)
    .replaceAll("version: '14.0.9'", `version: '${VERSION}'`)
    .replaceAll('Saída Inteligente', 'Planejador de Saída')
    .replaceAll('calcular a Planejador de Saída', 'usar o Planejador de Saída')
    .replaceAll('abra Planejador de Saída', 'abra o Planejador de Saída')
    .replaceAll('Abra Planejador de Saída', 'Abra o Planejador de Saída');
  if (!next.includes("import './server/telegram-fast-ack.mjs';")) {
    next = next.replace("import { fileURLToPath } from 'node:url';", "import { fileURLToPath } from 'node:url';\nimport './server/telegram-fast-ack.mjs';");
  }
  return next;
});

update('server/telegram-fast-ack.mjs', (source) => source
  .replace(/const RUNTIME_VERSION = '[^']+';/, "const RUNTIME_VERSION = '14.1.7-operational-intelligence';"));

update('client/src/main.tsx', (source) => source.includes('v1417/operational-intelligence.css')
  ? source
  : source.replace('import "./components/v1409/layout-lock.css";', 'import "./components/v1409/layout-lock.css";\nimport "./components/v1417/operational-intelligence.css";'));

update('render.yaml', (source) => source
  .replace(/startCommand:\s*node server\.mjs/, 'startCommand: npm start'));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - operational notification and route intelligence`;
  data.scripts ||= {};
  data.scripts['regression:v14.1.7:operational-intelligence'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-1-7-operational-intelligence.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

update('package-lock.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  if (data.packages?.['']) data.packages[''].version = VERSION;
  return `${JSON.stringify(data, null, 2)}\n`;
});

for (const path of ['public/manifest.webmanifest', 'public/manifest.json', 'public/sw.js', 'client/public/manifest.webmanifest']) {
  update(path, (source) => source.replace(/14\.0\.9|13\.9\.9/g, VERSION));
}

for (const path of ['android-wrapper/app/build.gradle', 'android/app/build.gradle']) {
  update(path, (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 14107')
    .replace(/versionName\s+"[^"]+"/, `versionName "${VERSION}"`));
}

if (fs.existsSync('server/telegram-fast-ack.mjs')) {
  const runtime = fs.readFileSync('server/telegram-fast-ack.mjs', 'utf8');
  const runtimeMarkers = [
    "const RUNTIME_VERSION = '14.1.7-operational-intelligence';",
    'async function runCommuteMonitorCycle(db)',
    'summary.commute = await runCommuteMonitorCycle(db);',
    "path === '/api/commute/monitor'",
  ];
  for (const marker of runtimeMarkers) {
    if (!runtime.includes(marker)) throw new Error(`[v1417] Runtime incompleto após a cadeia de patches: ${marker}`);
  }
}

console.log(`[v1417] CrewCheck ${VERSION}: runtime persistente, Telegram rápido, rota ao vivo e meteorologia acessível.`);
