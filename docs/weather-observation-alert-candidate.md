# Fresh first-observation weather alerts

## Bounded correction

The existing Telegram critical-weather monitor suppresses a first observation at
severity 2. That includes heavy rain and gusts of 25–34 kt, although the existing
in-app notice already accepts severity 2. This change makes a first relevant,
verified, fresh observation eligible for the existing delivery path.

This increases initial alert volume for snapshots already eligible under the
existing policy. It does not subscribe anyone, change opt-out behavior, extend a
flight window, change station selection, activate a scheduler or add a provider.

The pure `evaluateCriticalWeatherDelivery` policy requires an official report from
the existing REDEMET/AviationWeather adapter, a matching station and METAR/SPECI
observation group, and a usable full observation timestamp. ISO, Unix seconds and
Unix milliseconds are supported. The observation must not be future-dated, older
than 60 minutes, or older than the persisted baseline. The age bound is an alert
product policy, not operational weather validity or a claim that conditions are
unchanged. Invalid/unavailable data must not be interpreted as safe weather.

For accepted observations, existing fingerprint deduplication, 90-minute cooldown,
severity-increase exception and pending-delivery retry behavior remain. Rejected
observations increment the existing aggregate failure count and never replace a
newer baseline or clear a pending delivery. No new public diagnostics route is
introduced; the current authenticated health route and scheduler gate remain.

## Incident regression evidence

Public SBGR observations on 4 October 2026:

- SPECI 16:48Z: `03015G33KT ... 5000 +RA BR`.
- METAR 17:00Z: `02015G30KT ... 9000 -RA`.

Both classify as severity 2 under the existing classifier. The tests retain the
actual observations and demonstrate the former initial-observation omission.
Source: [NOAA AviationWeather METAR/SPECI feed](https://aviationweather.gov/api/data/metar?ids=SBGR&format=json&hours=4),
retrieved on 4 October 2026. This rolling URL will change with newer observations.
The integration tests use synthetic snapshots and a fake Telegram sender only.

## Explicitly still pending

- Reliable remote notifications while the app is suspended or closed. This patch
  does not implement Web Push or FCM and does not complete draft #896.
- Current-stay weather coverage outside the existing flight windows. A future
  candidate must consume a verified current canonical stay, or an explicitly
  confirmed bounded airport context. A future flight, historical GPS or stale
  stored coordinates cannot establish the user's present location.
- TAF/SIGMET alert evaluation. The present severity classifier consumes METAR only.
- Production scheduler flag/heartbeat verification and consented physical delivery
  tests. A configured Telegram bot is not proof that the weather worker is active.

## Ownership and acceptance

The patch changes only the delivery-decision block and one import in `server.mjs`,
plus a new module, tests, this note and a focused CI workflow. Open #872 also changes
`server.mjs`, in the separate Open-Meteo forecast section. No Home, Pulse, service
worker, Android, Wake, outbox, migration, environment or credential file is changed.
The existing Mobile Core and push ownership boundaries remain intact.

Require independent review of the exact candidate SHA and relevant CI, including
the prepared production-source pass. Keep draft until those checks complete.
No live alert or notification subscription is part of validation.

## Reproduce

    node --check server/weather/critical-observation.mjs
    node --check server.mjs
    node --test scripts/tests/critical-weather-observation.test.mjs
    node scripts/regression-weather-monitor-heartbeat-health.mjs

Repeat the tests after the repository's standard `node scripts/v139/apply.mjs`
preparation. Existing full web validation must also remain green.
