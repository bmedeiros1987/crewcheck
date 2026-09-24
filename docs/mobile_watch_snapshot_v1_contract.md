# Mobile-owned CrewWatch phone contract — watchSnapshotV1

## Ownership and source of truth

This document describes the **phone-side contract owned by CrewCheck Mobile**. Peripherals consume it; they do not own `android-wrapper/app/**` or the mobile/PWA producer. The integration was reconciled on top of `main@5c925ab5bb62dcea28ecd533381b7461f935a253` after reviewing peripheral specifications in PR #773 and PR #801.

The watch never parses PDFs, recalculates APZ/journeys/compliance/finance, or becomes an operational source of truth. The source remains the canonical CrewCheck roster. The phone only projects an allow-listed presentation snapshot and transports it through Wear Data Layer.

## watchSnapshotV1

Transport path: `/crewcheck/watch/context/v1`

Sync request path: `/crewcheck/watch/request-sync/v1`

Data key: `snapshotJson`

Maximum normalized payload: 16 KiB.

### Required producer fields

- `schemaVersion`: integer `1`.
- `generatedAtEpochMs`: positive epoch milliseconds.
- `validUntilEpochMs`: epoch milliseconds greater than or equal to `generatedAtEpochMs`.

`state` is accepted from the canonical producer but normalized to the allow-list (`OFF_DUTY`, `LEAVE_SOON`, `REPORTING`, `BOARDING`, `IN_FLIGHT`, `CONNECTION`, `OVERNIGHT`, `CHANGED`, `UNKNOWN`). Missing or unsupported values become `UNKNOWN`.

### Optional/basic fields

The phone may send `contextId`, `headline`, `primaryTime`, `detail`, `presentationTime`, `presentationPlace`, `currentFlight`, `currentRoute`, `boardingTime`, `eta`, `connection`, `nextFlight`, `nextDetail`, `overnight` and up to eight `schedule` items. Schedule items are allow-listed to `id`, `kind`, `time`, `title`, `route`, `presentation`, optional `gate`, and `detail`.

The normalized phone payload always injects `source: "canonical-roster"`. Credentials, CPF, e-mail, phone number, crew name, hotel room, tokens and authorization fields are rejected.

### Premium boundary

`premiumAccess` is an **optional additive v1 field**. Its default is `false` when absent. The current mobile producer derives it from the stored CrewCheck entitlement and may explicitly override it for tests/controlled callers.

Basic roster remains available with `premiumAccess=false`. Fields that can depend on paid/costly integrations are projected only when `premiumAccess=true`:

- `leaveTime`
- `trafficDetail`
- `gate`
- `remoteStand`
- `hotelPickup`
- `changed`
- `schedule[].gate`

When Premium is absent or downgraded, the next normalized snapshot omits those optional premium-only values and forces `changed=false`, while preserving the basic canonical roster.

## Backward compatibility

- **Old peripheral + new phone:** the extra `premiumAccess` field is additive; old consumers must ignore unknown fields and continue reading schema v1.
- **New peripheral + old phone:** missing `premiumAccess` means `false`. Basic roster still works; premium-derived fields must not be assumed available.
- **Old telemetry peer:** a Device Hub status response without `requestId` may refresh cached device status but is explicitly unverified and cannot complete the current round-trip test.
- **New telemetry peer:** a non-empty `requestId` must exactly match the phone's active nonce inside the 5-second verification window. Mismatched or late nonces are ignored.

No v1 consumer may make a missing optional field fatal.

## Stale and offline behavior

`validUntilEpochMs` is authoritative for roster freshness. The native phone service may republish the last already-validated cached snapshot when the web runtime is not in foreground, but it preserves the original timestamps. Republish therefore **never turns stale data into fresh data**.

Peripherals may continue showing cached basic roster offline, but must surface stale/offline state once `validUntilEpochMs` has passed. Missing snapshot data is not equivalent to an empty roster.

## Device Hub / telemetry v1

Phone request path: `/crewcheck/watch/device-status/request/v1`

Peripheral response path: `/crewcheck/watch/device-status/response/v1`

Maximum response: 4 KiB.

The phone persists only privacy-minimal device/app metadata: node id/name, manufacturer/model, app version, battery percentage, round/screen geometry, last snapshot `generatedAt`/`validUntil`, response timestamp and round-trip verification metadata. It does **not** persist roster contents, PDFs, credentials or raw health data in the Device Hub store.

The request payload is an opaque nonce. For a verified test, the peer echoes it as `requestId` with `schemaVersion=1`. The phone accepts only an exact match within 5 seconds. Legacy blank `requestId` remains readable as unverified compatibility data.

## Downgrade and failure behavior

A subscription downgrade must not delete or hide the basic roster. Premium-only values disappear from the next phone projection. A stale cache remains stale. Malformed/oversized telemetry is ignored without replacing the last known-good Device Hub status. An invalid watch snapshot is rejected before it replaces the phone's last validated snapshot.

## Mobile coexistence gates

Before merge, this phone-side integration must remain compatible with the current Mobile implementations of:

- durable Android/PWA shared-PDF handoff from #797 or its successor;
- Android blank-screen/self-heal and active-roster restoration;
- canonical parser/APZ/journey/compliance/finance behavior;
- CrewLife privacy boundary (no raw health series through this contract).

PR #773 and PR #801 remain peripheral specifications while they continue changing the same phone-side files. Their phone-side hunks must not be merged independently after this Mobile-owned contract lands; future peripheral work should consume this contract instead.
