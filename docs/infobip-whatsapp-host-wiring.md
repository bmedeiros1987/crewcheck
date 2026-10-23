# Infobip host bootstrap — OFF

This follow-up starts from main 2bc6e354 (production composition #1209).
Open PRs and active tasks were checked before editing: the existing CrewCierge
classification work and restricted WhatsApp/PDF integration remain separate.
No competing Infobip host-wiring implementation was found. No AGENTS.md exists
in this checkout. No configuration, credential, database or live provider was
accessed or changed by this code.

## Installed bootstrap

The canonical preparer installs one `createInfobipWhatsAppHost()` with **no
options** and awaits `start()` after configuring the canonical Concierge and
before creating the HTTP listener. The pure composer is separately testable;
repeated preparation preserves the binding and has no duplicate startup.
The default host returns the held runtime before reading dependency getters.
No environment switch activates it. Importing modules creates no pool, HTTP
request, scheduler or credential lookup. Existing callback paths still return
503 without consuming body/authentication while OFF.

The optional explicit host interface requires all of:

- `enabled:true`, a native `listener instanceof https.Server`, and
  `ingress:{mode:'direct-tls',publicOrigin}`. This host adapter
  deliberately rejects `trusted-boundary`: it cannot validate the real proxy.
  The listener type is checked before dependency loading; a plain HTTP server
  or a forged object fails. The host must supply its actual serving listener,
  not an unrelated TLS object. This type check is necessary but is not proof
  of certificate health, route attachment or public deployment binding.
  Every enabled callback still requires its actual socket to be encrypted and
  its Host to match. No forwarded header grants trust and no WeakSet is created.
- `lifecycle.registerShutdown(dispose)` must register with the **actual host
  shutdown coordinator** and return an unregister function. This is a trusted
  host capability, not proof that a real SIGTERM coordinator is installed.
  The public OFF call installs no process signal handlers or shutdown owner.
  Coordinator policy must stop ingress, await dispose, then release shared
  resources and terminate. A generic Infobip module must not terminate the
  whole application or close a pool owned by other features.
- Async `load()` returning configuration, credential resolver, admission and
  `getPool()`. The pool supplier must return the existing native mysql2 pool,
  never the platform SQL/result adapter. `dbPool()` in server/v139/common.mjs
  is the existing compatible provider; no DDL is added to its acquisition.
  This follow-up does not connect it to an enabled caller or read its env.
- All production-factory gates still apply: exact origin/sender allowlists,
  four distinct opaque credential references, matching deployment assertions,
  canonical engine, SELECT-only schema readiness and durable quantity policy.
  Missing dependencies fail closed with sanitized errors, without retrying
  startup. Concurrent starts share one initialization. Shutdown during load,
  pool acquisition or preflight waits for initialization and drains any runtime
  it created; route/dispatch admission closes immediately.

Default enabled-host capabilities are a 10-second Node interval and a concrete
one-request Node HTTPS adapter (`agent:false`, explicit POST/redirect:error,
AbortSignal, no proxy discovery/retry/fallback/background queue). The existing
transport bounds headers-to-body completion at five seconds and body at16KiB.
The adapter destroys error/redirect bodies instead of following Location.
Trusted injected request/scheduler capabilities are supported for fixtures;
compliance of a replacement is the responsibility of its reviewed host owner.
No real endpoint was called. Loopback tests map a synthetic HTTPS address to an
owned HTTP server: they prove native request/abort/body behavior, **not** real TLS
certificate validation, provider compatibility or proxy authenticity.

## Remaining real-host gates

The read-only service metadata confirms Node with a plain HTTP/TCP listener and
startup directly via `node server.mjs`, not the repository npm-start wrapper.
Build preparation therefore must materialize the bootstrap. It does not show
an authenticated TLS boundary inside Node. The deployed listener cannot satisfy
this adapter's direct-tls/native-HTTPS-listener requirement; **activation remains blocked**. Adding
`X-Forwarded-Proto` or filling a WeakSet indiscriminately is not a remedy.
A reviewed provenance mechanism/host architecture is required before an enabled
caller can be installed. No new infrastructure or permission was created.

Also still required, without reading values into logs/chat/repository:

1. Confirm the real schema/indexes with an authorized SELECT-only preflight,
   existing native pool ownership, process topology and real shutdown owner.
   No real SQL was executed here. Synthetic InnoDB/restart CI is separate.
2. Map API credential, content-encryption key, **existing canonical audit/link
   index key**, and HMAC secret to distinct opaque references. Resolve only in
   the approved host. No references were provisioned or persisted here. The
   index key must match auditSecret()'s currently effective canonical source;
   selecting a new random key would break existing link/code correlation.
3. Confirm exact sender/API origin/account, profile consumers, event renderers,
   batching and ACK/retry settings. The prior private browser inventory remains
   the evidence; there was no repeated browser inspection in this follow-up.
   Shared consumers are not fully established. No profile/event change here.
4. Obtain separate approval for missing credential provisioning, authentication
   or subscription changes, deployment/activation, recipient allowlist, quantity,
   time window, cost authority, stop conditions and any real test message.
   Admission reservations count attempts; they are not an absolute money cap.

This wiring is for correlated inbound TEXT replies through the canonical
Concierge. It does not connect proactive gate/finance/other notification
producers, activate a language model, grant consent, create a phone link, or
make all alerts operational. Those need their own producer and admission review.

## Validation

Raw/prepared host tests use synthetic configuration/SQL and controlled lifecycle
capabilities. They cover default OFF without dependency reads, canonical startup
order/idempotence, absent/forged ingress, missing pool/coordinator, concurrent
start/stop, shutdown during asynchronous phases and noncooperative Concierge
work, no late send, and exact loopback request behavior. Native adapter tests
cover redirect rejection, abort during body, pre-abort, oversize body, lost ACK
and timeout with one attempt and zero external calls. Existing canonical
lifecycle, HMAC, persistence, production, runtime, and Wellhub behavior remain
part of verification. Independent review and exact-HEAD CI remain required.
