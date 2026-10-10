# Cirium FlightStats Evaluation diagnostic

This diagnostic is intentionally separate from the canonical Radar parser and provider consensus.

## Render secrets

Add a newly generated, uncompromised credential pair to the backend service only:

- `CIRIUM_APP_ID`
- `CIRIUM_APP_KEY`

Do not prefix either variable with `VITE_`, put values in GitHub, or paste values into logs or support messages.

## Opt-in

The diagnostic is disabled unless `CIRIUM_DIAGNOSTIC_ENABLED` is exactly `true`; otherwise it reports `disabled` before reading any credential. The legacy FlightStats probe also requires `CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX` to be exactly `true`; Flex credentials are never an automatic fallback for the Sky probe.

## Admin-only check

While signed in as an email listed in `CREWCHECK_ADMIN_EMAILS`, request:

`GET /api/platform/admin/diagnostics/cirium`

The response never includes credentials or the upstream response body. It reports only `not_configured`, `authenticated`, `plan_pending`, `forbidden`, `quota`, `available`, `unverified`, `invalid_payload`, `error`, plus a sanitized HTTP status or transport reason where applicable.

`unverified` means the response cannot prove authentication or available data: a `404`/`405`, or a `2xx` whose body is unusable. A `404` or `405` is never reported as `authenticated`. A `2xx` carrying a body that is not the expected JSON shape reports `invalid_payload` instead of `available`.

The probe requests the single LATAM (`LA`) airline reference record. This keeps the response small and tests an API included in the Evaluation Plan without invoking flight-status, airport, FIDS, or alert quotas.

When the result is `available`, the next separate step is a real-flight evaluation of status, gate, terminal, scheduled/estimated/actual times, and freshness. Cirium must not enter the provider consensus until that mapping is measured against the existing canonical contract.

For that isolated evaluation, an Admin can request:

`GET /api/platform/admin/diagnostics/cirium/flight?carrier=LA&flight=3377&date=2026-08-09`

The date is the local departure date and must be within the Flight Status API's current-data window. The response contains only normalized operational fields and presence/freshness measurements; it never returns the upstream body or credentials. Omitting parameters uses LA3377 and today's date in `America/Sao_Paulo`; a present but malformed value is rejected locally (`invalid_carrier`, `invalid_flight`, `invalid_date`) without any request, and a date outside the provisional ±2 day window reports `date_out_of_window`. Rows that answer a different flight or carrier, or that are malformed, are never displayed and are counted in `rejectedRows`; a valid response with no matching row reports `no_data`.

## Request limits

Every upstream call must pass a session budget, a minimum interval, and a provider cooldown before the request is made. Identical requests are deduplicated while in flight and served from a result cache afterwards. A `429` records a cooldown from `Retry-After` (60 s fallback when the header is absent) and is never retried automatically: there is no polling, no scheduling and no provider fallback. When a limit blocks the call, the diagnostic reports `budget_exhausted`, `rate_limited_local` or `provider_cooldown` and no upstream request happens.

This state lives in one Node process: it resets on restart or deploy and is not shared between instances, so it reduces accidental spend but does not replace a provider-side quota.

## Roadmap gate

The laboratory adapter maps a Flight Status fixture to the existing Radar shape and measures field coverage. It deliberately uses departure gate and terminal only; arrival resources can never fill the boarding fields. The adapter is not imported by `server.mjs`, is absent from the provider race/order, and has no production enable flag.

A numeric value the provider did not report stays `null` in the adapter and in the diagnostic summary; `null`, an empty string, a boolean or a non-numeric string never become a displayed `0`. `ciriumCoverage` counts delays as coverage only when a real delay value was reported.

Activation remains blocked until a real response demonstrates the correct segment identity and acceptable coverage for status, departure gate/terminal, scheduled/estimated/actual times, and freshness. After that evidence, integration must be a separate PR with rollback flag, health isolation, cache, and existing-provider preservation.
