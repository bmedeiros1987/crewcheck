# Probe-only composition, still OFF

This continues the implementation merged in PR1028 at `ea3a5f3b7585bb6ed79392798ef18a30f486c4ae`. No matching open journal-composition PR was found in the read-only ownership inventory. PR1031, PR1032 and PR989 are not part of this delta. No second receiver, registrar, table, service or transport stack is introduced.

`server/platform.mjs` now uses `createProbeOnlyReleaseHandler`. The composition reuses the existing receiver, fixed public GitHub evidence provider and platform pool. It always supplies `enabled:false` and `allowedOperations:['probe']`. An environment flag or caller option cannot enable it. The receiver copies the operation scope and checks it before independent GitHub evidence or DB access, including when the upstream run is revoked.

## Public enrollment validation

`CREWCHECK_RELEASE_APPROVAL_ENROLLMENT` is a proposed owner-controlled public JSON setting, not a secret. This change only reads it; no setting is created or changed. Missing or invalid data leaves the receiver OFF and does not prevent unrelated app startup.

The exact policy keys are `reviewedCodeSha`, `reviewedWorkflowSha`, `environmentNodeId`, `protectedJobName`, and `operations`. Both SHAs must be lowercase 40-character commit IDs. Code SHA must match provider-owned `RENDER_GIT_COMMIT`; service ID, repository and external origin must match the existing CrewCheck service. The environment node ID stays `EN_kwDOSsPci88AAAAFXnPQNA`, job stays `reviewed-mobile`, and operations must be exactly `['probe']`.

Do not embed a commit's own future hash in its source. After a separately reviewed activation commit is merged and deployed, its actual reviewed code/workflow hashes can be enrolled through the existing service's owner-controlled setting. Job inputs, request bodies and guessed environment names are not enrollment. `prepare_journal_approval.py` already requires reviewed source SHA to equal the actual workflow run's `GITHUB_SHA` and generates probe-only approval documents.

## Render trust boundary, not a TLS attestation

Render terminates public HTTPS at its load balancer and forwards HTTP to Node. The backend socket cannot prove the original client's external TLS. Same-workspace/same-region peers can reach the primary port. This composition makes no cryptographic ingress claim, socket seal, proxy-IP guess, or header-based authentication.

`createRenderTrustBoundaryVerifier` checks an explicit server-code policy accepting Render infrastructure, the reviewed Node process and authorized administrators, and authorized private-network peers as trusted. It is an administrative boundary acceptance, not proof about a request. No policy is supplied by the deployed composition, so its default is false; the receiver separately remains literally OFF. A future activation must explicitly accept this boundary in reviewed code. HTTP fields, forwarded headers and environment flags cannot supply it.

The existing GitHub probe client uses the exact HTTPS endpoint `https://crewcheck.onrender.com/api/platform/release-journal`, standard certificate verification and `NoRedirect`; redirected responses are rejected. TLS protection is established by the client and trusted Render infrastructure. Server authorization still requires independently verified JWT identity/claims and public GitHub approval evidence before any DB access. A request over private HTTP is not distinguishable through a fabricated public-TLS proof; authorized peers are trusted, and headers alone never authorize a request.

References: https://render.com/docs/web-services and https://render.com/docs/private-network

## Exactly three authority rows in a future successful probe

All three are in the existing `crewcheck_telegram_state` table. They are release authorization records, not profile, roster, consent or notification user data:

- `play-release-approval:com.crewcheck.app:<run>:<attempt>`: immutable reviewed approval, sealed GitHub approver provenance and approval digest. Contains code/workflow/run/attempt/actor/plan/operations/times; no DB secret, bearer token, personal document or Store payload.
- `play-release-revocation:com.crewcheck.app:<run>:<attempt>`: approval digest, revision and monotonic revoked flag.
- `play-release-admission:com.crewcheck.app:<run>:<attempt>`: approval digest, revision and operation ledger. A probe does not append a journal-transition admission.

Registration inserts these rows in one transaction only after the existing independent provider seals approval. A repeated registration must match immutable evidence. A duplicate valid probe returns 200 idempotently without extra authority rows or a release journal. `retryAllowed:false` is client policy, not server single-use enforcement. The future approval covers one authorized execution of this idempotent probe; no artificial single-use ledger is added. Failure before COMMIT rolls back partial authority inserts and preserves unrelated rows. If COMMIT succeeds but its response is lost, committed records remain and the request is denied as uncertain; there is no automatic retry or success projection. Expiry rejects authorization without TTL deletion or renewal. Cancellation/rejection may update only the revocation authority row and deny the probe. The operation scope rejects `observe` and all journal-transition operations before DB access; probe-only does not grant recovery, reserve, stage, reconciliation or Store authority.

The future probe checks existing schema/connection and never creates or advances `play-release-journal:com.crewcheck.app`, allocates a version, opens an edit, sends a message, or publishes. New DB grants or credentials are unnecessary for this trusted-process pilot under the reviewed existing administrative-account assumption. The exact authority-row writes still need to be included in the activation approval; they are not covered by claiming the probe is entirely read-only.

## One future activation decision, after this candidate is ready

Review these as one bounded batch, not repeated blanket access requests:

1. Review and explicitly accept the Render infrastructure/process/authorized-peer boundary and exact HTTPS/no-redirect client contract. No public-TLS attestor is required or claimed.
2. Revalidate the existing full protected environment, node/ID, main-only rule, reviewer and no admin bypass. Issue/validate a real short-lived JWT in the exact reviewed job; inspect required identity/claim shape only in sanitized memory, never log or persist the token. Missing required claims stop the pilot. Pin the exact provider plan, artifact ID/digest and reviewer provenance along with the environment and actual code/workflow SHAs.
3. Approve the exact public enrollment values/destination for the actual activation code/workflow SHAs.
4. Change `id-token:none` to `write` only on `reviewed-mobile`; prepare job stays `none`. Enable only the existing reviewed probe step after manual environment review. Keep publication input false and the first-step publication refusal.
5. Enable only this composed probe receiver after the other conditions are met. Authorize the three authority rows and a single bounded probe; no new accounts, grants, secrets, Store callbacks, user-data writes or migrations.

None of those changes is performed here. The previously denied live empty OFF POST remains on hold: no retry or alternate production path. Any future confirmation of that endpoint is a separate explicit single-request decision, not implicit permission for the authenticated probe.

## WatchFace tests only

`test_independent_package_scope.py` now executes the arguments from the actual checked-in allocator/publisher workflow commands in a temporary fixture. The existing generic manual flag and mixed policy must still refuse before a credential/client call. Gradle's real WatchFace application ID is checked against the selector; it is distinct from the namespace and from the shared phone/Wear package. Existing fake-client explicit-selection cases are retained; namespace-confused/shared-package and corrupted reports reject before credentials. No workflow command, package input/default, permission or publication behavior is changed.
