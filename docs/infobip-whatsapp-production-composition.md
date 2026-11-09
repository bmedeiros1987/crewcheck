# Explicit Infobip production composition — default OFF

Host follow-up: [OFF bootstrap and remaining real-host gates](infobip-whatsapp-host-wiring.md).
The history below describes #1209. Its production factory is now reached through
the separately tested host wrapper only when explicit capabilities are supplied;
the installed public host still has no options and remains OFF. The original P2
was subsequently confirmed corrected and resolved after exact-HEAD review.

Base: main `5de6661a499bda6c6e656f95d5c1782d7bfd23aa`. New isolated branch;
no other active Infobip production-composition owner or competing open PR was
identified. No AGENTS.md exists in the checkout. The existing public bootstrap
and its source preparer are unchanged: `createInfobipWhatsAppRuntime()` remains
sealed OFF. No environment setting activates this change. No profile, secret,
account, permission, provider, deployment or real message was changed or queried.

## Entry point and required capabilities

`await createInfobipWhatsAppProduction()` returns the held runtime before reading
any other option. No production caller is installed. Explicit `enabled:true`
is necessary but insufficient; every dependency below must be supplied. Errors
return sanitized codes, never raw credential/SQL/provider diagnostics.

- `configuration.sender`, `baseUrl`, explicit `allowedSenders` and exact HTTPS
  `allowedBaseUrls`. The existing strict Infobip API origin and phone validators
  still apply. No URL, account or sender is discovered from env/webhook input.
- `configuration.authentication:'hmac-sha256'`. No Basic fallback or sniffing.
- `configuration.credentialReferences` with exactly four distinct opaque refs:
  `apiKey`, `encryptionKey`, `linkHashKey`, `webhookSecret`. The injected
  `credentials.resolve(ref,{purpose,signal})` resolves them with a shared two-second
  deadline. Values are not config literals, logged, returned, or stored in quota
  rows. The encryption key is copied as a 32-byte Buffer. Reference validation
  does not prove a string is non-secret: the host must supply actual references,
  not credentials disguised as reference names.
- `configuration.deploymentBinding`: profileId, nonempty subscriptionIds, sender,
  baseUrl, publicOrigin and linkHashKeyReference matching the selected config.
  These are **trusted host assertions after inventory**, not proof of the real
  profile or its current settings. The factory never accepts them from HTTP.
- Existing direct mysql2-compatible `db` capability, without pool creation or
  auto-DDL. A bounded SELECT-only startup transaction checks all four existing
  tables use InnoDB, required columns exist, and state_key has a single-column
  unique index. It does not create or repair a schema. Schema readiness does not
  prove link-key compatibility: the host must provide the exact existing key
  reference used by canonical WhatsApp phone/code indices.
- A configured canonical WhatsApp Concierge handler. Production invokes the
  existing `invokeConfiguredWhatsAppConcierge`, never a parallel engine. Configure
  the canonical handler before constructing the enabled runtime; revocation and
  binding are rechecked through the existing SQL/link interfaces.
- Explicit synchronous scheduler `set/clear` callbacks and a bounded HTTP
  `request` capability; no default fetch or production timer discovery. The
  caller owns startup and must call `dispose()` on shutdown. Disposal aborts
  engine/provider signals, clears scheduling, drains tracked work and releases
  lifecycle ownership, even if timer clearing reports an error. It is idempotent.

The production store and transport expose `dispatch` and `send`, respectively,
without `exercise*` methods. They share private transaction/request primitives
with the old synthetic surfaces. Production never calls the offline composition
or exercise entrypoints; the old release constant remains false. Receiver and
reply-validation cores have neutral names plus backwards-compatible test aliases.

## Ingress trust

`ingress.publicOrigin` is an explicit exact HTTPS origin; Host must match it.
Two modes exist:

- `direct-tls`: requires the actual Node socket's encrypted property.
- `trusted-boundary`: requires membership of the exact request object in an
  injected WeakSet. Only a trusted listener may mark it **after** validating the
  real ingress. The adapter for that listener is not invented here. No forwarded
  header, request property, public URL parameter or webhook payload grants
  membership. The factory does not accept a header-based verifyTls override.

Missing/unknown origin or boundary fails construction. A proxy request with only
`X-Forwarded-Proto:https` fails before body/SQL. Host matching alone is not ingress
attestation. An unknown real deployment remains blocked; the injected WeakSet is
not a claim that the actual hosting boundary has been verified.

## Quantity admission and uncertainty

`admission` requires explicit `id`, recipient phone allowlist (1–100 unique
entries), positive `maxAttempts` (at most 10,000), and a fixed `[validFrom,
validUntil)` window no longer than 24 hours. Nothing defaults to unlimited.
This is a **count of admitted conversations/attempt reservations**, not a monetary
cap, pricing estimate, credit balance, template approval or a guarantee of
exactly-once provider delivery.

The existing state table stores one row per sender/policy ID under the separate
`crewcheck-infobip-admission-v1:` namespace. It contains only a policy digest,
count, bound and expiry—not recipients, questions, replies or credential values.
Policy rows remain as durable audit/counter markers; no automatic quota-row purge
is introduced. Changing policy contents while reusing an ID fails closed.
Restart does not reset the count; a new ID represents a separate approval and
must not be auto-generated as a reset mechanism.

