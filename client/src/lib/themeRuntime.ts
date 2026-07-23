export type CrewCheckThemePreference = 'system' | 'light' | 'dark';

const KEY = 'crewcheck:appearance:v1';

function normalize(value: unknown): CrewCheckThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function getCrewCheckThemePreference(): CrewCheckThemePreference {
  try { return normalize(window.localStorage.getItem(KEY)); } catch { return 'system'; }
}

export function applyCrewCheckTheme(preference: CrewCheckThemePreference = getCrewCheckThemePreference()): CrewCheckThemePreference {
  const html = document.documentElement;
  const normalized = normalize(preference);
  if (normalized === 'system') html.removeAttribute('data-crewcheck-theme');
  else html.setAttribute('data-crewcheck-theme', normalized);
  html.dataset.crewcheckThemePreference = normalized;
  return normalized;
}

export function setCrewCheckThemePreference(preference: CrewCheckThemePreference): CrewCheckThemePreference {
  const normalized = normalize(preference);
  try { window.localStorage.setItem(KEY, normalized); } catch {}
  const applied = applyCrewCheckTheme(normalized);
  window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { preference: applied } }));
  return applied;
}

applyCrewCheckTheme();

try {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => { if (getCrewCheckThemePreference() === 'system') applyCrewCheckTheme('system'); };
  media.addEventListener?.('change', refresh);
} catch {}
