import { authFetch, getStoredUser, getToken } from './authClient';
import type { CrewRoster } from './pdfParser';
import { newestImports } from '@shared/rosterStartup.mjs';

export function startupOwner(): string {
  const user = getStoredUser();
  return getToken() ? String(user?.id || user?.email || '').trim().toLowerCase() : '';
}
export function startupKey(): string { return `crewcheck_roster_choice_v1_${encodeURIComponent(startupOwner())}`; }
function clearEpochKey(): string { return startupKey() + '_clear_epoch'; }
function readChoiceRevision(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function clearEpoch(): string { return readChoiceRevision(clearEpochKey()) || ''; }
export function markStartupCleared(): void {
  if (!startupOwner()) return;
  choiceEpoch += 1;
  localStorage.setItem(clearEpochKey(), crypto.randomUUID());
  localStorage.setItem(startupKey(), JSON.stringify({ owner: startupOwner(), cleared: true }));
  window.dispatchEvent(new CustomEvent('crewcheck:roster-cleared'));
}
export function startupIntentRevision(): string { return readChoiceRevision(startupKey() + '_intent_epoch') || ''; }
export function isAutomaticRosterNotification(event: Pick<StorageEvent, 'key' | 'newValue'>): boolean {
  const owner = startupOwner();
  if (!owner || event.key !== startupKey()) return false;
  try {
    const payload = JSON.parse(event.newValue || 'null');
    return payload?.owner === owner && payload?.selection === 'automatic' && !payload?.cleared;
  } catch { return false; }
}
export function startupCleared(): boolean {
  try { return JSON.parse(localStorage.getItem(startupKey()) || 'null')?.cleared === true; } catch { return false; }
}
export async function restoreLatestImport(): Promise<{ roster: CrewRoster; source: string } | null> {
  const owner = startupOwner(), token = getToken();
  if (!owner || !token) return null;
  const assertSession = () => {
    if (owner !== startupOwner() || token !== getToken()) throw new Error('Sessão alterada durante a restauração.');
  };
  const history = await authFetch<{ ok: boolean; rosters: any[] }>('/api/rosters?limit=72&manager=1', { cache: 'no-store' });
  assertSession();
  if (!history.ok || !Array.isArray(history.rosters)) throw new Error('Resposta de histórico inválida.');
  const candidates = newestImports(history.rosters);
  for (const item of candidates) {
    const opened = await authFetch<{ ok: boolean; data?: { roster?: CrewRoster } }>(`/api/rosters/${encodeURIComponent(item.id)}`, { cache: 'no-store' });
    assertSession();
    if (!opened.ok) throw new Error('Não foi possível abrir o histórico.');
    if (Array.isArray(opened.data?.roster?.days) && opened.data.roster.days.length) {
      return { roster: opened.data.roster, source: item.sourceFileName || 'Última escala enviada' };
    }
  }
  if (candidates.length) throw new Error('O histórico não contém uma escala válida.');
  return null;
}

let choiceEpoch = 0;
let pendingChoiceEpoch: number | null = null;
export function invalidateRosterChoices(): void { choiceEpoch += 1; pendingChoiceEpoch = null; }
export type RosterChoiceGuard = (() => boolean) & { finish(): void };
export function beginRosterChoice(): RosterChoiceGuard {
  const epoch = ++choiceEpoch;
  pendingChoiceEpoch = null;
  const denied = () => Object.assign(() => false, { finish() {} });
  let owner: string, token: string | null, clearRevision: string, intentKey: string;
  try {
    owner = startupOwner(); token = getToken(); clearRevision = clearEpoch();
    intentKey = startupKey() + '_intent_epoch';
  } catch { return denied(); }
  if (!owner || !token) return denied();
  pendingChoiceEpoch = epoch;
  const intentRevision = crypto.randomUUID();
  // The in-memory epoch still orders choices when storage is full/restricted.
  // Retain the prior shared revision so a later foreign-tab write invalidates us.
  let expectedSharedIntent = readChoiceRevision(intentKey);
  try { localStorage.setItem(intentKey, intentRevision); expectedSharedIntent = intentRevision; } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent('crewcheck:roster-choice-start'));
  const canCommit = () => {
    try {
      return epoch === choiceEpoch && owner === startupOwner() && token === getToken()
        && clearRevision === clearEpoch() && readChoiceRevision(intentKey) === expectedSharedIntent;
    } catch { return false; }
  };
  return Object.assign(canCommit, { finish() {
    if (pendingChoiceEpoch === epoch) pendingChoiceEpoch = null;
    if (canCommit()) window.dispatchEvent(new CustomEvent('crewcheck:roster-choice-finished'));
  } });
}

// Capture a read fence without publishing a new explicit intent. Every await and
// lock/cache commit must recheck it; a pending manual selection has priority.
export function captureAutomaticRosterGuard(): () => boolean {
  try {
    const epoch = choiceEpoch, owner = startupOwner(), token = getToken();
    const key = startupKey(), clearKey = clearEpochKey(), intentKey = key + '_intent_epoch';
    // Strict reads here: blocked storage is not an absent shared intent.
    const clearRevision = localStorage.getItem(clearKey), intentRevision = localStorage.getItem(intentKey);
    const explicitChoice = () => {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : null;
      return value?.owner === owner && value?.roster && value.selection !== 'automatic' && !value.cleared ? raw : null;
    };
    const choiceSnapshot = explicitChoice();
    if (!owner || !token || startupCleared() || pendingChoiceEpoch !== null) return () => false;
    return () => {
      try {
        return epoch === choiceEpoch && pendingChoiceEpoch === null
          && owner === startupOwner() && token === getToken() && !startupCleared()
          && clearRevision === localStorage.getItem(clearKey) && intentRevision === localStorage.getItem(intentKey)
          && (explicitChoice() === null || explicitChoice() === choiceSnapshot);
      } catch { return false; }
    };
  } catch { return () => false; }
}
