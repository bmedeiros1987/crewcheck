# Cirium primary / FlightAware fallback (production remains OFF)

This change reuses the existing Cirium injection/transport and FlightAware adapter. It does not activate either account, change credentials, enable a paid query, change the current legacy provider race, or make a diagnostic endpoint operational. `CIRIUM_SKY_PRODUCTION_ENABLED=false` and registration stays disabled. Only a code-injected Cirium capability with `flightAwareFallback:true` exercises the new sequence. The existing disabled production factory prepares that option for a separately reviewed activation.

For the authorized published flight/date/route/exact planned UTC, await Cirium first. A usable departure gate with matching occurrence/provenance and a source observation within15minutes is sufficient: no FlightAware call. A failed/unavailable/timed-out primary, invalid occurrence, absent/placeholder/position gate or unknown/stale gate observation allows at most one existing FlightAware call after primary completion. The existing transport owns its bounded timeout and abort; the sequencer adds no overlapping deadline, retries or speculative calls. Context and host admission are revalidated around each awaited source and before starting the fallback.

FlightAware selects a unique response-owned exact occurrence rather than the first unfinished flight. Departure gate/terminal fields stay separate from arrival. Ambiguous/mismatched rows fail closed. The existing adapter has no documented per-gate source update time: provenance explicitly says source freshness unknown and separately records response receipt. Receipt does not become gate-change time and this path does not emit the manual-review gateUpdate proof. Cirium's observation clock likewise does not prove when a gate changed. Providers' fields are not blended: a useful primary status may be retained with no gate if fallback has no confirmed gate; no-data remains explicit.

The sequential path is read-only. The actual host rechecks linked account authority, active roster source/revision and exact published occurrence before returning, then returns before any canonical/Concierge writer. Revocation while waiting stops fallback or suppresses the final result. Production OFF behavior and existing cache/transport limits remain unchanged.

## Activation dependencies

No continuous production activation is authorized by this code or inferred from a stored token. Existing evidence documents a09–23October2026 Sky trial and active credential; it does not establish current remaining calls or a durable shared financial ceiling. Existing transport quotas are per capability/process and cannot authorize continuous multi-process usage. A reviewed durable budget/cooldown, current entitlement/remaining allowance, deployment authority and actual source-envelope evidence are still required without new costs/permissions. No canary was executed.

PR1030 remains a separate draft (HEAD1311f198): response-proven published IATA→operating FS binding is not merged. The current strict operating-FS path must not treat published LA as an arbitrary FS identity or guess a different operator. Reuse/review that implementation before production activation for marketing-code rosters. Do not import an administrative diagnostic summary as flight data or enable Flex fallback.

Official public references consulted: https://developer.cirium.com/apis/cirium-sky-api/flight-status and https://developer.cirium.com/apis/cirium-sky-api/subscriptions (current browser text shell exposes no usable schema/entitlement evidence); https://developer.flightstats.com/api-docs/flightstatus/v2 documents distinct departure/arrival gates but is the Flex reference, not proof of Sky contract; https://www.flightaware.com/aeroapi/portal/documentation currently exposes a login shell. Existing reviewed transport contracts and synthetic fixtures are reused; no undocumented timestamp is invented.

Validation: regression-radar-sequential.mjs exercises real Cirium normalization, actual Radar race/public projection, actual FlightAware row selection and actual authenticated handler. It covers success without fallback, sequential invocation, errors/timeouts, missing/placeholder/arrival-only gates, wrong identity/UTC/day, stale/absent observations, no-data/ambiguity, context expiration and account/roster revocation before fallback/final response, in three timezones. Existing OFF wiring, bounded Sky transport and source-occurrence regressions remain required before and after canonical preparation. All fixtures are synthetic; no real data, messages, provider query or service configuration is involved.


## Local reconciliation and commercial readiness — 20 October 2026

The existing four #1143 commits (through 59e712cc) are replayed locally on published main 99850754. Only two server.mjs comment conflicts required resolution; the published unique-occurrence filter and healthy no-data behavior remain intact. No force-push, production registration, credential access or provider query is part of this reconciliation. The independent binding/shared-admission prototype remains at 31aed071 in its existing isolated clone; it is not copied into another implementation.

Bruno has authorized paid development. Lack of a free tier is no longer a development blocker. Subscription purchase, credentials, recurring amount and billable calls with an undefined ceiling remain outside this change. A process-local maxCalls and the MEMORY prototype are not a durable financial limit.

Read-only commercial research found:

| Item | Current evidence | Unresolved account-specific input |
| --- | --- | --- |
| Product | Sky subscriptions lists Pay As You Go and Contract; Flight Status by Flight is listed | Exact endpoint/product entitlement for this account |
| Billing | Pay As You Go is billed monthly; Contract terms are negotiated | Currency, unit rate/tiering, minimum or fixed fee, taxes and reset timezone |
| Volume | Subscription page advertises unlimited queries | This is not a spend cap; unit definition, empty/error/retry billing, overage and provider-enforced stop remain unconfirmed |
| Price | Sky links to the FlightStats pricing page | Pricing page requires authentication; no numeric price was visible |
| Cancellation | No account cancellation rule was established | Notice period, renewal, effective date, minimum term and outstanding usage charges |
| Account | Shared-browser inventory still shows My Cirium login; no authenticated pricing account was available | Account holder must supply authenticated terms/usage through the parent; no login or new credential was attempted |

Sources read directly: [Sky subscriptions](https://developer.cirium.com/apis/cirium-sky-api/subscriptions), [linked Pay As You Go pricing](https://developer.flightstats.com/getting-started/pricing), and [older evaluation/conversion page](https://developer.cirium.com/apis/cirium-sky-api/get-evaluation-account). The older page describes 30-day/20,000-request evaluation while the dedicated Sky subscriptions page describes 14-day limited evaluation. These are different public descriptions, not proof of this account's allowance. Never promote either trial figure or the historical credential-slot count into remaining billable balance.

The next implementation must reuse the existing shared admission contract, reserve durably before source invocation, retain uncertain attempts without refund, and cover all workers and both potentially billable providers. Any financial estimate also needs a verified upper cost per admitted request, fees and a scope covering external consumption; absent that mapping, an attempts counter cannot guarantee a currency ceiling. No database migration or production adapter is registered here. Actual source-envelope verification remains pending; synthetic fixtures do not establish coverage on the purchased product.
