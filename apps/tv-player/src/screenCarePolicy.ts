/** Display hygiene only: never claims to repair/prevent all panel damage. */
export type CareProfile = 'oled' | 'balanced' | 'reading';
export type CarePhase = 'active' | 'saver' | 'black';
const MINUTE = 60000;
export const CARE_PROFILES = {
  oled: { saverAt: 2 * MINUTE, blackAt: 5 * MINUTE },
  balanced: { saverAt: 5 * MINUTE, blackAt: 15 * MINUTE },
  reading: { saverAt: 15 * MINUTE, blackAt: 30 * MINUTE },
} as const;
export function careProfile(value: string): CareProfile {
  return value === 'oled' || value === 'reading' ? value : 'balanced';
}
export function carePhase(idleMs: number, profile: CareProfile, motionAllowed = true): CarePhase {
  if (!Number.isFinite(idleMs)) return 'black';
  const policy = CARE_PROFILES[careProfile(profile)];
  if (idleMs >= policy.blackAt) return 'black';
  if (idleMs >= policy.saverAt) return motionAllowed ? 'saver' : 'black';
  return 'active';
}
const ORBIT = [[0,0],[2,0],[4,2],[2,4],[0,4],[-2,2],[-4,0],[-2,-2],[0,-4],[2,-2]];
export function careShift(elapsedMs: number, idleMs: number, motionAllowed: boolean): {x: number;y: number} {
  if (!motionAllowed || idleMs < 10000 || !Number.isFinite(elapsedMs)) return {x:0,y:0};
  const point = ORBIT[Math.floor(Math.max(0,elapsedMs) / 120000) % ORBIT.length];
  return {x:point[0], y:point[1]};
}
// The moving block occupies 32vw x 20vh; positions stay inside the safe area.
const SPOTS = [[7,10],[57,65],[32,35],[7,65],[57,10],[32,65],[7,35],[57,35],[32,10]];
export function careSpot(saverMs: number): {left:string;top:string} {
  const index = Number.isFinite(saverMs) ? Math.floor(Math.max(0,saverMs) / 30000) % SPOTS.length : 0;
  return {left:SPOTS[index][0]+'vw', top:SPOTS[index][1]+'vh'};
}
// Wall time accounts for suspend; monotonic time avoids extending exposure when
// the wall clock moves backwards. A forward jump conservatively protects early.
export function nextCareElapsed(previous: number, wallDelta: number, monotonicDelta: number): number {
  const safe = (value:number) => Number.isFinite(value) ? Math.max(0,value) : 0;
  return safe(previous) + Math.max(safe(wallDelta), safe(monotonicDelta));
}
