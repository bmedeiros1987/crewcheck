import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const main = read('client/src/main.tsx');
const css = read('client/src/styles/ui-lab-foundation.css');
const boundary = read('client/src/components/ErrorBoundary.tsx');

const uiImport = 'import "./styles/ui-lab-foundation.css";';
assert.ok(main.includes(uiImport), 'UI Lab foundation must be imported by main.tsx');
assert.ok(
  main.indexOf(uiImport) > main.indexOf('import "./styles/atlas-1c-semantic-navigation.css";'),
  'UI Lab foundation must load after the legacy/navigation visual layers',
);

for (const token of [
  '--cc-ui-motion-fast',
  '--cc-ui-touch',
  '--cc-ui-cyan',
  '--cc-ui-violet',
  '--cc-ui-magenta',
  '.cc-bottom-nav',
  '.cc-bottom-nav-item.active',
  'env(safe-area-inset-bottom',
  'backdrop-filter: blur(22px)',
  '@media (prefers-reduced-motion: reduce)',
  '.cc-error-shell',
  '.cc-error-card',
  '.cc-error-actions',
]) {
  assert.ok(css.includes(token), `missing UI Lab visual contract: ${token}`);
}

assert.ok(
  css.includes('padding-bottom: max(124px') && css.includes('scroll-padding-bottom: max(124px'),
  'content must stay clear of the floating mobile navigation',
);

assert.ok(
  css.includes('min-height: 100dvh') && css.includes('place-items: center'),
  'global recovery state must fill the viewport cleanly',
);

for (const token of [
  'className="cc-error-shell"',
  'className="cc-error-card"',
  'src="/icons/crewcheck-icon-v2.png"',
  'className="cc-error-primary"',
  'className="cc-error-secondary"',
  '<details className="cc-error-details">',
  'Atualizar app',
  'Limpar sessão da escala',
]) {
  assert.ok(boundary.includes(token), `recovery UI contract missing: ${token}`);
}

for (const preserved of [
  "'crewcheck_auth_token'",
  "'crewcheck_user'",
  "'crewcheck_theme_mode'",
  "sessionStorage.setItem('crewcheck_force_view_once', 'diagnostics')",
  "window.location.reload()",
]) {
  assert.ok(boundary.includes(preserved), `recovery behavior changed unexpectedly: ${preserved}`);
}

assert.ok(
  !css.includes('.cz-roster-main{display:none') && !css.includes('.cc-bottom-nav{display:none'),
  'UI foundation must not hide operational roster or canonical mobile navigation',
);

console.log('CrewCheck UI Lab foundation regression: PASS');
