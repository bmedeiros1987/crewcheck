import fs from 'node:fs';
import path from 'node:path';

const VERSION = '14.3.79';

function update(filePath, transform, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return;
    throw new Error(`[v14379] Arquivo ausente: ${filePath}`);
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(filePath, after, 'utf8');
}

function write(filePath, content) {
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  if (before === content) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readLocal(name) {
  return fs.readFileSync(new URL(name, import.meta.url), 'utf8');
}

export function patchSideDrawerV14379(source) {
  let patched = source;

  if (!patched.includes("import './shell-premium.css';")) {
    const needle = "import { useState, useEffect } from 'react';";
    if (!patched.includes(needle)) throw new Error('[v14379] Import React do SideDrawer não localizado.');
    patched = patched.replace(needle, `${needle}\nimport './shell-premium.css';`);
  }

  patched = patched
    .replace('className="cc-drawer"', 'className="cc-drawer cc-shell-premium"')
    .replace('className={`cc-sidebar ${collapsed ? \'collapsed\' : \'\'}`}', 'className={`cc-sidebar cc-shell-premium ${collapsed ? \'collapsed\' : \'\'}`}')
    .replace('/* Header */\n        <div style={{ display: \'flex\'', '/* Header */\n        <div className="cc-drawer-topbar" style={{ display: \'flex\'')
    .replace('/* Profile */\n        <button\n          onClick={() => handleNav(\'settings\', true)}', '/* Profile */\n        <button\n          className="cc-profile-card"\n          onClick={() => handleNav(\'settings\', true)}')
    .replace('/* Footer */\n        <div style={{ padding: \'0.75rem\'', '/* Footer */\n        <div className="cc-drawer-footer" style={{ padding: \'0.75rem\'')
    .replace('<button\n            onClick={() => { onPowerOff?.(); onClose?.(); }}\n            style={{ display: \'flex\'', '<button\n            className="cc-logout-button"\n            onClick={() => { onPowerOff?.(); onClose?.(); }}\n            aria-label="Encerrar sessão"\n            style={{ display: \'flex\'')
    .replace('<button\n          onClick={onPowerOff}\n          title={collapsed ? \'Sair\' : undefined}', '<button\n          className="cc-logout-button"\n          onClick={onPowerOff}\n          aria-label="Encerrar sessão"\n          title={collapsed ? \'Encerrar sessão\' : undefined}');

  const closeButton = `<button\n            onClick={onClose}\n            style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--surface)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--foreground-muted)' }}\n            aria-label="Fechar"\n          >\n            <X size={14} />\n          </button>`;

  if (!patched.includes('className="cc-drawer-header-actions"') && patched.includes(closeButton)) {
    patched = patched.replace(closeButton, `<div className="cc-drawer-header-actions">\n          <button\n            type="button"\n            className="cc-header-action logout"\n            onClick={() => { onPowerOff?.(); onClose?.(); }}\n            aria-label="Encerrar sessão"\n            title="Encerrar sessão"\n          >\n            <LogOut size={16} />\n          </button>\n          <button\n            type="button"\n            className="cc-header-action"\n            onClick={onClose}\n            aria-label="Fechar menu"\n            title="Fechar menu"\n          >\n            <X size={16} />\n          </button>\n        </div>`);
  }

  if (!patched.includes('cc-shell-premium')) throw new Error('[v14379] Shell premium não aplicado.');
  if (!patched.includes('cc-drawer-header-actions')) throw new Error('[v14379] Atalho de logout do cabeçalho mobile não aplicado.');
  return patched;
}

if (process.env.CREWCHECK_V14379_SKIP_APPLY !== '1') {
  write('client/src/components/premium/shell-premium.css', readLocal('./shell-premium.css'));
  update('client/src/components/premium/SideDrawer.tsx', patchSideDrawerV14379);
  update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`), { optional: true });
  update('client/public/release.json', () => `${JSON.stringify({
    version: VERSION,
    channel: 'web',
    updatePolicy: 'automatic-safe',
    notes: 'Cabeçalho, perfil e logout mais profissionais e acessíveis em Web/PWA/APK.',
  }, null, 2)}\n`, { optional: true });
  update('package.json', (source) => {
    const data = JSON.parse(source);
    data.version = VERSION;
    data.description = `CrewCheck v${VERSION} - premium shell profile and logout audit`;
    data.scripts ||= {};
    data.scripts['regression:v14.3.79:shell-visual'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-79-shell-visual.mjs';
    return `${JSON.stringify(data, null, 2)}\n`;
  });
  update('android-wrapper/app/build.gradle', (source) => source
    .replace(/versionCode\s+\d+/, 'versionCode 140379')
    .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });

  console.log(`[v14379] CrewCheck ${VERSION}: shell, perfil e logout premium aplicados.`);
}
