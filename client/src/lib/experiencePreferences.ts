export type CrewExperienceLevel = 'essential' | 'complete' | 'advanced' | 'custom';

export type CrewExperienceGroup =
  | 'operations'
  | 'finance'
  | 'regulation'
  | 'lifestyle'
  | 'sharing'
  | 'advancedTools';

export type CrewExperiencePreferences = {
  level: CrewExperienceLevel;
  groups: Record<CrewExperienceGroup, boolean>;
};

export const CREW_EXPERIENCE_STORAGE_KEY = 'crewcheck_experience_preferences_v1';
export const CREW_EXPERIENCE_CHANGE_EVENT = 'crewcheck:experience-change';

const DEFAULT_GROUPS: Record<CrewExperienceGroup, boolean> = {
  operations: true,
  finance: true,
  regulation: true,
  lifestyle: true,
  sharing: false,
  advancedTools: false,
};

const PRESETS: Record<Exclude<CrewExperienceLevel, 'custom'>, Record<CrewExperienceGroup, boolean>> = {
  essential: {
    operations: true,
    finance: false,
    regulation: false,
    lifestyle: false,
    sharing: false,
    advancedTools: false,
  },
  complete: DEFAULT_GROUPS,
  advanced: {
    operations: true,
    finance: true,
    regulation: true,
    lifestyle: true,
    sharing: true,
    advancedTools: true,
  },
};

const CORE_VIEWS = new Set(['cockpit', 'roster', 'alerts', 'settings', 'import', 'compare']);
const OPERATION_VIEWS = new Set(['departure', 'radar', 'weather', 'wakeup', 'presentation', 'map', 'mycar']);
const FINANCE_VIEWS = new Set(['perdiem', 'salary', 'reports']);
const REGULATION_VIEWS = new Set(['regulation', 'load']);
const LIFESTYLE_VIEWS = new Set(['hotels', 'gyms', 'routine', 'crew']);
const SHARING_VIEWS = new Set(['community', 'exports', 'calendar', 'database', 'concierge', 'plans']);
const ADVANCED_VIEWS = new Set(['bids', 'iflight', 'features', 'updates', 'maintenance']);

function copyGroups(groups: Record<CrewExperienceGroup, boolean>): Record<CrewExperienceGroup, boolean> {
  return { ...groups };
}

export function experiencePreset(level: Exclude<CrewExperienceLevel, 'custom'>): CrewExperiencePreferences {
  return { level, groups: copyGroups(PRESETS[level]) };
}

export function defaultExperiencePreferences(): CrewExperiencePreferences {
  return experiencePreset('complete');
}

export function loadExperiencePreferences(): CrewExperiencePreferences {
  if (typeof window === 'undefined') return defaultExperiencePreferences();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CREW_EXPERIENCE_STORAGE_KEY) || 'null') as Partial<CrewExperiencePreferences> | null;
    if (!parsed || !['essential', 'complete', 'advanced', 'custom'].includes(String(parsed.level))) return defaultExperiencePreferences();
    const level = parsed.level as CrewExperienceLevel;
    if (level !== 'custom') return experiencePreset(level);
    const incoming = parsed.groups || {} as Partial<Record<CrewExperienceGroup, boolean>>;
    return {
      level,
      groups: {
        operations: incoming.operations !== false,
        finance: incoming.finance !== false,
        regulation: incoming.regulation !== false,
        lifestyle: incoming.lifestyle !== false,
        sharing: Boolean(incoming.sharing),
        advancedTools: Boolean(incoming.advancedTools),
      },
    };
  } catch {
    return defaultExperiencePreferences();
  }
}

export function saveExperiencePreferences(preferences: CrewExperiencePreferences): CrewExperiencePreferences {
  const normalized = preferences.level === 'custom'
    ? { level: 'custom' as const, groups: copyGroups(preferences.groups) }
    : experiencePreset(preferences.level);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(CREW_EXPERIENCE_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    try { window.dispatchEvent(new CustomEvent(CREW_EXPERIENCE_CHANGE_EVENT, { detail: normalized })); } catch {}
  }
  return normalized;
}

export function setExperienceLevel(level: CrewExperienceLevel): CrewExperiencePreferences {
  if (level === 'custom') {
    const current = loadExperiencePreferences();
    return saveExperiencePreferences({ level: 'custom', groups: copyGroups(current.groups) });
  }
  return saveExperiencePreferences(experiencePreset(level));
}

export function isCrewViewVisible(view: string, preferences = loadExperiencePreferences(), admin = false): boolean {
  if (view === 'admin') return admin;
  if (CORE_VIEWS.has(view)) return true;
  if (OPERATION_VIEWS.has(view)) return preferences.groups.operations;
  if (FINANCE_VIEWS.has(view)) return preferences.groups.finance;
  if (REGULATION_VIEWS.has(view)) return preferences.groups.regulation;
  if (LIFESTYLE_VIEWS.has(view)) return preferences.groups.lifestyle;
  if (SHARING_VIEWS.has(view)) return preferences.groups.sharing;
  if (ADVANCED_VIEWS.has(view)) return preferences.groups.advancedTools && (view !== 'updates' && view !== 'maintenance' ? true : admin);
  return preferences.level === 'advanced' || preferences.level === 'custom';
}

export function experienceVisibleActionLimit(preferences = loadExperiencePreferences()): number {
  if (preferences.level === 'essential') return 2;
  if (preferences.level === 'complete') return 3;
  return 4;
}
