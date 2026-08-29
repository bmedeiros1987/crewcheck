export type CrewCheckThemePreference = 'system' | 'light' | 'dark';

const KEY = 'crewcheck:appearance:v1';
const LEGACY_KEY = 'crewcheck_theme_mode';

function normalize(value: unknown): CrewCheckThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readStoredPreference(): CrewCheckThemePreference {
  try {
    const modern = window.localStorage.getItem(KEY);
    if (modern === 'light' || modern === 'dark' || modern === 'system') return normalize(modern);
    return normalize(window.localStorage.getItem(LEGACY_KEY));
  } catch { return 'system'; }
}

function effectiveTheme(preference: CrewCheckThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function getCrewCheckThemePreference(): CrewCheckThemePreference {
  return readStoredPreference();
}

export function applyCrewCheckTheme(preference: CrewCheckThemePreference = getCrewCheckThemePreference()): CrewCheckThemePreference {
  const html = document.documentElement;
  const normalized = normalize(preference);
  const effective = effectiveTheme(normalized);

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
  try {
    window.localStorage.setItem(KEY, normalized);
    window.localStorage.setItem(LEGACY_KEY, normalized);
  } catch {}
  const applied = applyCrewCheckTheme(normalized);
  window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { preference: applied } }));
  return applied;
}

applyCrewCheckTheme();

try {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => { if (getCrewCheckThemePreference() === 'system') applyCrewCheckTheme('system'); };
  media.addEventListener?.('change', refresh);
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === LEGACY_KEY) applyCrewCheckTheme();
  });
} catch {}
