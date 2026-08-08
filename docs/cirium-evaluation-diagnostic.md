# Cirium FlightStats Evaluation diagnostic

This diagnostic is intentionally separate from the canonical Radar parser and provider consensus.

## Render secrets

Add a newly generated, uncompromised credential pair to the backend service only:

- `CIRIUM_APP_ID`
- `CIRIUM_APP_KEY`

Do not prefix either variable with `VITE_`, put values in GitHub, or paste values into logs or support messages.

## Admin-only check

While signed in as an email listed in `CREWCHECK_ADMIN_EMAILS`, request:

`GET /api/platform/admin/diagnostics/cirium`

The response never includes credentials or the upstream response body. It reports only `not_configured`, `authenticated`, `plan_pending`, `forbidden`, `quota`, `available`, or `error`, plus a sanitized HTTP status or transport reason where applicable.

The probe requests the single LATAM (`LA`) airline reference record. This keeps the response small and tests an API included in the Evaluation Plan without invoking flight-status, airport, FIDS, or alert quotas.

When the result is `available`, the next separate step is a real-flight evaluation of status, gate, terminal, scheduled/estimated/actual times, and freshness. Cirium must not enter the provider consensus until that mapping is measured against the existing canonical contract.
