/** Repair the real list function after historical materializers; no auth authority is minted. */
export function repairRosterListSession(source) {
  const start = source.indexOf('export async function listSavedRosters(');
  const end = source.indexOf('\nconst MAX_INLINE_ROSTER_BACKUP_BYTES', start);
  if (start < 0 || end < start) throw new Error('Roster list function anchors missing');
  let body = source.slice(start, end);
  const replace = (before, after) => {
    if (body.includes(after)) return;
    if (body.split(before).length !== 2) throw new Error('Roster list session anchor missing or duplicated');
    body = body.replace(before, after);
  };
  replace('  const local = getLocalRosterSummaries', "  const session = captureRosterReadSession();\n  const assertListSession = () => {\n    if (!session.isCurrent()) throw Object.assign(new Error('A sessão mudou durante a leitura do histórico.'), { code: 'STALE_SESSION' });\n  };\n  const local = getLocalRosterSummaries");
  replace('  if (!hasCrewCheckAuthToken())', '  assertListSession();\n  if (!hasCrewCheckAuthToken())');
  replace('  try {\n    const payload', '  try {\n    assertListSession();\n    const payload');
  replace('    if (strictHistory &&', '    assertListSession();\n    if (strictHistory &&');
  replace('      try {\n        const active', '      try {\n        assertListSession();\n        const active');
  replace('        if (active?.roster?.id)', '        assertListSession();\n        if (active?.roster?.id)');
  replace('      } catch {\n        //', '      } catch {\n        assertListSession();\n        //');
  replace('    const seen =', '    assertListSession();\n    const seen =');
  replace('  } catch (error) {\n    if (strictHistory)', '  } catch (error) {\n    assertListSession();\n    if (strictHistory)');
  return source.slice(0, start) + body + source.slice(end);
}
