import fs from 'node:fs';

const compliancePath = 'client/src/lib/complianceEngine.ts';
const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_623_REVIEW_HARDENING';

for (const file of [compliancePath, databasePath]) {
  if (!fs.existsSync(file)) throw new Error(`[${marker}] arquivo ausente: ${file}`);
}

let compliance = fs.readFileSync(compliancePath, 'utf8');
if (!compliance.includes(marker)) {
  if (!compliance.includes('crewDateUtcEpoch,')) {
    const importAnchor = '  sumFlightHoursForCompetence,\n  type FlightHoursObservation,';
    if (!compliance.includes(importAnchor)) throw new Error(`[${marker}] import rollingFlightHours não localizado`);
    compliance = compliance.replace(
      importAnchor,
      '  sumFlightHoursForCompetence,\n  crewDateUtcEpoch,\n  type FlightHoursObservation,',
    );
  }

  const oldHistoryBlock = `  const flightHoursObservations: FlightHoursObservation[] = [];
  for (const historicalRoster of regulatoryHistory || []) {
    for (const historicalDay of sortDays(historicalRoster?.days || [])) {
      flightHoursObservations.push({
        date: String(historicalDay.date || ''),
        hours: getFlightHours(historicalDay),
      });
    }
  }`;

  const newHistoryBlock = `  const flightHoursObservations: FlightHoursObservation[] = [];
  // ${marker}: a publicação nominal ativa é soberana em qualquer data sobreposta.
  // Histórico regulatório só contribui dias civis anteriores ao início da competência
  // ativa e nunca duplica datas já publicadas pelo roster ativo (inclusive carry-in).
  const regulatoryDayEpoch = (value: unknown): number | null => {
    const raw = String(value || '').trim();
    const iso = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})$/);
    const normalized = iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : raw;
    return crewDateUtcEpoch(normalized);
  };
  const activeYear = Number(roster.year);
  const activeMonth = Number(roster.month);
  const activeCompetenceStartUtc = Number.isInteger(activeYear) && Number.isInteger(activeMonth)
    ? crewDateUtcEpoch('01/' + String(activeMonth) + '/' + String(activeYear))
    : null;
  const activeRosterDateEpochs = new Set<number>();
  for (const activeDay of roster.days || []) {
    const activeEpoch = regulatoryDayEpoch(activeDay.date);
    if (activeEpoch !== null) activeRosterDateEpochs.add(activeEpoch);
  }
  for (const historicalRoster of regulatoryHistory || []) {
    for (const historicalDay of sortDays(historicalRoster?.days || [])) {
      const historicalDate = String(historicalDay.date || '');
      const historicalEpoch = regulatoryDayEpoch(historicalDate);
      if (activeCompetenceStartUtc === null || historicalEpoch === null) continue;
      if (historicalEpoch >= activeCompetenceStartUtc) continue;
      if (activeRosterDateEpochs.has(historicalEpoch)) continue;
      flightHoursObservations.push({
        date: historicalDate,
        hours: getFlightHours(historicalDay),
      });
    }
  }`;

  if (!compliance.includes(oldHistoryBlock)) throw new Error(`[${marker}] bloco histórico #623 não localizado`);
  compliance = compliance.replace(oldHistoryBlock, newHistoryBlock);
}

for (const fragment of [
  marker,
  'crewDateUtcEpoch,',
  'activeRosterDateEpochs',
  'historicalEpoch >= activeCompetenceStartUtc',
  'activeRosterDateEpochs.has(historicalEpoch)',
]) {
  if (!compliance.includes(fragment)) throw new Error(`[${marker}] contrato compliance ausente: ${fragment}`);
}
fs.writeFileSync(compliancePath, compliance, 'utf8');

