import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.CREWCHECK_V14378_SKIP_APPLY = '1';
const { patchAuthPageV14378 } = await import('./v14378/apply.mjs');

// --- Bug 1: theme toggle buttons updated only their own active state, never the page ---
// Root cause: v14378's effect-replacement anchor hard-coded the release version literal
// ('14.0.6'). By the time v14378 actually runs in the real scripts/v139/apply.mjs chain,
// earlier scripts (e.g. v14343's blanket /14\.3\.\d+/g bump) have already rewritten that
// literal, so the string match silently failed - themeMode state and the three buttons got
// wired in, but the effect that applies theme to the DOM/localStorage stayed mounted with
// an empty [] dependency array forever. Reproduce the exact drift and prove the fix survives it.
{
  const driftedVersion = '14.3.55'; // whatever the real chain has bumped it to by the time v14378 runs
  const fixture = [
    "import './auth-compact.css';",
    "import { Eye, EyeOff, Lock, Mail, Plane, Send, ShieldCheck, Sparkles } from 'lucide-react';",
    "export default function AuthPage() {",
    "  const [termsAccepted, setTermsAccepted] = useState(false);",
    "  useEffect(() => {",
    "    const saved = localStorage.getItem('crewcheck_theme_mode');",
    "    const themeMode = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';",
    "    const light = themeMode === 'light' || (themeMode === 'system' && !window.matchMedia?.('(prefers-color-scheme: dark)').matches);",
    "    document.documentElement.dataset.crewThemeMode = themeMode;",
    "    document.documentElement.dataset.crewTheme = light ? 'light' : 'dark';",
    "    document.documentElement.classList.toggle('dark', !light);",
    "    document.documentElement.style.colorScheme = light ? 'light' : 'dark';",
    "    localStorage.setItem('crewcheck_theme_mode', themeMode);",
    `    localStorage.setItem('crewcheck_last_loaded_version', '${driftedVersion}');`,
    "  }, []);",
    '  return <div className="cz-auth cc-auth-compact" data-version="14.3.55">',
    '    <section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section>',
    '    CREWCHECK V14.3.55 • ACESSO PROTEGIDO',
    '  </div>;',
    '}',
  ].join('\n');

  const patched = patchAuthPageV14378(fixture);

  assert.ok(
    patched.includes('}, [themeMode]);'),
    'BUG REPRODUCED: version-string drift must not silently defeat the theme-effect replacement',
  );
  assert.ok(!/localStorage\.getItem\('crewcheck_theme_mode'\);\n\s*const themeMode[\s\S]*?\}, \[\]\);/.test(patched), 'old effect (empty deps, re-reads localStorage) must be gone');
  assert.ok(patched.includes("onClick={() => setThemeMode('dark')}"), 'dark mode button must still be wired');
  assert.ok(patched.includes('cc-auth-premium'), 'premium class contract must still be applied');

  // Idempotency: applying the patch to its own output must not throw and must not reintroduce the bug.
  const patchedTwice = patchAuthPageV14378(patched);
  assert.equal(patchedTwice, patched, 'patch must be idempotent when applied to already-patched source');
}

// A source that already has an unrelated effect shape (neither the old nor the new form)
// must fail loudly instead of silently doing nothing, so this exact bug class cannot recur unnoticed.
{
  const brokenFixture = [
    "import './auth-compact.css';",
    "export default function AuthPage() {",
    "  const [termsAccepted, setTermsAccepted] = useState(false);",
    "  useEffect(() => { /* something unrelated */ }, []);",
    '  return <div className="cz-auth cc-auth-compact" data-version="14.3.55">',
    '    <section className="cz-auth-brand"><span><Plane/></span><div><strong>CrewCheck</strong><small>ROSTER INTELLIGENCE</small></div><p><em>Premium</em><b>Beta</b></p></section>',
    '  </div>;',
    '}',
  ].join('\n');
  assert.throws(() => patchAuthPageV14378(brokenFixture), /Efeito de tema/, 'must throw loudly, not silently no-op, when the theme effect anchor truly cannot be found');
}

// --- Bug 2: label icon hidden via display:none shifts label text into the 20px icon column ---
const authCompactCss = fs.readFileSync('scripts/v14357/auth-compact.css', 'utf8');
assert.ok(
  authCompactCss.includes('.cz-auth.cc-auth-compact .cz-login-card label > svg {\n  /* display:none removes the icon') ||
  /\.cz-auth\.cc-auth-compact \.cz-login-card label > svg \{[\s\S]*?visibility: hidden !important;/.test(authCompactCss),
  'label icon must stay visibility:hidden (still a grid item), not display:none (removed from grid flow)',
);
assert.equal(
  /\.cz-auth\.cc-auth-compact \.cz-login-card label > svg \{[\s\S]*?display: none/.test(authCompactCss),
  false,
  'label icon rule must not regress back to display:none',
);

// --- Bug 3: terms checkbox <input> matched the generic full-row input rule, pushing the
// terms <span> into the same narrow 20px column as the icon ---
const entryPolishCss = fs.readFileSync('client/src/styles/auth-p1-entry-polish.css', 'utf8');
assert.ok(entryPolishCss.includes('.cz-auth .cz-auth-terms > input {'), 'terms checkbox must be pinned to its own grid cell');
assert.ok(entryPolishCss.includes('.cz-auth .cz-auth-terms > span {'), 'terms text must be pinned to the wide grid cell, not auto-placed');
assert.match(entryPolishCss, /\.cz-auth \.cz-auth-terms > input \{[^}]*grid-column: 1 !important;/, 'checkbox must be pinned to column 1');
assert.match(entryPolishCss, /\.cz-auth \.cz-auth-terms > span \{[^}]*grid-column: 2 !important;/, 'terms text must be pinned to column 2 (the wide minmax(0,1fr) track)');

console.log('Auth theme-toggle and label-wrap regression: ok');
