export interface CrewCheckBuildIdentity {
  version: string;
  commit: string;
  buildTime: string;
}

export function getCrewCheckBuildIdentity(): CrewCheckBuildIdentity {
  return {
    version: String(import.meta.env.VITE_CREWCHECK_BUILD_VERSION || 'unknown'),
    commit: String(import.meta.env.VITE_CREWCHECK_BUILD_COMMIT || 'unknown'),
    buildTime: String(import.meta.env.VITE_CREWCHECK_BUILD_TIME || 'unknown'),
  };
}

export function shortCrewCheckCommit(commit: string = getCrewCheckBuildIdentity().commit): string {
  return commit === 'unknown' || commit === 'local' ? commit : commit.slice(0, 7);
}

declare global {
  interface Window {
    __CREWCHECK_BUILD__?: CrewCheckBuildIdentity;
  }
}

if (typeof window !== 'undefined') {
  window.__CREWCHECK_BUILD__ = getCrewCheckBuildIdentity();
}
