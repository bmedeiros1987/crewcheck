import fs from 'node:fs';

const VERSION = '14.3.56';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14356] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

const assistedIFlightView = `function IFlightPushView({ actions }: { actions: QuickActions }) {
  const now = new Date();
  const [step, setStep] = useState<'period' | 'portal' | 'generate' | 'download'>(() => {
    const saved = storage.get('crewcheck:iflight-assisted-step', 'period');
    return ['period', 'portal', 'generate', 'download'].includes(saved) ? saved as 'period' | 'portal' | 'generate' | 'download' : 'period';
  });
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const periodLabel = \`\${periodMonth}/\${periodYear}\`;

  function advance(next: 'period' | 'portal' | 'generate' | 'download') {
    setStep(next);
    storage.set('crewcheck:iflight-assisted-step', next);
  }

  function openPortal() {
    advance('portal');
    window.open('https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage', 'crewcheck-iflight', 'noopener,noreferrer');
    toast.message(\`iFlight aberto. Entre com sua conta e selecione a escala de \${periodLabel}.\`);
  }

  function confirmLocalTime() {
    advance('generate');
    toast.message('No iFlight, confirme Local Time (LT) e gere o CrewRosterReport em PDF.');
  }

  function importDownloaded() {
    advance('download');
    actions.upload();
  }

  const steps = [
    ['period', 'Escolher período', \`Escala de \${periodLabel}.\`],
    ['portal', 'Login e MFA', 'Digite somente no portal corporativo oficial.'],
    ['generate', 'Gerar PDF em LT', 'Baixe o CrewRosterReport autorizado.'],
    ['download', 'Importar download', 'O CrewCheck valida e processa o PDF.'],
  ] as const;

  return <><Brand back/><section className="cz-panel-head"><h1>Baixar escala do iFlight</h1><p>Fluxo semiautomático para Web/PWA: o CrewCheck abre o portal oficial, orienta o download e importa o PDF sem armazenar credenciais.</p></section>
    <section className="cz-toolbox cc-iflight-wizard"><header><ShieldCheck/><div><small>DOWNLOAD SEMIAUTOMÁTICO · SESSÃO CORPORATIVA EFÊMERA</small><h2>Importação protegida</h2></div></header>
      <div className="cz-iflight-period"><label><span>Mês</span><select value={periodMonth} onChange={(event) => { setPeriodMonth(event.target.value); advance('period'); }}>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{month}</option>)}</select></label><label><span>Ano</span><input value={periodYear} onChange={(event) => { setPeriodYear(event.target.value.replace(/\\D/g, '').slice(0, 4)); advance('period'); }} inputMode="numeric"/></label></div>
      <div className="cc-iflight-steps">{steps.map(([id, title, detail], index) => <article className={step === id ? 'active' : ''} key={id}><span>{index + 1}</span><div><strong>{title}</strong><small>{detail}</small></div></article>)}</div>
      <div className="cz-tool-actions"><button className="primary" onClick={openPortal}><Globe2/> 1. Abrir iFlight</button><button onClick={confirmLocalTime}><Clock/> 2. Gerar PDF em LT</button><button onClick={importDownloaded}><Upload/> 3. Selecionar PDF baixado</button></div>
    </section>
    <section className="cz-mini-status"><p><strong>Como funciona:</strong> faça login e MFA no próprio iFlight, escolha \${periodLabel}, gere o CrewRosterReport em PDF e volte para selecionar o arquivo baixado.</p><p><strong>Limite do navegador:</strong> por segurança, o CrewCheck não pode vigiar sua pasta Downloads nem clicar dentro de outro site. A escolha final do PDF exige sua confirmação.</p><p><strong>Privacidade:</strong> usuário, senha, MFA, cookie e sessão não são enviados ao CrewCheck.</p></section>
  </>;
}`;

export function patchIFlightSemiAutomaticV14356(source) {
  const start = source.indexOf('function IFlightPushView(');
  const end = start >= 0 ? source.indexOf('function dutyHoursForRosterDay(', start) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14356] Fluxo iFlight não localizado. start=${start} end=${end}`);
  if (source.slice(start, end).includes('DOWNLOAD SEMIAUTOMÁTICO')) return source;
  const eol = source.slice(start, end).includes('\r\n') ? '\r\n' : '\n';
  const block = assistedIFlightView.replace(/\n/g, eol);
  return `${source.slice(0, start)}${block}${eol}${eol}${source.slice(end)}`;
}

if (process.env.CREWCHECK_V14356_SKIP_APPLY !== '1') {
  update('client/src/pages/Home.tsx', (source) => patchIFlightSemiAutomaticV14356(source)
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(
      /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
      `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: download semiautomático da escala no portal oficial iFlight';`,
    ));
  update('client/src/index.css', (source) => source.includes('.cz-iflight-period')
    ? source
    : `${source.trimEnd()}\n\n/* CrewCheck v14.3.56 — período do download semiautomático iFlight */\n.cz-iflight-period{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem;margin:1rem 0}.cz-iflight-period label{display:grid;gap:.35rem}.cz-iflight-period span{font-size:.72rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.cz-iflight-period select,.cz-iflight-period input{min-height:2.8rem;border:1px solid var(--cc-border,rgba(148,163,184,.25));border-radius:.9rem;background:var(--cc-surface,#fff);color:var(--cc-ink,#0f172a);padding:.65rem .8rem;font:inherit}@media(max-width:520px){.cz-iflight-period{grid-template-columns:1fr}}\n`);
  update('client/src/App.tsx', (source) => source
    .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
    .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Download semiautomático do CrewRosterReport pelo portal oficial iFlight, sem armazenar credenciais.',
  }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - assisted iFlight roster download`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.56:iflight-assisted-download'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-56-iflight-assisted-download.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140356')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14356] CrewCheck ${VERSION}: download semiautomático iFlight preparado para Web/PWA.`);
}
