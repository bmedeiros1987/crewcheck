# Existing mobile journal composition — inactive candidate

PR929 is already merged. No equivalent open release/journal PR was present in the
55-PR inventory. This continuation reuses its planned Python controller/transport,
existing HTTP receiver, platform MySQL pool/adapter, same state table, Play edit
reader and protected commit adapter. It creates no pipeline, service, account,
credential, SQL schema or live writer. Main platform composition remains the
probe-only literal OFF implementation. Workflow permissions, probe if:false,
publication refusal and legacy shared-package writer guards are unchanged.

## Concrete gaps closed in this candidate

The HTTP receiver previously could not accept commit, and transition admission
assumed one SQL mutation per frame. A service-owned commit needs pending and a
separate outcome transaction. Commit is now an explicit independently approved
operation; neither pending nor acknowledged is a caller operation. Each phase has
a digest-derived ID. Completion requires the exact earlier pending admission,
frame digest, generation, plan, staged data and revision. Ledger and journal writes
commit together. Replay/stale CAS cannot call Play twice. The same protected
commit adapter checks the original edit, remote AAB hash, retained/non-target tracks
and independent review/coordination before its only commit callback. Deferred
review plus ERROR_IF_IN_REVIEW has no fallback. Unknown commit responses remain
reconciliation_required; lost SQL acknowledgement leaves durable pending and no
Store callback. Approval/proof expiry or revocation after pending cannot commit.

mobile-composition.mjs connects these existing pieces with server-owned providers.
Freshness closures are per request/transition and rechecked after authority locks
and readbacks. A different runner cannot refresh a waiting request's proof. It
requires a sealed independent coordination provider, complete inventory and clear
review/other-edit state; all phone/legacy/Wear/Console writers must be fenced. A
boolean in a frame is not authority. Each proof binds plan/edit/observation and the
immutable original inventory digest. Artifact validation must independently verify
consumed bytes/manifests/signers, not archived positive flags. A consumed-byte
verifier is still an explicit trusted dependency; this patch does not pretend the
server can read a runner's files. Non-target tracks and previous phone codes are
preserved. Wear uses the same reservation key, but cannot use this mobile commit
path. WatchFace is a separate package, not a shared-package version floor.

The Python ReviewedHttpJournalExchange now bridges the existing planned transport
to the fixed existing HTTPS endpoint with an injected ephemeral OIDC issuer and
HTTP adapter. It defaults OFF, has no executable CLI/env enable path, refuses
redirects, retries, foreign bindings/operations and duplicate IDs. Any response
uncertainty permanently blocks that instance. It issues no Play requests. Actual
PlannedJournalTransport still validates the exact response record/revision. There
is no automatic restoration, second edit, deletion, takeover or rollover.

Store/proof/artifact reads are bounded; the Store adapter receives AbortSignal,
redirect:error and retries:0. A timeout cannot prove cancellation of a remote
effect. A commit can finish after timeout; pending/uncertain state stays fenced.
A complete post-commit provider must be independently implemented/verified; a
404 of the original edit cannot be replaced by a guessed new edit or bounded
20-release listing. Only a complete matching proof permits reconciliation.

## Required activation batch — proposal only, NOT applied

No activation approval is requested until exact SHA review/CI, existing deployment
bindings, authoritative complete inventory/review/edit coordination and all-writer
fencing are evidenced. The current Console observation is insufficient: reported
79 shared-package versions but late pages returned no rows, 13 pending changes,
production rejection/not-sent releases and preexisting drafts remain. No code is
reserved or proposed here. Device target Galaxy Watch4 does not alter that gate.

1. **Existing destination/access.** Use the current platform pool in Render service
   srv-d8de30sm0tmc73drgvig and crewcheck_telegram_state. Do not expose a DB socket or
   copy a connection string to GitHub. Verify schema/primary durability, grants,
   retention/backup and external writers using existing authorized access. No new
   DB credential or grant is required by this code. Store/artifact/coordination
   provider bindings must exist in the reviewed executor; none is configured here.
   If a Store credential would gain a new destination, that explicit access decision
   must be included in activation approval, never inferred from its existence in CI.
