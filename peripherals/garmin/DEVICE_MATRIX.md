# CrewCheck Garmin — Device Matrix

Verified against the official Garmin Connect IQ device reference on 2026-09-24. The active development baseline is Connect IQ SDK **9.2.0** (released/updated 2026-08-25).

This file names supported **families/profiles** only. Exact `<iq:product id="…">` manifest identifiers must be selected from the locally installed Garmin Connect IQ SDK Manager/device definitions before the first real build. We intentionally do not guess product IDs.

## Tier A — Aviation first

These are the first simulator/device profiles to qualify because they are the closest match to CrewCheck's aviation audience:

- D2 Mach 2
- D2 Mach 2 Pro
- D2 Mach 1
- D2 Mach 1 Pro profile where exposed through the shared epix/tactix device definition
- D2 Air X15 / Venu 4 45mm shared profile
- D2 Air X10

Release expectation: at least one modern D2 AMOLED profile must pass Glance + Watch App, Free roster, stale/offline cache and phone-message round trip before broad Garmin rollout.

## Tier B — fēnix / epix

Primary broad-reach high-end profiles:

- fēnix 9 family
- fēnix 8 / 8 Pro / 8 Solar family
- fēnix 7 / 7 Pro family
- epix Gen 2 / epix Pro Gen 2 family

These devices are important for round-screen layout, buttons/touch variation, AMOLED vs non-AMOLED behavior and larger installed-base validation.

## Tier C — Forerunner

Initial profiles:

- Forerunner 970
- Forerunner 965
- Forerunner 570 42mm / 47mm
- Forerunner 265 / 265S
- Forerunner 170 / 170 Music
- Forerunner 165 / 165 Music

The MVP renderer must not assume aviation-specific hardware features; only the canonical CrewCheck snapshot contract is shared.

## Tier D — Venu

Initial profiles:

- Venu 4 41mm
- Venu 4 45mm / D2 Air X15
- Venu X1
- Venu 3 / 3S

Venu coverage is useful for touch-first consumer hardware and small/large AMOLED layout validation.

## Explicitly deferred

- Garmin Watch Face: deferred until Glance + Watch App prove sync/cache/battery behavior.
- raw Garmin health/activity reads: not part of the roster MVP.
- device-side roster parsing, APZ, journey/compliance or PDF handling: prohibited.
- paid API calls from the watch: prohibited.

## Simulator gate

Before enabling a product ID in the active manifest:

1. select the exact device in **Connect IQ SDK Manager 9.2.0** or later;
2. copy the product identifier from Garmin's installed device definition rather than documentation guesses;
3. compile/export the Watch App for that profile;
4. run fresh → stale → offline → fresh;
5. verify Free retains Agora/Jornada/Escala data;
6. measure payload size and renderer memory/battery behavior;
7. record pass/fail here or in CI evidence.

Official references:

- https://developer.garmin.com/connect-iq/sdk/
- https://developer.garmin.com/connect-iq/device-reference/
- https://developer.garmin.com/connect-iq/api-docs/Toybox/Communications.html
