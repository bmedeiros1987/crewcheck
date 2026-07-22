import fs from 'node:fs';

const VERSION = '14.3.5';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1435] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfter(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(`[v1435] Âncora não encontrada: ${label}`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  next = insertAfter(next,
    "import ManualCenterView from '@/components/v1434/ManualCenterView';",
    "import CrewLockerView from '@/components/v1435/CrewLockerView';",
    'import CrewLocker');
  next = next.replace(
    "| 'compare' | 'regulation' | 'bids' | 'life' | 'manual' | 'admin';",
    "| 'compare' | 'regulation' | 'bids' | 'life' | 'manual' | 'crewlocker' | 'admin';",
  );
  if (!next.includes("['crewlocker','CrewLocker'")) {
    next = next.replace(
      "['life','CrewCheck Life','Sono, rotina e bem-estar',HeartPulse], ['manual','Manual CrewCheck','Ajuda, PDFs e tutorial',BookOpen],",
      "['life','CrewCheck Life','Sono, rotina e bem-estar',HeartPulse], ['crewlocker','CrewLocker','Documentos protegidos offline',ShieldCheck], ['manual','Manual CrewCheck','Ajuda, PDFs e tutorial',BookOpen],",
    );
  }
  if (!next.includes("return 'crewlocker';")) {
    next = next.replace(
      "if (value === 'manual' || value === 'ajuda' || value === 'guia') return 'manual';",
      "if (value === 'crewlocker' || value === 'crewlock' || value === 'documentos' || value === 'carteira') return 'crewlocker';\n  if (value === 'manual' || value === 'ajuda' || value === 'guia') return 'manual';",
    );
  }
  if (!next.includes("view === 'crewlocker'")) {
    next = next.replace(
      "{view === 'manual' && <ManualCenterView/>}",
      "{view === 'manual' && <ManualCenterView/>}\n    {view === 'crewlocker' && <CrewLockerView/>}",
    );
  }
  return next
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: CrewLocker criptografado offline, validade documental e base Guardian';`);
});

update('client/src/main.tsx', (source) => {
  if (source.includes('v1435/crewlocker.css')) return source;
  const lines = source.split('\n');
  let lastImport = -1;
  lines.forEach((line, index) => { if (/^import\s/.test(line)) lastImport = index; });
  if (lastImport < 0) throw new Error('[v1435] Import não encontrado em main.tsx.');
  lines.splice(lastImport + 1, 0, 'import "./components/v1435/crewlocker.css";');
  return lines.join('\n');
});

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
  .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
  .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });

update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140305')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - encrypted offline CrewLocker and Guardian document foundation`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.5'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-5-crewlocker.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1435] CrewCheck ${VERSION}: CrewLocker criptografado, armazenamento persistente e documentos disponíveis offline.`);
await import('../v1436/apply.mjs');