let database = fs.readFileSync(databasePath, 'utf8');
const unsafeCandidates = 'const candidates = [...accountSummaries, ...getLocalRosterSummaries(72)]';
if (database.includes(unsafeCandidates)) throw new Error(`[${marker}] fallback local ainda participa da prova de existência`);
if (!database.includes('selectRegulatoryCarryIn({')) throw new Error(`[${marker}] selector regulatório canônico não está no runtime`);
if (!database.includes("authority: 'account_verified'")) throw new Error(`[${marker}] autoridade account_verified ausente`);
if (!database.includes('regulatoryCrewIdentity(activeSummary)')) throw new Error(`[${marker}] identidade estável não governa o runtime`);

const projectedRosterSignature = `function regulatoryRosterSignature(roster: CrewRoster): unknown {
  return {
    crew: crewIdentityToken(roster),
    year: Number(roster.year || 0),
    month: Number(roster.month || 0),
    base: String(roster.base || ''),
    rank: String(roster.rank || ''),
    airline: String(roster.airline || ''),
    rawText: String(roster.rawText || ''),
    days: (roster.days || []).map((day) => ({
      date: String(day.date || ''),
      type: String(day.type || ''),
      pairingCode: String(day.pairingCode || ''),
      dutyReport: String(day.dutyReport || ''),
      dutyDebrief: String(day.dutyDebrief || ''),
      legs: (day.legs || []).map((leg: any) => ({
        flightNumber: String(leg.flightNumber || ''),
        origin: String(leg.origin || ''),
        destination: String(leg.destination || ''),
        departureTime: String(leg.departureTime || ''),
        arrivalTime: String(leg.arrivalTime || ''),
        duration: Number(leg.duration || 0),
        isNextDay: Boolean(leg.isNextDay),
        aircraftType: String(leg.aircraftType || ''),
      })),
    })),
  };
}`;
const completeRosterSignature = `function regulatoryRosterSignature(roster: CrewRoster): unknown {
  // Snapshot reuse is a safety optimization: fingerprint the complete published
  // roster so no field consumed by analyzeCompliance can be omitted accidentally.
  return roster;
}`;
if (database.includes(projectedRosterSignature)) {
  database = database.replace(projectedRosterSignature, completeRosterSignature);
}
if (!database.includes(completeRosterSignature)) throw new Error(`[${marker}] fingerprint integral do roster não aplicado`);

const oldFingerprint = `function regulatoryHistoryFingerprint(primary: CrewRoster, previous: CrewRoster): string {
  return 'fnv1a:' + stableRegulatoryHash({
    kernelVersion: ROLLING_FLIGHT_HOURS_KERNEL_VERSION,
    primary: regulatoryRosterSignature(primary),
    previous: regulatoryRosterSignature(previous),
  });
}`;
const completeFingerprint = `function regulatoryHistoryFingerprint(primary: CrewRoster, previous: CrewRoster, roleSelection: CrewRoleSelection): string {
  return 'fnv1a:' + stableRegulatoryHash({
    kernelVersion: ROLLING_FLIGHT_HOURS_KERNEL_VERSION,
    roleSelection,
    primary: regulatoryRosterSignature(primary),
    previous: regulatoryRosterSignature(previous),
  });
}`;
if (database.includes(oldFingerprint)) database = database.replace(oldFingerprint, completeFingerprint);
if (!database.includes(completeFingerprint)) throw new Error(`[${marker}] roleSelection ausente do fingerprint regulatório`);

database = database.replace(
  'const fingerprint = regulatoryHistoryFingerprint(roster, previousRoster);',
  'const fingerprint = regulatoryHistoryFingerprint(roster, previousRoster, roleSelection);',
);
if (!database.includes('regulatoryHistoryFingerprint(roster, previousRoster, roleSelection)')) {
  throw new Error(`[${marker}] chamada do fingerprint não inclui roleSelection`);
}
fs.writeFileSync(databasePath, database, 'utf8');

console.log(`[${marker}] proveniência account-only, identidade estável, precedência nominal e fingerprint integral verificados.`);
