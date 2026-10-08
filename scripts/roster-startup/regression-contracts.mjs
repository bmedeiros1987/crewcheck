import fs from 'node:fs';

// These assertions still test the same operational/visual separation. The
// selection guard now prevents a previous roster window from feeding a new one.
function update(path, transform) {
  const source = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, transform(source));
}
for (const path of ['scripts/regression-p0-530-adjacent-month-retention.mjs', 'scripts/regression-p2-530-adjacent-fallback-finance.mjs', 'scripts/regression-p0-multichannel-roster-gate.mjs']) {
  update(path, source => source.replaceAll('buildLegs\\(rosterWindow\\)', 'buildLegs\\(rosterWindowPrimaryRef\\.current === bundle\\.roster \\? rosterWindow : bundle\\.roster\\)'));
}
update('scripts/regression-p0-multichannel-roster-gate.mjs', source => source
  .replace('const \\[bundle, setBundle\\] = useState<BundleState>\\(loadRoster\\(\\)\\);', 'const \\[bundle, setBundleState\\] = useState<BundleState>\\(loadRoster\\);')
  .replaceAll("{view === 'roster' && <RosterLaunchView", "{view === 'roster' && Boolean(bundle.roster.days?.length) && <RosterLaunchView")
  .replace("'openActive: () => { openActiveRoster()'", "'openActive: () => { const canCommit = beginRosterChoice(); openActiveRoster()'"));
update('scripts/regression-p0-roster-date-integrity.mjs', source => {
  const lines = source.split('\n');
  return lines.map(line => {
    if (line.includes('Home deve ter cache de roster em sessão')) return '  assert.ok(homeSource.includes("startupOwner() ? localStorage.getItem(startupKey()) : null"), "Home restaura apenas cache associado à conta autenticada");';
    if (line.includes('Home deve ter cache persistente de roster')) return '  assert.ok(!homeSource.includes("() => localStorage.getItem(\'crewcheck_latest_roster_bundle\')"), "cache legado sem owner não pode ser fonte de restauração");';
    if (line.includes('cache legado sem schema deve ser rejeitado')) {
      const guard = "if (payload?.cacheSchema !== ROSTER_CACHE_SCHEMA || payload.owner !== startupOwner() || payload.cleared || payload.selection === 'automatic') continue;";
      return `  assert.ok(homeSource.includes(${JSON.stringify(guard)}), 'schema, owner e intenção devem ser verificados antes da leitura do roster');`;
    }
    return line;
  }).join('\n');
});
update('scripts/regression-p0-623-regulatory-history-carry-in.mjs', source => source.replace('const compliance = \\(await recomputeComplianceWithRegulatoryHistory\\(active\\.roster\\)\\)\\.compliance;', 'const c = \\(await recomputeComplianceWithRegulatoryHistory\\(active\\.roster\\)\\)\\.compliance;'));
// AirportDeparture owns the existing route and vacation decisions; Departure
// stops ineligible home standby before mounting those hooks.
update('scripts/regression-p2-738-vacation-work-first.mjs', source => source.replace('function Departure\\(\\{ event, events, setView \\}', 'function AirportDeparture\\(\\{ event, events, setView \\}'));
update('scripts/regression-departure-positioning-terminal.mjs', source => source.replaceAll("expression('Departure',", "expression('AirportDeparture',"));
update('scripts/regression-v14-3-39-history-chronological-ui.mjs', source => source.replace("'listSavedRosters(72)'", "'listSavedRosters(72, true)'"));
