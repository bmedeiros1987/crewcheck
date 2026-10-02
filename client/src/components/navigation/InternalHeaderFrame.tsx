import type { ReactNode } from 'react';
import CrewCheckPulse from '../pulse/CrewCheckPulse';

/** Navigation and important notices stay in normal page flow. */
export function InternalHeaderFrame({ children }: { children: ReactNode }) {
  return <div className="cz-global-header" data-global-internal-header="true">{children}<CrewCheckPulse compact/></div>;
}