2. **Exact OIDC change.** In .github/workflows/mobile-only-internal.yml, only
   jobs.reviewed-mobile.permissions.id-token changes none -> write. prepare-journal-plan
   stays none; root permissions stay contents/actions read. Revalidate protected
   environment safety/manual-play-publication-gates - crewcheck PR #861, environment
   ID23059484724/node EN_kwDOSsPci88AAAAFXnPQNA, main-only rule, owner review, no admin
   bypass. Issuer is https://token.actions.githubusercontent.com with fixed public
   JWKS, RS256, audience crewcheck:release-journal:com.crewcheck.app, exact repo and
   owner IDs1254349963/214496369, refs/heads/main and workflow_dispatch. Tokens last
   at most300s. No reusable-workflow identity is accepted; no token is persisted.
3. **First bounded probe.** After separately reviewed activation code is deployed,
   Render owner enrolls the actual reviewed code/workflow SHAs in public setting
   CREWCHECK_RELEASE_APPROVAL_ENROLLMENT with protectedJobName reviewed-mobile,
   exact environment node and operations:['probe']. Supply the explicit reviewed
   Render/process/private-peer trust boundary; forwarded headers cannot establish
   it. Enable only the existing reviewed probe step and literal probe receiver for
   one manually approved run. Keep publish false and first-step publication refusal.
   The existing prepare_journal_approval.py generates the full plan/artifact/hash
   comment; approve that exact generated document, not a short code or pasted flag.
4. **Three probe writes.** Only approval, revocation and admission records under
   play-release-{approval,revocation,admission}:com.crewcheck.app:<run>:<attempt>, in
   one existing-table transaction. Data is plan/source/controller/run/attempt/actor,
   operations/time and approver proof digests. No bearer, DB secret, personal PDF,
   profile/roster/financial data or Store payload. Probe does NOT create/advance
   play-release-journal:com.crewcheck.app, reserve a version or open an edit.
5. **Mobile lifecycle remains separately scoped.** Probe approval cannot become
   MOBILE_OPERATIONS enrollment. That fixed scope excludes rollover and Wear/joint
   commit. Only after proof/providers and all writers are ready may an activation
   review replace the source's OFF composition and supply server-owned callbacks,
   then wire ReviewedHttpJournalExchange into the existing trusted planned CLI path.
   The executable CLI/workflow refusal must remain until that whole activation is
   reviewed. No setting/body flag can perform it. Consume immutable validated phone
   bytes; no rebuild during publication. Never publish Wear/Face in a phone action.

## Revocation and rollback

Cancellation, rejection or expiry denies admission and preserves receipts; a rejected
run needs a new run/approval, not a rerun to erase denial. Revocation is monotonic.
A pending/in-flight Store effect cannot be undone by revoking authority. Stop the
job, preserve original edit/run/artifact/journal and reconcile independently; do not
retry, reset records, delete rows, lower generation/high-water or create replacement
edits. Return receiver/probe to OFF and id-token to none under approved rollback;
remove future enrollment if approved, without clearing durable evidence. These
settings changes are NOT performed by this patch. No production or paid service.

## Tests and exact limits

23 new controlled SQL cases use actual receiver, RSA/JWT, GitHub-shaped proof,
platform adapter and fictional Store responses. The same file runs on existing
isolated MySQL8.4 CI socket raw/prepared (no new container/service). Python bridge
checks actual planned transport with synthetic HTTP envelopes. Existing OIDC,
GitHub proof, probe three-row, lifecycle, Python CLI, SQL crash/recovery and manual
OFF guards remain intact. CI MySQL proof is pending until the exact candidate run
finishes. Store/signers/coordination providers remain fictional in tests; no physical
Galaxy Watch4, Crewtopia, real permission, API edit or production DB is exercised.
