export type CrewCheckThemePreference = 'system' | 'light' | 'dark';

const KEY = 'crewcheck:appearance:v1';
const LEGACY_KEY = 'crewcheck_theme_mode';
const ORDER: CrewCheckThemePreference[] = ['system', 'light', 'dark'];

function normalize(value: unknown): CrewCheckThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function getCrewCheckThemePreference(): CrewCheckThemePreference {
  try {
    // The active Home/App setting takes precedence; initialization never writes preferences.
    const active = window.localStorage.getItem(LEGACY_KEY);
    if (['light', 'dark', 'system', 'auto'].includes(active || '')) return normalize(active);
    return normalize(window.localStorage.getItem(KEY));
  } catch { return 'system'; }
}

export function getEffectiveCrewCheckTheme(preference: CrewCheckThemePreference = getCrewCheckThemePreference()): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function applyCrewCheckTheme(preference: CrewCheckThemePreference = getCrewCheckThemePreference()): CrewCheckThemePreference {
  const html = document.documentElement;
  const normalized = normalize(preference);
  const effective = getEffectiveCrewCheckTheme(normalized);
  html.dataset.crewcheckThemePreference = normalized;
  html.dataset.crewThemeMode = normalized;
  html.dataset.crewTheme = effective;
  html.dataset.theme = effective;
  html.dataset.crewcheckTheme = effective;
  html.classList.toggle('dark', effective === 'dark');
  html.style.colorScheme = effective;
  return normalized;
}

export function setCrewCheckThemePreference(preference: CrewCheckThemePreference): CrewCheckThemePreference {
  const normalized = normalize(preference);
  try { window.localStorage.setItem(KEY, normalized); window.localStorage.setItem(LEGACY_KEY, normalized); } catch {}
  const applied = applyCrewCheckTheme(normalized);
  window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { preference: applied } }));
  return applied;
}

export function cycleCrewCheckTheme(): CrewCheckThemePreference {
  const current = getCrewCheckThemePreference();
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  return setCrewCheckThemePreference(next);
}

function label(preference: CrewCheckThemePreference): string {
  if (preference === 'light') return 'Aparência: Claro';
  if (preference === 'dark') return 'Aparência: Escuro';
  return 'Aparência: Automático';
}

function refreshControls() {
  const preference = getCrewCheckThemePreference();
  document.querySelectorAll<HTMLElement>('.cc-theme-row').forEach((control) => {
    control.dataset.themePreference = preference;
    control.setAttribute('aria-label', label(preference));
    control.setAttribute('title', label(preference) + '. Toque para alterar.');
  });
}

applyCrewCheckTheme();

try {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => {
    if (getCrewCheckThemePreference() === 'system') applyCrewCheckTheme('system');
    if (getCrewCheckThemePreference() === 'system') {
      window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { preference: 'system' } }));
    }
    refreshControls();
  };
  media.addEventListener?.('change', refresh);
} catch {}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const control = target?.closest?.('.cc-theme-row');
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cycleCrewCheckTheme();
    refreshControls();
  }, true);
  const observer = new MutationObserver(refreshControls);
  const start = () => {
    refreshControls();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('crewcheck:theme-change', refreshControls as EventListener);
}

window.addEventListener('crewcheck:theme-change', () => applyCrewCheckTheme());
window.addEventListener('storage', (event) => {
  if (event.key === KEY || event.key === LEGACY_KEY || event.key === null) { applyCrewCheckTheme(); refreshControls(); }
});
