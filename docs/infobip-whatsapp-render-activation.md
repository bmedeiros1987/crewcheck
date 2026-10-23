# CrewCierge WhatsApp on existing Render — prepared, OFF

This updates #1211 instead of adding a competing implementation/stack. The
approved scope is code, synthetic tests and a draft. It does not authorize
credential creation/configuration, account permissions, network changes, paid
calls, deployment or real messages. The public caller remains no-options/OFF.
Publishing this code alone does not make WhatsApp operational.

## Actual application path

The source preparer installs the application adapter (aliased to the existing
host name), configures the canonical WhatsApp Concierge, creates the existing
HTTP server via the native-construction helper, awaits host.start(thatServer),
and only then calls thatServer.listen with the existing port/callback. It
neither adds a port nor creates a proxy or TLS server. The OFF branch returns
before environment/reference/pool/signal reads. No environment variable alone
can enable the installed no-options caller. The old offline-only release flag
remains false and exercise APIs are never used by the application adapter.

A separately approved caller with enabled:true would execute the concrete
application adapter, not an exercise composition:

- Read CREWCHECK_INFOBIP_WHATSAPP_POLICY (JSON, version1) and compare the configured
  service ID with Render's RENDER_SERVICE_ID. These are trusted host/control-plane
  assertions, not cryptographic proof of hosting. Never use HTTP fields as service
  identity. The policy supplies ingress, configuration and admission; there are
  no implicit account/sender/recipient/quota defaults.
- Snapshot render-managed-hmac ingress with explicit trustModel
  render-edge-tls-private-http, HTTPS publicOrigin, serviceId and a nonempty subset
  of the three canonical callback paths. Require configuration.deploymentBinding
  renderServiceId/publicOrigin/callbackPaths to match. Preserve other required
  sender/API-origin/profile/subscription/key bindings and allowlists.
- Bind requests to that exact factory-created HTTP listener using their native
  socket's server identity, plus single exact Host, path, POST and JSON rules.
  No request WeakSet or forwarded header grants admission. Health reports
  transport:managed-http and proxyAuthenticated:false: this is deliberately NOT
  a claim of per-request TLS or proof that the edge forwarded a request.
- Require HMAC-SHA256 over the entire original body before JSON parse or any
  callback SQL/engine action. Header ambiguity, malformed schemas or missing
  signature fail closed; there is no Basic fallback. HMAC covers the body, not
  URL/headers or confidentiality. Existing durable item IDs, freshness,
  consent/link checks, quantity reservation and send locks still authorize replies.
- Acquire the existing native pool via dbPool() from server/v139/common.mjs,
  without DDL. Perform the existing SELECT-only schema/InnoDB/index preflight.
  Do not pass the platform SQL/result adapter or create a second pool.
- Use the bounded one-request Node HTTPS transport and explicit scheduler.
  SIGTERM/SIGINT close ingress, drain actual tracked work, and exit only after
  completion. The application owns this coordinator only while enabled; OFF
  installs no signal hooks. Shared pool ownership remains with the application.

The direct-TLS production/host mode and its private HTTPS-construction registry
remain separate and unchanged. The managed mode accepts the documented Render
edge-TLS/private-HTTP model; it does not invent a TLS listener or make a boolean
assertion that a plain HTTP connection was encrypted.

## Exact references understood by the concrete resolver

Only env:NAME references below are resolved; values are never logged/returned.
All four references must be distinct. No values or references were provisioned
on the real host during this task.

| Purpose | Permitted reference names | Required verification/action later |
| --- | --- | --- |
| apiKey | INFOBIP_API_KEY or CREWCHECK_INFOBIP_WHATSAPP_API_KEY | Explicitly choose a key authorized for this WhatsApp sender; no automatic reuse of Voice credentials |
| encryptionKey | CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY | Canonical base64 for 32 bytes, dedicated queue-content encryption |
| linkHashKey | CREWCHECK_WHATSAPP_AUDIT_SALT, CREWCHECK_DATA_ENCRYPTION_KEY, CREWCHECK_AUTH_SECRET or META_APP_SECRET | Must match the currently effective canonical audit/link key; the existing WhatsApp module checks equality without returning the key; never generate a replacement to bypass it |
| webhookSecret | CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET | Literal UTF-8 shared with the selected Infobip HMAC setting; no trimming or hex/base64 reinterpretation |

The resolver rejects a wrong purpose/name, invalid content key and incompatible
link key. Synthetic tests inject an isolated environment/process/pool and link-key
checker; default enabled production uses the existing canonical key checker and
native pool. OFF never calls them. No real environment values were inspected.

## Activation checklist — not executed

1. Confirm the custom-domain/TLS attachment to the intended Render service and
   accept the documented trusted Render/private-HTTP boundary. Inventory and
   approve any same-workspace/regional peers or actual environment isolation.
   Host/service strings are bindings against configuration errors, not peer
   authentication. No network permission/isolation change is included here.
