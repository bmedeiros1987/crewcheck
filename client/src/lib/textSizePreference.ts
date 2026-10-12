import { getStoredUser } from './authClient';

export type CrewTextSize = 100 | 150 | 200;
const EVENT = 'crewcheck:text-size-changed';
const key = () => {
  const id = getStoredUser()?.id;
  return id ? `crewcheck:text-size:v1:${encodeURIComponent(id)}` : null;
};

export function readCrewTextSize(): CrewTextSize {
  try {
    const name = key();
    const value = name ? Number(localStorage.getItem(name)) : 100;
    return value === 150 || value === 200 ? value : 100;
  } catch { return 100; }
}

export function saveCrewTextSize(value: CrewTextSize): boolean {
  if (![100, 150, 200].includes(value)) return false;
  try {
    const name = key();
    if (!name) return false;
    localStorage.setItem(name, String(value));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch { return false; }
}

export function initializeCrewTextSize(): () => void {
  const apply = () => {
    const value = readCrewTextSize();
    document.documentElement.dataset.crewTextSize = String(value);
    document.documentElement.style.setProperty('--cc-text-scale', String(value / 100));
  };
  apply();
  const events = [EVENT, 'storage', 'crewcheck:auth-changed'];
  events.forEach(name => window.addEventListener(name, apply));
  return () => {
    events.forEach(name => window.removeEventListener(name, apply));
    delete document.documentElement.dataset.crewTextSize;
    document.documentElement.style.removeProperty('--cc-text-scale');
  };
}
