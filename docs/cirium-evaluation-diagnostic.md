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

For that isolated evaluation, an Admin can request:

`GET /api/platform/admin/diagnostics/cirium/flight?carrier=LA&flight=3377&date=2026-08-09`

The date is the local departure date and must be within the Flight Status API's current-data window. The response contains only normalized operational fields and presence/freshness measurements; it never returns the upstream body or credentials. Omitting parameters uses LA3377 and today's date in `America/Sao_Paulo`.

## Roadmap gate

The laboratory adapter maps a Flight Status fixture to the existing Radar shape and measures field coverage. It deliberately uses departure gate and terminal only; arrival resources can never fill the boarding fields. The adapter is not imported by `server.mjs`, is absent from the provider race/order, and has no production enable flag.

Activation remains blocked until a real response demonstrates the correct segment identity and acceptable coverage for status, departure gate/terminal, scheduled/estimated/actual times, and freshness. After that evidence, integration must be a separate PR with rollback flag, health isolation, cache, and existing-provider preservation.

