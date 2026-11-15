# Contracting-intent preparation — HOLD

This follow-up belongs to Work's existing billing branch. It is not wired to platform routes, native billing, webhooks, RTDN, a queue, timer or provider. It performs no provider transport and grants no entitlement. No production migration, charge, cancellation, refund or release is included.

## Schema and privacy boundary

The current schema has one subscription row per email, but no durable contracting intent or separate outcome evidence. The additive proposal20261115_022 introduces two InnoDB tables without changing existing profile/subscription rows. Application startup never installs it.

The read-only compatibility check verifies columns, types/nullability, binary identifier collation, InnoDB and unique indexes. Missing schema or account uniqueness fails closed. There is one occupied slot per account; no lease expiry or automatic release/retry is implemented.

An account key and owner-incarnation digest prevent a recreated account from adopting or contracting around an old operation. The redaction helper requires the active canonical transaction client and the current profile lock; it clears raw email/public-ID links in the same transaction as deletion. Rollback restores both. Known-original-owner outcomes can subsequently be appended under the immutable operation lock without recreating a profile or granting access.

Hashes and provider references are pseudonymous financial evidence, not anonymous data. Retention, access, erasure policy and composition with the actual account-deletion route remain required before real use. This internal API is not an authentication boundary: future callers must use verified server identity/provider evidence, never client assertions.

## Transactions and admission

The single shared transaction implementation now:

- sorts profile locks as before;
- retries an action deadlock only after confirmed rollback;
- never retries an uncertain COMMIT;
- physically discards connections after failed rollback, commit uncertainty or fatal connection errors;
- never returns an uncertain connection to a pool, even when discard is missing or fails;
- restricts atomic cleanup to the active transaction client, excluding pools and escaped completed clients.

Reservation/claim reuse the existing profile/entitlement boundary. Competing requests converge on one operation; a committed claim admits one external effect. Transport must occur only after successful admission and outside the retryable transaction. An unknown provider/commit outcome stays blocked. This is not a claim of provider exactly-once behavior.

## Evidence and reconciliation

Created means a provider entity reference was recorded, not payment or activation. Outcomes retain operation/receipt IDs and hashes, not raw Google tokens or provider payloads. Google references are hashes. Duplicate receipts are idempotent; uncertainty does not overwrite a known reference or resolve a conflict.

Conflicting provider/reference evidence is retained with its provider and reconciliation_required state. It never replaces the original provider/reference, releases the slot or grants access. Both provider orders, including a conflict before the original result, preserve both outcomes. No cancellation, refund or entitlement policy is inferred from a hash.

Still held: authenticated ingestion for unknown/legacy operations, rejected-receipt quarantine, verified legacy backfill, provider-state freshness/order, conflict adjudication, cancellation coordination, privacy policy and schema rollout. The existing charging routes remain unchanged by this preparation. Do not describe it as live Asaas–Google synchronization.

## Validation and limits

The cached MySQL8.4 runner uses an owned temporary datadir/socket, no network or published ports, bounded resources and no production DSN. It refuses another owner's QA socket and cleans only labelled/owned resources. No image pull, provider call or production DDL occurs.

-26 real SQL cases pass raw and canonically prepared, including twelve concurrent reserves/claims, uncertainty, lost commit acknowledgement, rollback/discard, deletion/redaction, late evidence, account reincarnation, schema drift and both-provider conflicts.
- Real server restart preserves every intent/evidence row and prevents another admission.
- Existing canonical entitlement and Asaas inbox SQL fixtures pass unchanged in a separate disposable database.
- Cleanup fault tests, transaction-client capability tests,1200 differential entitlement cases, Web/Google confirmation and Asaas receipt/HTTP regressions pass raw/prepared.
- Canonical build and TypeScript pass; preparation preserves all new runtime/migration/test source hashes.
- Independent read-only reviews closed the rollback/late-owner issues in the bounded preparation and found no new blocker in the conflict delta. Reviewers did not execute tests. Exact-head CI is still required.

CI adds raw/prepared intent runs to the existing validation job. Mode0 skips only duplicate legacy replay because that job already executes those fixtures; it does not skip the new SQL tests. The earlier stock-image daemon startup failure, harness failures and unsafe rollback counterproof remain preserved privately. None is relabelled as a successful run.

## Test-only orchestration follow-up

