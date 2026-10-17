import { startupOwner, startupKey } from './rosterStartup';
import { alertAccount, alertDigest } from './alertReviewStore';
/** Read the existing selection; never restore, replace or clear it here. */
export function alertRosterOwned(roster: any): boolean {
  try {
    if (!alertAccount() || !roster?.days?.length) return false;
    const choice = JSON.parse(localStorage.getItem(startupKey()) || 'null');
    return choice?.owner === startupOwner() && !choice.cleared && choice.roster?.days?.length > 0
      && alertDigest([choice.roster.year, choice.roster.month, choice.roster.days]) === alertDigest([roster.year, roster.month, roster.days]);
  } catch { return false; }
}
