import { readFileSync, writeFileSync } from 'node:fs';
export function buildMyCrewCareObservedAsset(source) {
  return `/* Generated from shared/myCrewCareObservedContract.mjs; OFF, provisional observations only. */\n(function extractMyCrewCareV3(contract) {\n'use strict';\n${source.replace(/^export /gm, '')}\n${dispatch}\n})\n`;
}
const dispatch = `
try {
  if (!contract || contract.schemaVersion !== 3 || contract.operationalImportAllowed !== false) fail();
  const scope = contract.scope;
  if (!scope || !scope.accountId || !scope.sessionId || !scope.requestId || !Number.isSafeInteger(scope.generation) || scope.generation < 1) fail();
  let rows;
  if (contract.kind === 'profile-before' || contract.kind === 'profile-after') {
    rows = [observeMyCrewCareProfile(document, location.href)];
  } else if (contract.kind === 'cards') {
    rows = observeMyCrewCareCards(document, location.href);
  } else if (contract.kind === 'detail') {
    // Native acquisition already verified profile-before. This is provisional;
    // the native owner must validate profile-after before exposing any result.
    const identity = { employeeId: scope.employeeId, username: scope.username,
      accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId };
    const value = observeMyCrewCareReservation({ document, pageUrl: location.href, card: contract.card,
      binding: { ...scope, fresh: true }, profileBefore: identity, profileAfter: identity });
    rows = [{ providerReservationId: value.providerReservationId, dutyPeriodNumber: value.dutyPeriodNumber,
      airport: value.airport, pairingId: value.pairingId, hotelName: value.hotelName,
      confirmationRaw: value.status.raw, checkInWallDateTime: value.checkInWallDateTime,
      checkOutWallDateTime: value.checkOutWallDateTime,
      toHotelProvider: value.transportToHotel.providerName, toHotelPickupWallTime: value.transportToHotel.pickupWallTime,
      toHotelTransitMinutes: String(value.transportToHotel.transitMinutes),
      toAirportProvider: value.transportToAirport.providerName, toAirportPickupWallTime: value.transportToAirport.pickupWallTime,
      toAirportTransitMinutes: String(value.transportToAirport.transitMinutes) }];
  } else fail();
  return JSON.stringify({ schemaVersion: 3, operationalImportAllowed: false,
    accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId,
    generation: scope.generation, kind: contract.kind, rows });
} catch (_) { return JSON.stringify({ schemaVersion: 3, operationalImportAllowed: false, error: 'observed-contract-unverified' }); }
`;
if (process.argv.includes('--write')) {
  const source = readFileSync(new URL('../shared/myCrewCareObservedContract.mjs', import.meta.url), 'utf8');
  writeFileSync(new URL('../android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js', import.meta.url), buildMyCrewCareObservedAsset(source));
}
