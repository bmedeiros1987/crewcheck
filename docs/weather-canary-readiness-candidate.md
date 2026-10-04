# Weather canary readiness candidate

Status: draft implementation. It remains unactivated and has not sent any real notification or changed production configuration.

Base: main `13634cf1467b855fa9504435acd3043c56a64bd3` (weather observation PR #905 merged).
Verified source blobs: server.mjs `a66dae814162e89ce6210717dd9c23e81cd439a0`; server/platform.mjs `2cc6602e5ae1034bec5463368e1ec51c7db612d2`.

## What is implemented

- Existing scheduler-authenticated GET `/api/telegram/weather-monitor/health` gains sanitized configuration readiness. It does not expose target digest, account, chat, secrets, roster or source environment values. `deliveryVerified` stays false.
- A separate canary configuration uses exactly one SHA-256 account/private-chat selector. The selector is not a credential or authority by itself. Presence of any canary configuration prevents fallback to the legacy broad audience, including the manual run path. Malformed flags/targets fail closed; explicit false disables it.
- Canary uses fresh durable forward/reverse Telegram binding records, exact account/chat matching, link revision, current roster and a separate weather consent record. Existing local snapshot caches cannot grant consent or resurrect an opt-out. Enrollment is restricted to the configured test recipient; ordinary legacy opt-ins never create the new record. Explicit revocation of an existing canary record remains possible after its configuration is removed.
- Only an exact `/alertameteo on` command grants new canary consent, through the existing secret-protected Telegram route. Off remains possible while the transport secret is unavailable. Ordering uses trusted Telegram `message_id` and a conditional SQL write, scoped to the private chat. An older delayed on cannot overwrite a newer acknowledged off.
- Recipient lookup is an exact bound digest query, not the latest 250 snapshots.
- A MySQL named connection lock serializes the canary across manual calls, timer invocations and rolling processes. The existing pool and state table are reused, without a migration or new service. Lock ownership and authoritative consent are rechecked before dispatch.
- A durable pre-send intent prevents automatic replay of a canary attempt after ambiguous provider acceptance or failed final persistence. This is deliberately a bounded test path: an intent may be recorded even if no message ultimately reaches the provider. There is no exactly-once or guaranteed-delivery claim. Ambiguous attempts require review before a retry.
- Account deletion removes the new consent record within the existing transaction. Consent writes lock the same link/snapshot/consent rows, so a delayed grant cannot recreate consent after account deletion.
- Legacy behavior is preserved when no canary configuration exists; neither global activation nor transport configuration is changed by these files.

## Reviewable changes

New files:
- server/weather/monitor-readiness.mjs
- scripts/tests/weather-monitor-readiness.test.mjs
- scripts/tests/weather-monitor-canary-integration.test.mjs
- scripts/tests/weather-canary-account-deletion.test.mjs
- scripts/regression-weather-canary-mysql.mjs
- .github/workflows/weather-canary-readiness.yml
- docs/weather-canary-readiness-candidate.md

Existing-file changes:
- server.mjs: review `server-integration.patch`, based on the exact weather observation source above
- server/platform.mjs: review `account-deletion-integration.patch`, a single deletion-query change
- scripts/tests/critical-weather-observation.test.mjs: preserve its evaluator tests; provide legacy settings to its VM harness and update the relocated scheduler-setting assertion

The baseline files, prepare-candidate.py, patch files and test result text are local review aids, not files to add to the repository. The copied critical-observation module, heartbeat regression and weather-observation workflow are unchanged base dependencies.

## Verification

Run:

    node --check server.mjs
    node --check server/platform.mjs
    node --check server/weather/monitor-readiness.mjs
    node --test scripts/tests/weather-monitor-readiness.test.mjs scripts/tests/weather-monitor-canary-integration.test.mjs scripts/tests/weather-canary-account-deletion.test.mjs scripts/tests/critical-weather-observation.test.mjs
    node scripts/regression-weather-monitor-heartbeat-health.mjs

Current local result: **128 tests pass, zero failures/skips**, plus the existing heartbeat regression and syntax checks for both server files and the new module. The new workflow includes the same tests again after canonical production preparation plus real isolated MySQL checks before and after preparation. Those CI stages have not run yet in this focused partial checkout.

All local tests use synthetic account/chat/DB/provider fixtures. There is no network, live SQL access, real message delivery or credential access in this validation. The local MySQL-helper tests use fakes. CI additionally starts mysql:8.4 with network disabled and no published ports, following the existing #894 test-service pattern. The SQL script only accepts the named disposable Unix socket and test database, never DATABASE_URL or an external host. It covers real JSON normalization, exact lookup, 30 concurrent commands, delayed on/off ordering, advisory locking and connection-loss release, deletion races/rollback/isolation, and persisted intent across a simulated restart. CI completion is still required; no provider delivery is tested.

Before merge/activation: run the canonical preparation and required exact-head aggregate checks, exercise these SQL helpers on an isolated real MySQL test database, complete coordinator review, confirm the production prerequisites through the unchanged authenticated health route, and obtain approval for the exact test destination/content and bounded activation. Do not provision a new database or inspect/configure credentials just to perform these checks.

## Activation boundary

Do not set any live variable in this task. A later approved canary needs:

- Existing `CREWCHECK_SCHEDULER_SECRET` or its supported alias, existing Telegram bot configuration, an existing configured `TELEGRAM_WEBHOOK_SECRET`, and working durable MySQL state.
- `CREWCHECK_WEATHER_MONITOR_ENABLED=false` to keep the broad legacy audience disabled.
- The approved exact account/private-chat digest in `CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256`, and literal `CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED=true`.
- A fresh explicit `/alertameteo on` from that linked private Telegram chat, received through the verified existing webhook.

No raw selector values are included here. New credentials/persistent access, if actually missing, need their own approval and secure entry. Transport/device enrollment, actual test sends and activation remain unperformed. No FCM, Web Push, Android permission, new subscription, paid message or store release is added.

Revocation before the last check is revalidated; revocation after that check can still race provider submission. Already accepted Telegram messages cannot be recalled. The canary is operational assistance, not a guaranteed aviation safety channel.
