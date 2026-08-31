import { useEffect } from 'react';
import { CREW_EXPERIENCE_CHANGE_EVENT, loadExperiencePreferences } from '@/lib/experiencePreferences';
import './contextual-ux.css';

function applyExperience() {
  try {
    const preferences = loadExperiencePreferences();
    document.documentElement.dataset.crewExperience = preferences.level;
  } catch {}
}

export default function ExperienceRuntimeBridge() {
  useEffect(() => {
    applyExperience();
    window.addEventListener(CREW_EXPERIENCE_CHANGE_EVENT, applyExperience as EventListener);
    window.addEventListener('storage', applyExperience);
    return () => {
      window.removeEventListener(CREW_EXPERIENCE_CHANGE_EVENT, applyExperience as EventListener);
      window.removeEventListener('storage', applyExperience);
    };
  }, []);
  return null;
}
