# CrewCheck for Garmin — Connect IQ MVP

Issue: #800

This adapter is a native Connect IQ renderer. It does not port the Android APK and it never parses a roster PDF or recalculates APZ, journey, compliance, finance, gate inference, or overnight logic.

## Ownership

This PR is peripheral-only. It owns the Connect IQ adapter, compact wire projection, fixtures/tests and consumer documentation. It does **not** own `android-wrapper/app/**`, `client/**`, PWA/native phone shell or the canonical phone publisher. Any phone bridge implementation is a handoff to CrewCheck Mobile Core. Maintaining a consumer schema mirror does not grant authority to redefine the canonical snapshot.

## Toolchain baseline

The current official Garmin baseline verified on 2026-09-24 is **Connect IQ SDK 9.2.0 (2026-08-25)**. Garmin's supported installation flow uses Connect IQ SDK Manager to install both the SDK and exact device definitions.

The source-control policy is deliberate: family names are documented in `DEVICE_MATRIX.md`, but exact manifest `<iq:product id="…">` values are only added after selection from installed Garmin device definitions. Product IDs are never guessed from marketing names or URLs.

## Product surfaces

### 1. Glance

Shows only current/next operational state, presentation/primary time, flight/route and sync freshness. Selecting it opens the full Watch App when supported.

### 2. Watch App

MVP pages:

- **Agora** — headline, primary time, flight/route, gate/overnight and freshness;
- **Jornada** — compact sequence from canonical `schedule`;
- **Escala** — next roster items;
- **Sync** — fresh/stale/offline and last validated snapshot age.

Free always keeps the useful roster. Premium-only surfaces are additive.

## Portable input contract

The adapter consumes `watchSnapshotV1`, whose canonical payload authority is **CrewCheck Mobile Core**, in `docs/mobile_watch_snapshot_v1_contract.md` (#824). Reviewed documentation reference: [Mobile contract at d35adceb08b283a234d1f86f0ae41c9b17bfff61](https://github.com/bmedeiros1987/crewcheck/blob/d35adceb08b283a234d1f86f0ae41c9b17bfff61/docs/mobile_watch_snapshot_v1_contract.md).

The parent peripheral document `docs/peripherals/watch_snapshot_v1.md` is consumer guidance; `peripherals/contracts/watchSnapshotV1.schema.json` is a consumer validation mirror, not a second normative source. This documentation change does not edit that JSON schema, its `$id`, validation keywords, fixtures or encoder. It does not certify complete runtime equivalence: timestamp ordering, normalization, entitlement and privacy checks also require the implementation tests; a schema declaration alone is not evidence of end-to-end interoperability.

If a difference is found, send the exact field, observed behavior and source SHAs to Mobile Core first. After the canonical decision, Peripherals updates only its own mirror, fixtures, encoder, cache and renderer and records the Mobile revision consumed. Do not import phone-side files from the parent stack to reconcile the contract. Cross-lane CI reads do not grant write ownership. The pinned draft reference is not a claim of merge, deployment, simulator acceptance or hardware validation.

Compatibility rules are deliberate:

- only `schemaVersion`, `generatedAtEpochMs` and `validUntilEpochMs` are required in v1;
- missing optional fields use documented defaults;
- missing `state` becomes `UNKNOWN`;
- missing `schedule` becomes `[]`;
- missing `premiumAccess` defaults to `false` (Free/fail-closed);
- unknown optional v1 fields are ignored;
- `source`, when supplied, must remain `canonical-roster`;
- Premium → Free changes only entitlement bits; the basic roster bit stays enabled;
- schema versions other than 1 are rejected rather than reinterpreted.

The current commercial model exposes a coarse `premiumAccess` boolean in `watchSnapshotV1`. The Garmin adapter maps `false` to capability mask `1` (basic roster only) and `true` to the current Premium feature mask. This compact mask is Garmin wire detail, not a new canonical phone contract.

## Data path

```text
CrewCheck canonical roster (Mobile/Server authority)
      ↓
watchSnapshotV1
      ↓ peripheral Garmin compact encoder
Mobile Core transport bridge / BLE Communications
      ↓
Connect IQ local cache
      ↓
Glance + Watch App renderer
```

Garmin receives a compact wire representation because Connect IQ/BLE throughput and memory are constrained. The phone remains authoritative and the watch never stores CrewCheck credentials.

### Compact wire keys

| Key | Meaning |
| --- | --- |
| `v` | schemaVersion |
| `i` | contextId |
| `g` | generatedAt epoch seconds on Garmin wire |
| `u` | validUntil epoch seconds on Garmin wire |
| `s` | state |
| `h` | headline |
| `t` | primaryTime |
| `f` | currentFlight |
| `r` | currentRoute |
| `p` | presentationTime |
| `a` | presentationPlace |
| `k` | gate |
| `o` | overnight |
| `n` | nextFlight |
| `d` | nextDetail |
| `c` | compact capability bitmask; bit 1 is always basic roster |
| `q` | compact schedule array |

Portable timestamps stay in milliseconds. The Garmin adapter divides them by 1000 before transmit so Connect IQ does not need epoch-millisecond values. Raw traffic, pickup, health or Live Ops enrichment has no direct MVP wire key.

## Cache/freshness

- Last validated snapshot is persisted in Connect IQ Application Storage.
- Garmin wire `u` determines fresh vs stale against `Time.now().value()`.
- Missing phone/network does not erase roster cache.
- Stale data remains visible with an explicit indicator.
- A newer snapshot replaces cache only after schema/version, capability and timestamp sanity checks.

## Communications

Use `Toybox.Communications.registerForPhoneAppMessages()` for phone-to-watch payloads when supported. The phone-side transport remains a Mobile Core responsibility; no CrewCheck credentials are stored in the Garmin app.

The `Communications` permission is required for the eventual Connect IQ manifest.

Official Garmin docs:

- https://developer.garmin.com/connect-iq/sdk/
- https://developer.garmin.com/connect-iq/api-docs/Toybox/Communications.html
- https://developer.garmin.com/connect-iq/api-docs/Toybox/WatchUi/GlanceView.html
- https://developer.garmin.com/connect-iq/device-reference/

## Source scaffold

`source/` contains:

- `SnapshotStore.mc` — validated cache + freshness;
- `CrewCheckApp.mc` — AppBase + phone-message receiver + Glance entry;
- `CrewCheckDelegate.mc` — device-independent page navigation;
- `CrewCheckView.mc` — round-first full Watch App renderer;
- `CrewCheckGlanceView.mc` — glance renderer.

The manifest/product matrix remains deferred until SDK Manager provides exact product IDs. We do not invent Garmin identifiers.

## Initial target matrix

See `DEVICE_MATRIX.md`. Qualification order:

1. D2 modern aviation profiles (Mach 2 / Mach 2 Pro first, then Mach 1 / Air X15 / Air X10);
2. fēnix / epix;
3. Forerunner;
4. Venu.

## Watch Face

Not part of this MVP. Garmin Watch Face is **deferred** until Glance + Watch App prove reliable sync, caching and battery behavior.

## Release gate

Before store submission:

- install current Connect IQ SDK/device definitions through SDK Manager;
- create manifest/product matrix only from installed definitions;
- build/export with that SDK;
- simulator coverage across one D2, one fēnix/epix, one Forerunner and one Venu;
- physical Garmin validation when hardware is available;
- payload-size measurement;
- fresh → stale → offline → fresh;
- Free roster remains useful without Premium;
- no raw health data in `watchSnapshotV1`;
- no CrewCheck credentials on the watch.
