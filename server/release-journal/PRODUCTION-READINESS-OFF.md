# Production readiness continuation — inactive

Stack base: PR1082 / 70a995f4e25646912ba42b6e46bf2331b506beb5. No active
release-editor task was found in the local task inventory. Existing Android phone
and Wear tasks are idle; their native files are untouched. PR1082 remains the
single journal composition; this patch adds executor inputs beside it, not another
receiver or publisher. Parent retains external owner coordination. This is not a
replacement for exact composition review against current main before integration.

## Implemented and independently testable

`consumed_artifact_verifier.py` wraps the existing `artifact_consumer.consume` and
`consumed_validation.validate_consumed`. It pins the expected upload certificate
from the trusted host independently of archive metadata, before invoking tools.
Absolute existing tool files are required. Existing bundletool/jarsigner/keytool/
apkanalyzer/apksigner inspect the extracted exact bytes; their existing validator
checks manifests/signatures and checks bytes again after tools. The result includes
the same consumed bytes and intent for a future trusted executor, never publication
authority. No rebuild, credential loader, executable CLI or new service.

`production_readiness_off.mjs` provides a fixed-repository GET-only source reader.
It requires a merged exact-source PR, unchanged main, independent exact-head
GitHub approval and current successful required main workflows. Paginated reviews
and workflow inventories must complete within a fixed bound. Latest run attempts
win. Responses are not an auth token. The per-instance sealed receipt expires in
30 seconds and cannot be reconstructed from JSON. This read is a preflight snapshot,
not a transaction with GitHub: cancellation/review changes after it require fresh
checks by the eventual commit authority, which remains absent.

The production proposal preserves all existing production version codes and hashes
non-target tracks. It rejects uncertain inventory/review/edit state, an unfinished
existing rollout, foreign source, Wear artifact and code at/below observed floor.
It never guesses which old code is Wear or drops a code. `retainedMobileCodes` is
only a cross-check, not permission to delete other codes. Manifest compatibility,
targeting and an acceptable retained-code policy still need live complete evidence.
All results explicitly say `storeMutationAllowed:false`. The caller cannot use this
proposal with the existing internal-only journal protocol: production transition
support is deliberately absent and must be reviewed as a separate delta.

## Concrete limits and missing authority

No real Store response, archive, signing key or reviewer account was exercised.
Tests use synthetic archives and controlled command results. GitHub request is a
trusted host adapter (fixed origin/GET/no redirects/no retries); no credentials are
created or loaded here. Required workflows come from reviewed host policy, not the
webhook or release-request body. No sender/push/voice/Watch feature is activated.

The all-writer coordination provider is still blocked on authoritative fencing of
`mobile_internal.py`, `allocate_versions.py`, `publish.py`, `crewwatch_internal.py`
and Console. This patch does not replace missing authority with true flags. The
API reader cannot prove absence of another Console edit or pending review, and
GETs in an existing edit do not establish complete postcommit state. These are
explicit remaining providers, not implemented as fictional production evidence.

## Minimum activation decision — not performed

Existing destination: Render service `srv-d8de30sm0tmc73drgvig`, existing platform
pool/table `crewcheck_telegram_state`; do not copy DB credentials to GitHub. Real
schema/grants/durability and all-writer ownership still require read-only evidence.

1. Workflow `.github/workflows/mobile-only-internal.yml`, job `reviewed-mobile`:
   approve only `id-token:none -> write`. Root and prepare-job permissions stay
   read/none. No other grant or credential is proposed. OIDC issuer is
   `https://token.actions.githubusercontent.com`, audience
   `crewcheck:release-journal:com.crewcheck.app`, RS256/JWKS, max lifetime300s,
   exact repository/owner IDs1254349963/214496369, `refs/heads/main`, manual event,
   exact reviewed workflow SHA and code SHA, no reusable-workflow impersonation.
2. Revalidate protected environment
   `safety/manual-play-publication-gates - crewcheck PR #861`, node
   `EN_kwDOSsPci88AAAAFXnPQNA`, main-only reviewer/no bypass. Approve the exact
   immutable run/attempt/artifact/plan, not a generic flag.
3. Accept the documented Render/process/authorized-private-peer trust boundary.
   After reviewed activation deployment, enroll exact actual code/workflow SHAs in
   `CREWCHECK_RELEASE_APPROVAL_ENROLLMENT`, probe-only scope first. That bounded
   probe writes only three approval/revocation/admission authority rows; it does
   not allocate a version, open a Store edit or authorize mobile lifecycle.
4. A later lifecycle activation needs real all-writer/Store/artifact bindings,
   reviewed production transitions and review-submission behavior, durable pending
   receipt before commit, complete independent reconciliation, no blind retries
   or replacement edits. Existing internal-only gates/refusal remain until then.

Production publication intent has user approval; the security-sensitive OIDC and
enrollment change is specifically still pending. Approval of production alone does
not fabricate the missing providers. No activation request should be issued until
the code/proofs required for its exact scope are ready. Store submission, Google
review, production rollout and installed update remain four distinct outcomes.
