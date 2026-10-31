/** Reuse the publication/session-fenced display history for HOME's date-scoped consumers. */
export function repairHomeContinuity(source) {
  const before = '<Cockpit events={events}';
  const after = '<Cockpit events={rosterEvents}';
  if (!source.includes('rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster')) {
    throw new Error('HOME continuity requires the session-fenced roster window');
  }
  if (source.split(after).length === 2 && !source.includes(before)) return source;
  if (source.split(before).length !== 2 || source.includes(after)) {
    throw new Error('HOME continuity: unique Cockpit consumer missing');
  }
  return source.replace(before, after);
}