A synthetic driver composes the actual reservation, admission and outcome primitives against the disposable MySQL database. Six scenarios pass: eight competing drivers produce one simulated effect; timeout after an effect blocks another call; interruption before transport stays blocked; a late receipt recovers a known operation; deletion during transport retains redacted evidence without profile resurrection; and lost receipt-COMMIT acknowledgement does not repeat the simulated effect. The runner then restarts MySQL and checks the complete combined evidence snapshot.

The driver instruments its caller transaction scope to assert simulated transport occurs outside a transaction. This is a test recipe, not a production dispatcher or proof of actual route/provider composition. No provider adapter, authenticated ingestion, migration rollout or entitlement grant is introduced. Operational HOLD and all privacy/reconciliation gates above remain. Remote HEAD and the blocked PR description are unchanged while this follow-up is local.

## Unknown-receipt boundary inspection

The existing Asaas HTTP wrapper now has additional synthetic regressions: authenticated unknown subscription remains quarantined; replay is idempotent; changed subscription under the same receipt ID conflicts without changing stored evidence; invalid token forms never read body/storage; no profile/subscription is created and no authentication secret enters receipt storage. This exercises the real wrapper/inbox with the existing memory SQL fixture, not provider authentication over a real network.

An independent local fault probe found the older inbox transaction helper calls release after discard when COMMIT and ROLLBACK both fail. This is a reproduced lifecycle gap, not proof that mysql2 reuses a destroyed connection. The new intent helper already uses the shared safe transaction boundary, but the older inbox does not. Reconciliation remains HOLD pending a scoped inbox transaction correction and fault/real-SQL regression review. Unknown Google/legacy ingestion still needs verified server-side correlation and explicit quarantine/retention design; a client purchase assertion must never be treated as that evidence.

## Inbox transaction correction

The older inbox now imports the single shared withTransaction helper instead of maintaining its own cleanup implementation. Commit uncertainty, failed rollback and fatal connection errors discard without pool release or automatic retry. An action deadlock may retry once only after confirmed rollback; inbox actions contain only transactional SQL. Eight dedicated fault modes cover success, action rollback, action deadlock, lost COMMIT acknowledgement, failed rollback and unavailable/failed discard. Existing commit-fault scenarios now require the explicit 503 uncertainty code while retaining their receipt/access assertions. The synthetic memory adapter exposes discard to model connection ownership. Both raw/prepared CI steps include the new fault suite; no route, migration or production configuration is added.

## Google ingestion reconciliation checkpoint

Private synthetic probes executed the actual raw platform saveGoogleSubscription and handleGoogleRtdn function bodies, injecting only database/provider dependencies. They reproduced two HOLD conditions: the current Google subscription upsert can replace an existing Asaas subscription for the same account; an authenticated, server-verified RTDN with no correlatable owner returns ignored without durable receipt storage. No real token, identity, provider or database was used. These probes are counterexamples, not passing safety gates or authenticated network tests. Prepared-runtime parity is not yet established for these probes.

Next bounded implementation must preserve the existing provider under the same account transaction, reject cross-provider replacement, and serialize both account and purchase-token ownership. Server-authenticated provider evidence and immutable account correlation must be separate from current client session assertions. An unknown receipt must not create an account, subscription, access or new contracting admission.

Durable unknown-Google quarantine is not implemented: storage schema, minimization/retention/access/erasure and verified legacy-token correlation must be reconciled before choosing a production ingestion contract. Raw tokens must not be stored merely to enable replay. A hash-only receipt cannot later query Google without another authorized source of the token. No automatic replay, provider cancellation or profile-based adoption is authorized by this checkpoint. These decisions block wiring; they do not justify enabling the existing unsafe overwrite. The next milestone is a reviewed transactional provider/token guard plus synthetic concurrent-account and cross-provider tests, followed separately by a reviewable quarantine contract.

## Transactional Google write candidate

Google writes now require current profile identity plus matching server-verified obfuscated account identity, use the shared profile/transaction boundary, and require transactional core tables and the existing unique purchase-token index. Raw tokens never enter the write module. Separate INSERT/UPDATE operations replace the unsafe upsert: a token bound to another account, another provider, a different existing Google token, an unconfirmed legacy identity or a recreated profile fails closed. RTDN no longer adopts a profile merely from an unlinked purchase public ID; known-token updates require current profile and verified owner evidence and existing-only mode. Unknown receipts are still ignored without durable quarantine; retention remains undecided.

