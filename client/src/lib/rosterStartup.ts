import { authFetch, getStoredUser, getToken } from './authClient';
import type { CrewRoster } from './pdfParser';
import { newestImports } from '@shared/rosterStartup.mjs';

export function startupOwner(): string {
  const user = getStoredUser();
  return getToken() ? String(user?.id || user?.email || '').trim().toLowerCase() : '';
}
export function startupKey(): string { return `crewcheck_roster_choice_v1_${encodeURIComponent(startupOwner())}`; }
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
export function beginRosterChoice(): () => boolean {
  const epoch = ++choiceEpoch, owner = startupOwner(), token = getToken();
  window.dispatchEvent(new CustomEvent('crewcheck:roster-choice-start'));
  return () => epoch === choiceEpoch && owner === startupOwner() && token === getToken();
}