2. Confirm all consumers of the exact Infobip profile/authentication setting and
   its renderer/batching/ACK behavior. Current prior inventory was unsigned and
   included unsupported event categories. Obtain specific approval before binding
   HMAC or restricting it to DELIVERY, SEEN and INBOUND_MESSAGE. Preserve Voice.
3. Authorize/check the four reference mappings above through secure host/provider
   administration, without putting values in chat/repository. Confirm API sender
   scope and canonical link-key compatibility; provision missing content/HMAC
   keys only after separate approval. No arbitrary password/key fallback exists.
4. Authorize the SELECT-only real schema readiness check. If schema is missing,
   stop and review a separate migration; this code never creates/repairs tables.
5. Set an approved recipient allowlist, quantity, fixed <=24h window and durable
   policy ID in the policy. Do not invent/reset IDs to replenish quota. Quantity
   reservations are not an absolute financial ceiling.
6. Independently review code/CI, then separately authorize the explicit enabled
   caller/release and deployment. Keep no-options OFF until that point. Confirm
   runtime readiness; TCP health or a generic /api/health alone is insufficient.
7. Separately authorize a real message/test with recipient/count/cost/stop
   conditions. Receiving a valid recent allowed inbound can cause an outbound
   reply once enabled; activation is not a cost-free read-only operation.

Render rolling deploys can overlap processes even with one configured instance.
The existing preparing/quota transaction now also records an active engine fence
in the same ledger row, before invoking the canonical handler. Cleanup clears it
only after the actual handler settles, including on abort/timeout. Authenticated
unlink/account deletion checks this durable fence even on an OFF host with no
installed lifecycle owner. A live or unknown remote invocation prevents successful
completion of erasure/revocation. Unlink blocks new admissions through the existing
revoked link first and returns 503/pending if quiescence cannot be confirmed;
account deletion rolls back instead of claiming completion. Provider submission
continues to hold the existing link/state locks. Dedupe and quantity stay durable.

This is a completion fence, not forced interruption: legacy work already started
can produce effects before revocation completes. Local shutdown still waits for
the actual handler, and Render may kill it. A crash, lost preparation ACK or failed
cleanup leaves the fence pending across restart, without an automatic TTL or
quota refund. Maintenance expires content but retains the opaque active fence.
Legacy preparing rows without a known completion marker conservatively block
erasure. Recovery must first prove every possible old invocation is gone and
review a separate scoped repair; no automated unlock/repair endpoint exists here.
All processes handling account mutation must run this revision before activation.
These operational checks remain an activation gate, not permission to retry
uncertain work or treat a pending response as completed revocation.

### Isolated storage preflight

`preflightInfobipWhatsAppStorage(existingAuthorizedPool)` from
`server/infobip-whatsapp-preflight.mjs` is independently importable. It takes an
already authorized native MySQL pool and executes only the three fixed
information_schema SELECTs for tables, engines, columns and unique state key.
It uses bounded transactions, resolves no credentials/environment/pool, reads no
user rows, creates no tables, installs no lifecycle/scheduler and enables no
factory. Production calls the same function. Invoke it only through existing
approved host access; lack of a MySQL connector is not permission to obtain new
access or credentials. Missing schema stops the preflight; migration is separate.

## Evidence and limits

The prepared E2E executes the actual server.mjs HTTP callback, concrete application
policy/reference/pool adapter, actual canonical configure callback, prepared
reply wrapper/core and real shared help/menu producer. It uses a synthetic linked
owner/consent and snapshot/semantic/storage capabilities; it is not a real model
or full application boot against real accounts. HTTP uses owned loopback only,
and outgoing replies use a fake transport. It verifies a canonical reply,
invalid-signature-before-parse/SQL, valid-signature malformed JSON, wrong host,
path, service, listener and key mappings, missing/revoked consent, quantity fence,
nine-day retry ACK without a new reply, DLR/SEEN without Concierge, manual shutdown
and the concrete SIGTERM coordinator waiting for noncooperative work. Raw mode
also tests the same concrete application adapter with synthetic engine output.
The dedicated workflow runs raw and prepared E2E on the exact PR head SHA.

Primary architecture sources:
- https://render.com/docs/web-services (edge TLS termination, HTTP backend)
- https://render.com/docs/private-network (workspace/region and primary-port access)
- https://render.com/docs/projects#blocking-cross-environment-traffic
- https://render.com/docs/deploys#graceful-shutdown
- https://www.infobip.com/docs/subscriptions/subscription-components (raw-body HMAC)

No real profile, credential, permission, database content, infrastructure, network
rule or recipient was changed. Inbound TEXT replies remain distinct from proactive
gate/finance/other notifications; this change does not connect those producers.
