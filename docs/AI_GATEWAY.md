# CrewCheck AI Gateway

This foundation is deliberately isolated from roster parsing, compliance, APZ and regulatory calculations. Those domains remain deterministic and local-only. The gateway is an optional language layer for non-critical experiences such as wording, summaries and low-risk classification.

## Routing matrix

| Layer | Use | External data | Expected marginal cost |
| --- | --- | --- | --- |
| Local rules/code | calculations, known intents, cached/templates | none | approximately zero |
| Light/free | short explanations, summaries, classification | minimized allowlisted context only | free-tier quota; budget unit per attempt |
| Strong/paid | rare ambiguous or long-form requests | minimized context only | provider price; two explicit opt-ins required |

Routing order is local resolvers, enabled light providers in configured order, then an enabled strong provider only when both `AI_ALLOW_PAID=true` and the individual request has `allowPaid: true`. Exhaustion fails closed; it never turns an unavailable model into a critical operational answer.

## Privacy boundary

Raw CrewLife/Fem health, cycle, fertility, sexuality, sleep, symptom, identity, location, flight and roster fields are denied or removed before an external call. Callers should calculate patterns locally and provide only coarse facts through the allowlist (`intent`, `locale`, `tone`, `category`, `summary`, `priority`, `riskBand`, `timeBand`, `count`, `trend`, `preference`). `raw-sensitive` requests are blocked. Telemetry contains provider layer, result, reason and latency, never prompt or context.

## Environment variables

All providers are off by default and secrets are read only at runtime.

| Variable | Purpose | Default |
| --- | --- | --- |
| `AI_KILL_SWITCH` | disables all external calls immediately | `false` |
| `AI_ALLOW_PAID` | deployment-level paid-tier opt-in | `false` |
| `AI_OPENROUTER_ENABLED` | OpenRouter feature flag | `false` |
| `OPENROUTER_API_KEY` / `AI_OPENROUTER_MODEL` | credential and model | secret / `openrouter/free` |
| `AI_CLOUDFLARE_ENABLED` | Workers AI feature flag | `false` |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_AI_API_TOKEN` / `AI_CLOUDFLARE_MODEL` | Workers AI settings | secrets / small instruct model |
| `AI_GEMINI_ENABLED` | Gemini feature flag | `false` |
| `GEMINI_API_KEY` / `AI_GEMINI_MODEL` / `AI_GEMINI_TIER` | Gemini settings; tier may be `strong` | secret / `gemini-3.8-flash` / `light` |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | bounded attempt policy | `2500` / `1` |
| `AI_CIRCUIT_FAILURE_THRESHOLD` / `AI_CIRCUIT_RESET_MS` | circuit breaker | `3` / `60000` |
| `AI_DAILY_BUDGET_UNITS` | process-local daily attempt ceiling | `1000` |
| `AI_RATE_LIMIT_PER_MINUTE` | process-local limit per provider | `30` |

The in-memory limits are safe defaults for one instance. Before horizontal production rollout, back the budget and rate counters with a shared atomic store; until then keep provider quotas as a second hard ceiling.

Provider account/key onboarding and the safe smoke-test procedure are documented in [`docs/AI_PROVIDER_SETUP.md`](./AI_PROVIDER_SETUP.md).

The separate internal engineering-review CLI is documented in [`docs/AI_DEV_ORCHESTRATOR.md`](./AI_DEV_ORCHESTRATOR.md). It reuses provider adapters but has no public endpoint and does not participate in product decisions.

## Integration contract

Create providers with `providersFromEnv`, construct `AiGateway` with deterministic `localResolvers`, and inject a sanitized telemetry callback. Do not expose the gateway as a generic unauthenticated endpoint. A product integration must add authentication, an intent-specific request schema and per-user abuse controls. Provider responses remain advisory copy and must not mutate operational facts.