Before invoking Concierge, the store locks the existing link and held job, checks
scope/time/freshness/binding, and commits quota reservation plus a `preparing`
marker atomically. Only its preparation token may advance to `dispatching`.
Quota and marker rollback together; uncertain commit ACKs or crashes preserve a
non-retryable marker and consume the reservation conservatively. Engine failure,
revocation, expiry, timeout or a send that never starts does not refund it.
This prevents the quota-exhausted engine from being called too. Revocation and
freshness are rechecked after engine awaits and under the send lock. Existing
15-minute content expiry, eleven-day inbound identifiers and per-item report
receipts remain. Preparing content expires through the same maintenance path.

The HTTP implementation makes one injected request, forbids redirects, bounds
response bytes to 16 KiB and the whole operation to five seconds, and propagates
cancellation. 401/429/5xx, invalid responses, timeout or lost ACK become uncertain,
never automatic retries or provider fallback. The injected HTTP adapter is a
trusted dependency: it MUST honor the AbortSignal, reject redirects (including
not forwarding credentials), and perform no internal retries, fallback, replay
or deferred background submission. The wrapper invokes it once and bounds its
own wait; it cannot prove that a dishonest/noncompliant adapter stopped remote
work or did not retry internally. Real adapter implementation and compliance
must be reviewed before wiring. Cancellation cannot retract a message already
accepted remotely; uncertainty remains non-retryable. Independent
upstream/manual campaigns, templates, multipart charging, other apps, or account
charges are outside this quantity fence. No absolute financial ceiling is claimed.

## Validation and remaining activation gates

Synthetic raw/prepared tests exercise default OFF with dependency getters that
throw, missing policy/bindings/refs, no configured engine, bounded failed/stalled
credential resolution, SELECT-only failed schema/index/column readiness, forged
proxy headers and real request-object attestation, quota concurrency/recreation/
policy conflict/rollback/lost ACK, revocation, engine cancellation, shutdown and
scheduler-clear failure, response limits/timeout/status errors without retries.
The existing MySQL CI harness adds actual InnoDB production composition and quota
concurrency/recreation, then preserves quantity and preparing markers across an
actual server restart. Engine execution results must be reported separately.
No external model or provider call is used in those tests.

Before any real wiring or activation, obtain and separately review:

1. Supported browser/conector inventory of the exact account/profile/subscriptions,
   all shared consumers, sender, current URLs/renderers/batching/authentication.
   Browser inventory was unavailable in this task; none is asserted as verified.
2. Existing application pool/schema authority, correct key references and rotation
   rules, outbound API origin/sender ownership and credential resolution provider.
3. The actual trusted ingress/listener implementation and lifecycle/shutdown wiring.
4. Recipient allowlist, approval ID/window/count, cost authority and stop conditions.
5. Specific approval for profile authentication/URL changes, secrets, deployment and
   real messages. Those are not authorized by this code-only change.

Keep draft for independent review and exact-HEAD CI. No activation from this PR.

## P2 follow-up: actual canonical work must settle before completion

The original cancellation test used a cooperative callback. It did not prove the
actual canonical binding consumed the signal. A new counterexample executes the
exact function emitted by `scripts/v14410/apply.mjs` with a controlled snapshot
promise that ignores abort. Before the fix, `dispose()` completed before that
promise settled (`completedBeforeSettle=true`); the new assertion failed RED.
The same test runs the actual prepared server binding, not a replacement callback.

The binding now accepts the signal and checks it before/after snapshot resolution,
location resolution/save and dispatch to the existing reply builder. The core
reply promise remains tracked until actual settlement even when abort/timeout
wins the cancellation race. Shutdown cannot report completion or release lifecycle
ownership while that handler remains active. Owner-scoped revocation temporarily
blocks new Infobip engine invocations, aborts current ones and drains them before
performing its existing erasure callback and confirming completion. Quota remains
consumed conservatively; no late provider reply is permitted.

These are host-local completion fences, not forcible interruption of all legacy
capabilities or a distributed revocation proof. Work already executing inside the
legacy builder may ignore abort and continue **while shutdown/revocation is still
pending**. It is awaited, not detached. A five-second engine deadline requests
cancellation; it no longer promises five-second drain completion for a
noncooperative handler. If that handler never settles, completion remains pending
and admission stays closed; this is not reported as successful shutdown/erasure.
Already-issued I/O cannot be retracted or rolled back by an AbortSignal. The actual
host/capability implementations and any multi-process deployment still require
review before activation. No bounded real-provider cancellation is asserted here.

Tests cover noncooperative snapshot and builder waits, concurrent revoke and
shutdown, rejection of new owner invocations during revocation, no next canonical
phase after abort, no late outbound send and no untracked effect after confirmed
completion. Raw uses the real writer's exact binding; prepared additionally uses
its materialized server binding. Existing WhatsApp/Wellhub location behavior is
verified with no signal and with synthetic dependencies. The P2 remains open for
independent confirmation; this change does not resolve it automatically.
