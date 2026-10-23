import { captureAuthSession } from './authClient';
import { startupOwner, startupKey, startupIntentRevision } from './rosterStartup';
import type { CrewRoster } from './pdfParser';

export const CREWCIERGE_CACHE_SCHEMA = 'p0-operational-date-anchor-v2';
let captureSequence = 0;
export async function recordCrewciergeCapture(roster: CrewRoster): Promise<boolean> {
  // Called only by a successful saveRoster, never by a reader or on mount.
  try {
    const sequence = ++captureSequence;
    const session = captureAuthSession(), owner = startupOwner(), key = startupKey();
    if (!session.token || !owner || owner !== session.owner || !session.isCurrent()) return false;
    const raw = localStorage.getItem(key), saved = JSON.parse(raw || 'null');
    const content = JSON.stringify(roster), intentRevision = startupIntentRevision();
    if (!saved || saved.owner !== owner || saved.cacheSchema !== CREWCIERGE_CACHE_SCHEMA || saved.selection !== 'explicit'
      || saved.cleared || String(saved.choiceIntent || '') !== intentRevision || JSON.stringify(saved.roster) !== content) return false;
    const capturedAt = new Date().toISOString();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)))).map(v => v.toString(16).padStart(2, '0')).join('');
    if (sequence !== captureSequence || !session.isCurrent() || startupOwner() !== owner || startupKey() !== key || startupIntentRevision() !== intentRevision || localStorage.getItem(key) !== raw) return false;
    localStorage.setItem(key, JSON.stringify({ ...saved, crewCiergeCapture: { capturedAt, contentHash: hash, revision: crypto.randomUUID() } }));
    window.dispatchEvent(new Event('crewcheck:local-roster-captured'));
    return true;
  } catch { return false; }
}
