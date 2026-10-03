# Mobile-owned CrewWatch phone contract — watchSnapshotV1

## Ownership and source of truth

This document describes the **phone-side contract owned by CrewCheck Mobile**. It is the authoritative reference for the canonical `watchSnapshotV1` payload semantics: version, required and optional fields, defaults, entitlement projection, timestamp meaning and compatibility. Peripherals consume it; they do not own `android-wrapper/app/**` or the mobile/PWA producer. The integration was reconciled on top of `main@5c925ab5bb62dcea28ecd533381b7461f935a253` and re-audited against peripheral specs #773@`7f30c16b2abb19427646f0ffccbac50f2471fba8` and #801@`913520fa00ca0a9d398b9120fc9358adec7072e7`.

The watch never parses PDFs, recalculates APZ/journeys/compliance/finance, or becomes an operational source of truth. The source remains the canonical CrewCheck roster. The phone only projects an allow-listed presentation snapshot and transports it through Wear Data Layer.

### Documentation authority and consumer-owned representations

Ownership of a consumer document, schema mirror or interoperability test does not create a second authority over the canonical payload. The responsibilities are distinct:

| Surface | Authoritative owner | Scope |
| --- | --- | --- |
| This document and the phone producer/publisher | CrewCheck Mobile Core | Canonical snapshot semantics and phone-side implementation. |
| `docs/peripherals/watch_snapshot_v1.md` | CrewCheck Peripherals | Consumer/renderer guidance subordinate to this document, with a reviewed Mobile commit reference. |
| `peripherals/contracts/watchSnapshotV1.schema.json` and Garmin input documentation | CrewCheck Peripherals | Consumer validation mirror, not an independently evolving canonical schema. |
| Wear/Garmin/TV renderers and device-specific adapters | CrewCheck Peripherals | Local presentation, transport adaptation and device limits; never authority over the phone payload. |

If a consumer summary or mirror disagrees with this document, report the exact discrepancy to Mobile Core first. Do not silently change either endpoint, retarget a peripheral PR to import phone files, or make a missing optional v1 field fatal. A device-specific compact representation may have different keys or units only through an explicitly documented adapter; it must not redefine the source fields.

Change order: Mobile Core first reviews any proposed canonical semantic change and records its exact commit and compatibility expectations; Peripherals then reviews and updates only its own consumer documentation, mirrors, fixtures and adapters against that reference. CI may read both sides for interoperability without granting either lane write ownership of the other's files. A draft contract revision or a passing check is not authorization to merge, publish or bypass physical acceptance.

This authority clarification changes documentation only. It does not add, remove or rename fields, change defaults, transport paths, freshness, consent, entitlements or runtime behavior. Source references in draft PRs identify candidates, not a deployed release.

## watchSnapshotV1

Transport path: `/crewcheck/watch/context/v1`

Sync request path: `/crewcheck/watch/request-sync/v1`

Data key: `snapshotJson`

Maximum normalized payload: 16 KiB.

### Required producer fields

- `schemaVersion`: integer `1`.
- `generatedAtEpochMs`: positive epoch milliseconds.
- `validUntilEpochMs`: epoch milliseconds greater than or equal to `generatedAtEpochMs`.

All three required numeric fields must be JSON integer values, never numeric strings or fractional numbers. The native sanitizer rejects coercive representations instead of silently promoting them into a valid v1 snapshot.

`state` is accepted from the canonical producer but normalized to the allow-list (`OFF_DUTY`, `LEAVE_SOON`, `REPORTING`, `BOARDING`, `IN_FLIGHT`, `CONNECTION`, `OVERNIGHT`, `CHANGED`, `UNKNOWN`). Missing or unsupported values become `UNKNOWN`.

### Optional/basic fields

The phone may send `contextId`, `headline`, `primaryTime`, `detail`, `presentationTime`, `presentationPlace`, `currentFlight`, `currentRoute`, `boardingTime`, `eta`, `connection`, `nextFlight`, `nextDetail`, `overnight` and up to eight `schedule` items. Schedule items are allow-listed to `id`, `kind`, `time`, `title`, `route`, `presentation`, optional `gate`, and `detail`; invalid or missing `schedule[].kind` becomes `duty` before publication.

The normalized phone payload always injects `source: "canonical-roster"`. Credentials, CPF, e-mail, phone number, crew name, hotel room, tokens and authorization fields are rejected.

### Premium boundary

`premiumAccess` is an **optional additive v1 field**. Its default is `false` when absent. Only the JSON boolean `true` enables Premium; any other type fails closed to `false`. The same strict-boolean rule applies to optional boolean projection fields such as `remoteStand` and `changed`. The current mobile producer derives entitlement from the stored CrewCheck account and may explicitly override it for tests/controlled callers.

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
- **New peripheral + old phone:** missing `premiumAccess` means `false`. Basic roster still works; premium-derived fields must not be assumed available. A malformed non-boolean entitlement value also fails closed instead of being coerced.
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

The request payload is a new opaque nonce for each correlated test, generated by Mobile and valid for 5 seconds. It is at most 64 Unicode code points / 256 UTF-8 bytes and contains no control characters. A v1 peer echoes a valid nonce exactly as `requestId`, **without trim, normalization or rewriting**. The phone compares that exact value against the active nonce; surrounding whitespace, a changed byte/code point, a different nonce or a late response can never verify the current test. A missing, non-string, control-containing or over-limit `requestId` degrades to legacy/unverified compatibility data and never completes the correlated test.

For response fields, `round` defaults to `false`, `batteryPercent` defaults to unavailable (`-1`), numeric dimensions/freshness timestamps default to `0`, and optional strings default to empty. A legacy response with no `requestId` may refresh privacy-minimal telemetry while an active nonce remains pending, so a current peer can still complete verification inside the 5-second window.

## Downgrade and failure behavior

A subscription downgrade must not delete or hide the basic roster. Premium-only values disappear from the next phone projection. A stale cache remains stale. Malformed/oversized telemetry is ignored without replacing the last known-good Device Hub status. An invalid watch snapshot is rejected before it replaces the phone's last validated snapshot.

## Mobile coexistence gates

Before merge, this phone-side integration must remain compatible with the current Mobile implementations of:

- durable Android/PWA shared-PDF handoff from #797 or its successor;
- Android blank-screen/self-heal and active-roster restoration;
- canonical parser/APZ/journey/compliance/finance behavior;
- CrewLife privacy boundary (no raw health series through this contract).

The earlier wording that #773 and #801 were still changing phone-side files is obsolete; the reconciliation recorded in #824 removed that overlap. This is not a blanket certification of future heads: check the current diff and inherited stack before consolidation. Phone-side changes remain exclusively Mobile Core-owned. Consumer-side requirements from any peripheral PR are handed off here rather than merged as independent phone implementations. Existing CI and physical-device acceptance gates remain unchanged.
