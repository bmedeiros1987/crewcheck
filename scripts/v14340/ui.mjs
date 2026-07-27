import fs from 'node:fs';

const VERSION = '14.3.40';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14340] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14340] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}
const brandBlock = String.raw`function CrewCheckMark({ className = 'cz-logo', size = 26 }: { className?: string; size?: number }) {
  return <span className={className} data-crewcheck-brand="canonical" aria-label="CrewCheck"><img src="/icons/crewcheck-icon-v3.png?v=14340" width={size} height={size} alt="" /></span>;
}
function Brand({ back, onMenu }: { back?: boolean; onMenu?: () => void }) {
  const click = onMenu || (back ? (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))) : (() => window.dispatchEvent(new Event('crewcheck:open-menu'))));
  return <header className="cz-brand-row">
    <button className="cz-menu-btn" onClick={click} aria-label={back ? 'Voltar ao FlyDeck' : 'Menu'}>{back ? '←' : <Menu size={28}/>}</button>
    <div className="cz-brand-lockup"><CrewCheckMark/><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div></div>
  </header>;
}`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: importação permissiva, resgate Jasper e logo unificada';`);
  next = replaceBlock(next, 'function CrewCheckMark(', 'function complianceAlertSignature(', brandBlock, 'marca canônica do cabeçalho');
  if (!next.includes('A escala será importada mesmo assim')) {
    const guardStart = next.indexOf('      const decision = confirmRosterImport(roster, file.name);');
    const guardEnd = guardStart >= 0 ? next.indexOf('      if (auditImport) {', guardStart) : -1;
    if (guardStart < 0 || guardEnd < 0) throw new Error(`[v14340] Guardião de importação não localizado. start=${guardStart} end=${guardEnd}`);
    const permissive = `      const decision = confirmRosterImport(roster, file.name);\n      let auditImport = false;\n      if (!decision.ok) {\n        toast.warning(\`${'${decision.toastText || "A auditoria encontrou divergências."}'} A escala será importada mesmo assim; confira os dados após abrir.\`);\n      }\n`;
    next = `${next.slice(0, guardStart)}${permissive}${next.slice(guardEnd)}`;
  }
  return next;
});

const brandCss = `
/* CrewCheck v14.3.40 — marca do cabeçalho aplicada em toda a plataforma */
[data-crewcheck-brand="canonical"] { overflow: hidden; background: linear-gradient(135deg, #9A4DFF 0%, #EC2C86 52%, #27C3E8 100%) !important; color: #fff !important; }
[data-crewcheck-brand="canonical"] img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
`;
update('client/src/index.css', (source) => source.includes('CrewCheck v14.3.40 — marca do cabeçalho') ? source : `${source.trimEnd()}\n${brandCss}\n`);
update('client/src/lib/brand.ts', (source) => source.replaceAll('/icons/crewcheck-icon-v2.png', '/icons/crewcheck-icon-v3.png'));
update('client/index.html', (source) => source
  .replaceAll('/icons/crewcheck-icon-v2.png', '/icons/crewcheck-icon-v3.png')
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/crewcheck-icon-v3\.png\?v=\d+/g, `crewcheck-icon-v3.png?v=${VERSION_DIGITS}`));
update('client/public/manifest.json', (source) => {
  const manifest = JSON.parse(source);
  manifest.start_url = `/?source=pwa&v=${VERSION}`;
  manifest.version = VERSION;
  manifest.icons = (manifest.icons || []).map((icon) => ({ ...icon, src: `/icons/crewcheck-icon-v3.png?v=${VERSION_DIGITS}` }));
  manifest.shortcuts = (manifest.shortcuts || []).map((shortcut) => ({ ...shortcut, icons: (shortcut.icons || []).map((icon) => ({ ...icon, src: `/icons/crewcheck-icon-v3.png?v=${VERSION_DIGITS}` })) }));
  return `${JSON.stringify(manifest, null, 2)}\n`;
});
update('android-wrapper/app/build.gradle', (source) => source.replaceAll('crewcheck-icon-v2.png', 'crewcheck-icon-v3.png'));
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });

fs.mkdirSync('client/public/icons', { recursive: true });
const oldIcon = 'client/public/icons/crewcheck-icon-v2.png';
const newIcon = 'client/public/icons/crewcheck-icon-v3.png';
if (fs.existsSync(oldIcon)) fs.copyFileSync(oldIcon, newIcon);
const canonicalSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="CrewCheck"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9A4DFF"/><stop offset=".52" stop-color="#EC2C86"/><stop offset="1" stop-color="#27C3E8"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#g)"/><path d="M370 146c-18-9-53 1-80 28l-42 42-96-21-25 25 76 44-34 39-41-5-20 20 52 30 30 52 20-20-5-41 39-34 44 76 25-25-21-96 42-42c27-27 37-62 28-80-8-7-20-5-42 8Z" fill="#fff"/></svg>`;
fs.mkdirSync('client/public/brand', { recursive: true });
fs.writeFileSync('client/public/brand/crewcheck-mark.svg', canonicalSvg, 'utf8');
fs.writeFileSync('client/public/brand/crewcheck-play-store-source.svg', canonicalSvg, 'utf8');
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Importação sem bloqueio por qualidade, resgate visual de CrewRosterReport rotacionado e logo do cabeçalho unificada.' }, null, 2)}\n`, 'utf8');

console.log(`[v14340] CrewCheck ${VERSION}: importação permissiva, parser Jasper rotacionado, resgate visual cliente/servidor e marca canônica unificada.`);
