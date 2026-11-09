# Current weather facts in existing notices

This is a presentation-only candidate based on main
`abe11a0c4655b69c94b3b6d8a8a34694864a3a97`. It reports supported **current**
METAR/SPECI facts, not a historical before/after delta.

## Changes

- `shared/weatherNoticeDetails.mjs` is a pure formatter, shared by the two Home
  weather notices and the already-admitted server Telegram report. No network,
  clock, storage, registration, consent or previous-report input.
- The compact detail includes wind/gust in kt, supported present-weather tokens,
  visibility and ceiling when reported, and the observation UTC group. A full
  date is shown only when supplied observation metadata agrees with that group.
  Raw-only landing cache shows **dia DD HH:MM UTC**, never a guessed month/year.
- Missing wind is not calm; only `00000KT` is labeled calm. VRB remains variable.
  MPS/KMH are deliberately omitted, not mislabeled kt. Absent gust is omitted.
  `9999`/CAVOK mean visibility ≥10 km; `0000` means <50 m. Missing ceiling,
  BKN/OVC000 and BKN/OVC/// do not produce a numeric ceiling, including when a
  second layer has a known height. No unlimited-ceiling inference is made.
- Only a bounded whitelist of body tokens is described. VCTS says **nas
  proximidades**. TAF, TREND, TEMPO, BECMG, forecast time groups, NOSIG and RMK
  terminate body interpretation; recent-weather groups such as RETS/RERA are not
  current conditions. The formatter is not a complete METAR decoder or validator.
- Telegram no longer uses persisted `previous.reasons` as outgoing current facts.
  The legacy `reasons` state remains byte-compatible; the body is rebuilt from the
  report admitted in this cycle, including pending retry. The demonstrated 30→40
  kt severity increase now says **rajadas 40 kt**, not the old 30 kt reason.
- Telegram display-only caps reserve space for three blocks and the existing
  disclaimer/opt-out: header 120, raw 600, source 80 UTF-16 units. An abbreviated
  raw report is explicitly marked `… [boletim abreviado]`. Full raw evidence is
  retained unchanged for evaluation, fingerprinting and persistence.

No renderer/card/button/native-code changes. Existing `message.detail` reaches
Pulse and the existing native/browser body; the current weather action is kept.
Local page-triggered notifications are **not** proof of delivery when the app is
terminated. Telegram remains independent of the running app.

## Deliberately unchanged

Classifier/severity, admission/freshness, candidate windows, account/recipient
selection, source/provider, raw fingerprint, cooldown, retry, lease/consent checks,
scheduler and number of sends remain unchanged. No new channel or paid messaging,
credentials, permissions, environment setting, migration or store publication.

The main classifier still searches its original raw report, including trend and
remarks. This candidate prevents those tokens from being described as observed
facts; it does not silently change when that classifier admits a notice.

Home's old signature/dedupe behavior is also unchanged. Its existing TAF-only
republication, lack of full observation proof and operational-window admission
are owned by draft **#1031**, not repaired indirectly in a copy patch. The test
explicitly documents the unchanged TAF-only publication, while preserving the
system-notification cooldown. No new account-unscoped baseline is persisted.

Display changes must not reopen dismissed notices. Both Home producers explicitly
retain the old default review identity and dedupe inputs. The old text retained
solely for identity compatibility is **not displayed**. Future identity migration
requires separate review; do not replace these compatibility inputs when
translating or adjusting the new display formatter.

## Ownership and composition

- #1031 `a8785781b726e8d47423ea302e2445ef586a7574` is DRAFT/HOLD. Its previous
  owner was confirmed completed, not executing, before local edits. This patch
  touches only complementary text/identity hunks, not its source/window/signature
  logic. Future composition must retain its admitted report (`report.raw` and
  `report.observedAt` in landing; validated station report in hourly Pulse), and
  rerun its flight-window/async/TAF vectors on that exact composition. No #1031
  merge or cherry-pick is included; #1032 remains evidence-only.
- #1191 `98db5e1e4b8fe05396bd44e64586ce2f267a0cea` overlaps `server.mjs` as a
  file only; its radar hunks are untouched. #1179 OFF push work is untouched.
- #1173 account-deletion fixture remains HOLD and untouched. Current main expects
  two financial deletes while production emits four; the known `4 !== 2` failure
  is disclosed, not weakened to make this candidate green.

## Offline validation contract

All new fixtures are synthetic; no actual provider lookup or notification send.

```sh
node --check shared/weatherNoticeDetails.mjs
node --check server.mjs
node --test scripts/tests/weather-notice-details.test.mjs
node --test scripts/tests/critical-weather-observation.test.mjs
node --test scripts/tests/weather-notice-producers.test.mjs
node scripts/regression-weather-monitor-heartbeat-health.mjs
node --test scripts/tests/weather-monitor-readiness.test.mjs scripts/tests/weather-monitor-canary-integration.test.mjs scripts/tests/weather-canary-account-deletion.test.mjs
```

The Home producer test requires the existing TypeScript dev dependency. It runs
real extracted Home functions through real Pulse/session/account-review modules,
with synthetic fetch, effect scheduling, preference lookup, sound and device
sinks. It checks identical factual details in Pulse/native/browser, old dismissal
identity, no duplicate on unchanged input, cleanup of delayed response, auth queue
clear, device permission/background/opt-in and existing action targets.

Server tests execute the actual cycle with fake storage/provider/sender: 30→40 kt
with empty new reasons, repeated delivery suppression, failed-delivery retry,
trend/remarks isolation, three long reports with complete opt-out, and full raw
state preservation. Existing observation and canary tests retain invalid/stale/
future/older/station/first-observation/cooldown/lease/revocation checks.

Run the same relevant tests before and after canonical source preparation, plus
TypeScript/build and existing Pulse checks. Exact-head CI and independent review
remain required; no merge/deploy claim follows from a local focused pass. Physical
device/browser UI validation is not claimed by the synthetic sinks.

Format references: [AWC METAR data guide](https://aviationweather.gov/help/data/)
and [FAA sky-condition reporting](https://www.faa.gov/air_traffic/publications/atpubs/fs_html/chap2_section_4.html).