The Asaas checkout persistence SQL is INSERT-only, preserving a concurrent existing Google or Asaas record instead of switching provider. A collision after external creation returns the existing uncertain result; it does not cancel/refund or retry the provider. This does NOT prevent duplicate external contracting: durable admission is not wired into checkout/native flows. Provider observation ordering, legacy-token migration, token replacement/cancellation policy, deletion-route composition and quarantine remain release blockers. A verified provider snapshot can still become stale before its transactional write; no ordering policy is claimed here. Google purchases lacking an obfuscated account ID and RTDN with missing expiry/order evidence now need reconciliation rather than automatic adoption.

Synthetic route tests exercise the actual save wrapper/RTDN with mocked authentication/provider dependencies. Owned MySQL tests cover provider preservation, eight-account same-token races, checkout INSERT composition, rollback between subscription/profile writes and physical discard after committed ACK loss. This is local preparation only, not live authenticated Google/Asaas validation or a release.

## Unwired admission coordinator

createBillingAdmission composes the existing durable reservation/claim/outcome primitives with injected trusted server identity and provider transports. No application route imports it and no real transport is configured. Request-supplied owner/token/adapter fields are excluded; server authority is checked before reservation, before claim and after committed admission. Transport occurs after the transaction and is never automatically retried. Revocation after admission retains the occupied slot. Invalid/throwing provider results become uncertainty with a fixed non-payload evidence hash; raw errors/tokens are not persisted or returned. Unknown receipt-COMMIT outcome throws a sanitized reconciliation-required error without inventing stored state or retrying an external effect. Created still means reference evidence, never entitlement.

Owned MySQL fixtures invoke this actual coordinator with simulated transports, covering denied/revoked authority, owner spoofing, committed-admission visibility on another connection, eight simultaneous callers, timeout, malformed evidence, schema absence, lost claim/receipt COMMIT acknowledgement, cross-provider competition and repeated Google calls. The final restart snapshot includes the coordinator's records. Authentication/provider verification are injected mocks; this is not proof of live authentication, native BillingFlow admission or production route integration.

Still required before wiring: verified server identity adapter, authenticated outcome correlation for asynchronous Google/native operations, schema rollout review, deletion-route composition, provider-specific idempotency/cancellation/order semantics, unknown receipt quarantine and privacy/retention policy. No retention period is selected here. A hash cannot recover a provider token for replay, and no raw token is stored. HOLD remains.

Admission review found a Google-reference array coercion in the initial candidate. A private synthetic counterproof preserved that failure. The successor requires string references for both providers and snapshots reference/hash fields once; SQL regressions cover an array reference becoming recorded uncertainty and mutable getters being read exactly once. Initial candidate evidence does not substitute for successor tests or review.

## Unwired asynchronous Google correlation

The synthetic-only adapter separates begin from complete. Begin uses the shared authenticated admission boundary and returns launch authorization only after committed claim; another begin never authorizes a second launch. Complete requires the original authenticated account, an existing admitted Google operation, a transient purchase token and trusted server-verification output matching owner, operation plan/catalog and token hash. Unknown, reserved, wrong-account, mismatched product/token or revoked-authority callbacks fail closed. A second current-profile lookup after verification rejects account recreation. Authentication identity fields and provider-verification fields are captured once; provider assertions from the request are ignored.

Repeated callbacks preserve one deterministic receipt; distinct verified token evidence for an already-bound operation becomes reconciliation_required without replacing the first reference or granting access. The token is used transiently by the injected verification mock and is never written to intent/evidence storage. This adapter is not imported by a real HTTP/native/RTDN route. The real server-auth/provider-verification contract, native launch delivery/lost-response semantics and asynchronous event authority remain integration gates; no live authentication or payment state is claimed.

The shared identity/admission helper is reused by the synchronous coordinator. Its post-claim revocation fixture retains the assertion that the row is dispatching and no effect occurred; its synthetic liveness counter was adjusted for the added pre-reservation check. Unknown-receipt durable quarantine, retention, access/erasure and legacy token correlation remain explicit decisions, with no policy or raw-token retention introduced.

