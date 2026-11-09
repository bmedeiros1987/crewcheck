// Shared with the earlier v1432 stage so replay recognizes the repaired block.
export const legacyDemoFallback = `  const demoActive = sessionStorage.getItem('crewcheck_demo_active') === '1';
  if (demoActive) {
    const roster = buildCrewCheckDemoRoster();
    return { roster, compliance: analyzeSafe(roster), source: 'Demonstração fictícia CrewCheck' };
  }`;
export const ownedDemoFallback = `  const demoActive = sessionStorage.getItem('crewcheck_demo_active') === '1';
  // Presence only: never restore/promote an automatic cache; unreadable storage fails closed.
  let ownerChoicePresent = true;
  try { ownerChoicePresent = startupOwner() ? localStorage.getItem(startupKey()) !== null : false; } catch {}
  if (demoActive && !ownerChoicePresent) {
    const roster = buildCrewCheckDemoRoster();
    return { roster, compliance: analyzeSafe(roster), source: 'Demonstração fictícia CrewCheck' };
  }`;
export function repairOwnedDemoFallback(source) {
  if (source.includes(ownedDemoFallback) && source.includes(legacyDemoFallback)) throw new Error('Duplicate demo fallback blocks');
  if (source.includes(ownedDemoFallback)) return source;
  if (!source.includes(legacyDemoFallback)) throw new Error('Owned demo fallback anchor missing');
  return source.replace(legacyDemoFallback, ownedDemoFallback);
}
