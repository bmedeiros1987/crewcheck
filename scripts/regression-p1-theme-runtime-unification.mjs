import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('client/src/lib/themeRuntime.ts', 'utf8');

for (const required of [
  "const LEGACY_KEY = 'crewcheck_theme_mode'",
  'html.dataset.crewThemeMode = normalized',
  'html.dataset.crewTheme = effective',
  'html.dataset.theme = effective',
  'html.dataset.crewcheckTheme = effective',
  "html.classList.toggle('dark', effective === 'dark')",
  'html.style.colorScheme = effective',
  "window.matchMedia('(prefers-color-scheme: dark)')",
  "window.localStorage.setItem(LEGACY_KEY, normalized)",
]) {
  assert.ok(source.includes(required), `contrato de tema ausente: ${required}`);
}

assert.ok(source.includes("if (getCrewCheckThemePreference() === 'system') applyCrewCheckTheme('system')"), 'modo automático deve reagir ao tema do sistema');
console.log('theme runtime unified light/dark automation: OK');