Independent review of the isolated async candidate found no new blocking delta, but identified two material wiring limits: owner/token/operation consistency does not prove the purchase originated from that particular native launch, and duplicate complete calls currently repeat the injected provider verification before receipt deduplication. A real native/provider correlation contract and bounded verification/cost/freshness controls are therefore required. No provider operation-ID field, coverage, free quota or true launch-origin proof is assumed.

## Native launch contract and repeated verification

Official Android BillingFlowParams documents obfuscatedAccountId as an account identifier and obfuscatedProfileId as a profile identifier (both up to 64 characters, no cleartext PII): https://developer.android.com/reference/com/android/billingclient/api/BillingFlowParams.Builder . SubscriptionPurchaseV2 returns the corresponding externalAccountIdentifiers when supplied: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2#ExternalAccountIdentifiers . These facts do not establish a per-operation launch identifier. The existing Java bridge accepts only productId/accountId; no operation contract is wired. Do not silently repurpose the profile field or treat a client callback operation ID as Google-verified origin proof.

The proposed native boundary must carry a server-admitted operation, authenticated owner snapshot and catalog product in a versioned one-launch command, refuse legacy fallback when required correlation capability is absent, and distinguish restore from a new launch. Native delivery/lost response and the provider-verifiable link to that operation still need a confirmed adapter contract and device/build validation. This checkpoint documents the boundary; it does not implement a new Java bridge or claim launch-origin proof.

The isolated async service now deduplicates only in-flight completion work using a hash of owner/publicID/operation/token hash. Capacity must be supplied by trusted configuration; no production value, retention interval or timer is chosen. Capacity saturation fails before provider verification. Completion/failure removes the in-flight entry; raw tokens and results are not cached after the flight. Every caller rechecks its own authority/current profile. A fresh durable lookup inside the flight handles callbacks that observed dispatching just before an earlier commit.

Already-recorded matching token evidence returns referenceRecorded/duplicate without another provider lookup. This is existing correlation evidence, NOT current subscription/payment status or access. A reconciliation_required operation fails closed without another verification. These controls are process/factory-local and do not establish distributed quotas, sequential-failure rate limits, current-state freshness or cost guarantees. Real provider configuration remains off; quarantine/retention decisions remain blocked.

The flight-control review found a final-read revocation gap: a caller could be revoked while awaiting its last owned-operation lookup and still receive the result. A private probe using the actual async factory reproduced it. The successor snapshots that last result, checks the caller authority again and only then returns. A real-SQL fixture revokes authority during exactly the final operation lookup, requires the authority error and confirms the already-recorded evidence remains without granting access. The initial flight candidate remains a recorded failed review, not a release approval.

## Launch-origin adapter contract (isolated only)

Async completion now requires a separate trusted verifyLaunchBinding dependency before purchase verification or a durable duplicate response. It must supply independently verified operation/owner/token binding and an evidence hash; client echoes, account/profile-only observations, missing bindings and missing adapter configuration fail closed. The internal source tag is an adapter contract, NOT a Google API field or cryptographic proof by itself. A real implementation must establish that authority independently; none exists or is wired in this candidate. Positive tests use a separately declared synthetic native-observation ledger, not an echo of callback fields. Stored evidence combines the purchase and binding evidence hashes.

The existing Java bridge remains unchanged. Official account/profile identifiers do not by themselves prove a specific launch, and no confirmed per-operation provider binding or device test is available. This blocks real native integration. The isolated contract does not authorize substituting client assertions or repurposing a profile identifier. Native delivery/restart/replay and real provider correlation still require design/review and device/build evidence before wiring. Quarantine/retention remain undecided.

Origin-contract review found that a conflict could arrive during the launch-binding await after an initial created observation. A private actual-factory probe reproduced the stale duplicate response. The successor rereads and checks the owned operation after binding before the duplicate shortcut, with a post-read authority fence. A SQL fixture inserts conflicting token evidence during binding and requires failure without another provider lookup; it preserves both receipts and the reconciliation_required state. The final-read revocation fixture now targets the sixth operation read because of this additional authoritative lookup.

Cost-control scope clarification: capacity/deduplication bounds the injected purchase-verification flight. The launch-binding resolver runs before that flight and is not yet cost-bounded or deduplicated; its real backing source is unresolved. Synthetic bindings are local fixture lookups, not evidence of free production queries. A real binding adapter therefore requires its own quota/freshness/cost controls before wiring.
