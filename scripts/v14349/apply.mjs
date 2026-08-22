import fs from 'node:fs';

const VERSION = '14.3.49';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14349] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function variants(value) {
  return [...new Set([value, value.replace(/\n/g, '\r\n')])];
}

function insertAfterRequired(source, anchor, value, label) {
  if (variants(value.trim()).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(anchor).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14349] Âncora ausente: ${label}`);
  const eol = matched.includes('\r\n') ? '\r\n' : '\n';
  return source.replace(matched, `${matched}${eol}${value.trimEnd().replace(/\n/g, eol)}`);
}

function removeRequired(source, value, label) {
  if (!variants(value).some((candidate) => source.includes(candidate))) return source;
  const matched = variants(value).find((candidate) => source.includes(candidate));
  if (!matched) throw new Error(`[v14349] Bloco ausente: ${label}`);
  return source.replace(matched, '');
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: FlyDeck simples com Linha do Dia operacional e sem Copiloto cronológico';`);

  next = insertAfterRequired(
    next,
    "import '@/components/v1399/premium.css';",
    "import OperationalDayTimeline from '@/components/v14349/OperationalDayTimeline';",
    'import da Linha do Dia',
  );

  next = removeRequired(
    next,
    `    <section className="cz-flydeck-flow" aria-label="Sequência operacional CrewCheck">
      <header><div><small>COPILOTO CRONOLÓGICO</small><h1>Sua operação em ordem</h1><p>Um passo por vez, sempre usando a mesma escala oficial.</p></div><span>{loaded ? 'ESCALA ATIVA' : 'AGUARDANDO ESCALA'}</span></header>
      <div>{steps.map((step, index) => <button key={step.label} onClick={() => setView(step.view)} data-ready={step.ready}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{step.label}</strong><small>{step.detail}</small></span><em>{step.action}</em><ChevronRight/></button>)}</div>
    </section>
`,
    'Copiloto cronológico antigo',
  );

  next = next.replace(
    /\n\s*const steps: Array<\{ label: string; detail: string; view: ZeroView; ready: boolean; action: string \}> = \[[\s\S]*?\n\s*\];\n/,
    '\n',
  );

  next = insertAfterRequired(
    next,
    '    <SmartCard event={departureEvent} setView={setView}/>',
    "    <OperationalDayTimeline events={events} onNavigate={(target, focusIso) => setView(target as ZeroView, focusIso ?? null)}/>",
    'Linha do Dia após Saída Inteligente',
  );

  if (next.includes('COPILOTO CRONOLÓGICO')) throw new Error('[v14349] O Copiloto cronológico ainda aparece no FlyDeck.');
  if (!next.includes('<OperationalDayTimeline events={events}')) throw new Error('[v14349] A Linha do Dia não foi conectada ao FlyDeck.');
  return next;
});

update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/src/lib/crewcheckPremiumRuntime.ts', (source) => source.replace(/version:\s*'14\.3\.\d+'/, `version: '${VERSION}'`), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'FlyDeck simplificado: Linha do Dia substitui o Copiloto cronológico sem alterar o motor canônico.',
}, null, 2)}\n`);
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/(url\.pathname === '\/api\/(?:release|health)'[^\r\n]*\bversion\s*:\s*)'\d+\.\d+\.\d+'/g, `$1'${VERSION}'`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - operational Line of Day replaces chronological copilot in FlyDeck`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.49:flydeck-line-of-day'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-49-flydeck-line-of-day.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140349')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

console.log(`[v14349] CrewCheck ${VERSION}: Linha do Dia operacional substitui o Copiloto cronológico no FlyDeck.`);
