# Inactive consumed-artifact validation and acknowledged reconciliation

This continuation builds on merged PR929. It creates no executor entrypoint,
connection, resource, credential, permission, dispatch or store operation.

`consumed_validation.validate_consumed` takes independently reviewed archive
identity and explicit paths to already installed validation tools. It consumes
only the verified phone APK/AAB bytes, materializes them in a temporary directory,
runs bundletool, manifest validation, jarsigner/keytool and apkanalyzer/apksigner,
rechecks unchanged bytes, and removes temporary files on success or failure.
Archived manifests and certificates alone cannot pass this validator. Its result
contains the existing journal's immutable release intent fields, but always sets
storeMutationAllowed=false and reservationAllowed=false. The version is still
policy-only; this is not live allocation or eligibility evidence. The injected
runner is a trusted executor seam, not a flag in the artifact. CI tests instrument
commands and synthetic bytes; they do not claim real fixture APK/AAB tool execution.

`reconcileAcknowledged` connects a trusted injected complete-state reader with
journal read, exact owner/revision CAS and durable readback. It accepts only an
already acknowledged commit. It requires full inventory, no pending review,
unfinished release or unresolved edit, the staged edit/package identity, exact
expected target snapshot digest and unchanged other-track snapshot digest. The
observation digest becomes reconciliationSha256 in the durable intent. Failed
reads, malformed state, 404, changed tracks, lost SQL acknowledgement and stale
replay fail closed. Reconciled still remains reserved; availability is unknown;
no rollover, unlock, retry or replacement edit is provided. An unknown/lost Play
commit acknowledgement cannot use this path even if bounded listings look good.
No Play reader adapter is implemented or configured.

Tests cover byte mutation, wrong manifests/signers, temp cleanup, blocking review,
HTTP ambiguity, incomplete inventory, altered target/other tracks, stale
owner/revision, missing proof, replay and SQL acknowledgement loss. The existing
isolated notification MySQL QA additionally stores a real reconciliation proof,
simulates response loss AFTER SQL commit, and verifies proof readback, stale
replay rejection and continued reservation. It reuses the existing fixture only.

Still code-only independent work: Python-to-executor transport (exact byte/report
binding); trusted full Play-state reader; uncertain-commit reconciliation with
independent receipts; controlled generation/history CAS; live allocation under
shared-package reservation; enrollment of publish.py, allocate_versions.py and
crewwatch_internal.py; reviewed mobile-only trigger. Existing legacy producers
are not silently rewired to this adapter. Companion com.crewcheck.life remains
separate. Writer adoption needs one reviewed common coordinator for every writer
of com.crewcheck.app, including Wear, without uploading Wear in the mobile task.

Essential operational questions before wiring: Which already-authorized release
executor can reach the existing native mysql2 pool/table, with which existing
identity? Are primary durability, retention/backup and external Console writer
coordination verified? Which current read-only Play credential/Console evidence
resolves eligibility, reviews, unfinished releases and old edit receipts? Code
existence is not authorization for a connection. No new credential/grant/cost is
implied. All components stay OFF until independent review and separate wiring.
