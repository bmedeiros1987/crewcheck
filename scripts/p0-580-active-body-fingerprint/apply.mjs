import fs from 'node:fs';

const databasePath = 'client/src/lib/databaseClient.ts';
const marker = 'P0_580_ACTIVE_BODY_FINGERPRINT_GUARD';

if (!fs.existsSync(databasePath)) throw new Error(`[${marker}] ${databasePath} not found`);
let source = fs.readFileSync(databasePath, 'utf8');

if (!source.includes(marker)) {
  const helperAnchor = `export async function openActiveRoster(): Promise<{ roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[]; summary?: SavedRosterSummary | null }> {`;
  const helperCount = source.split(helperAnchor).length - 1;
  if (helperCount !== 1) throw new Error(`[${marker}] openActiveRoster anchor count ${helperCount}, expected 1`);

  const helper = `function activeRosterFingerprintPayload(roster: CrewRoster): string {\n  return JSON.stringify({ year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: roster?.days });\n}\n\nasync function sha256RosterFingerprint(text: string): Promise<string | null> {\n  try {\n    if (!globalThis.crypto?.subtle) return null;\n    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));\n    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');\n  } catch {\n    return null;\n  }\n}\n\nasync function assertActiveRosterBodyIdentity(summary: SavedRosterSummary | null | undefined, roster: CrewRoster, localSummary: SavedRosterSummary | null | undefined): Promise<void> {\n  // ${marker}: an announced checksum authorizes one concrete roster body, not merely\n  // a nominal month. Compare a canonical SHA-256 when the summary exposes one, and\n  // also compare against the already-trusted local snapshot when the same checksum\n  // is present there (covers legacy/non-hex checksum records). Any mismatch fails closed.\n  const announced = String(summary?.checksum || '').trim().toLowerCase();\n  if (!announced) return;\n  const bodyIdentity = activeRosterFingerprintPayload(roster);\n  if (/^[a-f0-9]{64}$/.test(announced)) {\n    const bodyFingerprint = await sha256RosterFingerprint(bodyIdentity);\n    if (bodyFingerprint && bodyFingerprint !== announced) {\n      throw Object.assign(new Error('A escala ativa recebida não corresponde ao checksum anunciado.'), { code: 'ACTIVE_ROSTER_BODY_MISMATCH' });\n    }\n  }\n  const matchingLocalSummary = localSummary && String(localSummary.checksum || '').trim().toLowerCase() === announced\n    ? localSummary\n    : getLocalRosterSummaries(12).find((item) => String(item.checksum || '').trim().toLowerCase() === announced);\n  if (!matchingLocalSummary?.id) return;\n  const trustedLocal = findLocalRoster(matchingLocalSummary.id);\n  if (!trustedLocal?.roster) return;\n  if (activeRosterFingerprintPayload(trustedLocal.roster) !== bodyIdentity) {\n    throw Object.assign(new Error('A escala ativa recebida diverge do snapshot autorizado pelo checksum.'), { code: 'ACTIVE_ROSTER_BODY_MISMATCH' });\n  }\n}\n\n${helperAnchor}`;
  source = source.replace(helperAnchor, helper);

  const guardAnchor = `      if (payload.roster) assertExpectedRosterPeriod(payload.data.roster, payload.roster);\n      const reconciliation = reconcileActiveRosterIdentity({ remote: payload.roster || null, local: local || null });`;
  const guardCount = source.split(guardAnchor).length - 1;
  if (guardCount !== 1) throw new Error(`[${marker}] summary/body guard anchor count ${guardCount}, expected 1`);
  source = source.replace(guardAnchor, `      if (payload.roster) assertExpectedRosterPeriod(payload.data.roster, payload.roster);\n      await assertActiveRosterBodyIdentity(payload.roster || null, payload.data.roster, local || null);\n      const reconciliation = reconcileActiveRosterIdentity({ remote: payload.roster || null, local: local || null });`);

  // Keep the historical rethrow expression byte-for-byte so the idempotency oracle
  // remains meaningful; add the new fail-closed code as a separate guard before it.
  const rethrowAnchor = `    if (['ACTIVE_ROSTER_CONFLICT', 'ROSTER_PERIOD_MISMATCH'].includes(String(error?.code || '').toUpperCase())) throw error;`;
  const mismatchGuard = `    if (String(error?.code || '').toUpperCase() === 'ACTIVE_ROSTER_BODY_MISMATCH') throw error;`;
  if (source.includes(rethrowAnchor) && !source.includes(mismatchGuard)) {
    source = source.replace(rethrowAnchor, `${mismatchGuard}\n${rethrowAnchor}`);
  } else if (!source.includes(rethrowAnchor) || !source.includes(mismatchGuard)) {
    throw new Error(`[${marker}] active-roster rethrow anchor not found`);
  }

  fs.writeFileSync(databasePath, source, 'utf8');
  console.log(`[crewcheck:prepare] applied ${marker}`);
} else {
  console.log(`[crewcheck:prepare] ${marker} already applied; validating structure`);
}

const prepared = fs.readFileSync(databasePath, 'utf8');
for (const fragment of [
  marker,
  'function activeRosterFingerprintPayload(roster: CrewRoster): string',
  "globalThis.crypto.subtle.digest('SHA-256'",
  'await assertActiveRosterBodyIdentity(payload.roster || null, payload.data.roster, local || null);',
  "String(error?.code || '').toUpperCase() === 'ACTIVE_ROSTER_BODY_MISMATCH'",
  "['ACTIVE_ROSTER_CONFLICT', 'ROSTER_PERIOD_MISMATCH'].includes(String(error?.code || '').toUpperCase())",
  'activeRosterFingerprintPayload(trustedLocal.roster) !== bodyIdentity',
]) {
  if (!prepared.includes(fragment)) throw new Error(`[${marker}] missing structural guard: ${fragment}`);
}
const bodyGuardIndex = prepared.indexOf('await assertActiveRosterBodyIdentity(payload.roster || null, payload.data.roster, local || null);');
const reconciliationIndex = prepared.indexOf('const reconciliation = reconcileActiveRosterIdentity({ remote: payload.roster || null, local: local || null });');
if (bodyGuardIndex < 0 || reconciliationIndex < 0 || bodyGuardIndex > reconciliationIndex) {
  throw new Error(`[${marker}] body fingerprint guard must precede active identity reconciliation`);
}
