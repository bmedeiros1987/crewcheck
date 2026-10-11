# Disposable preparation contract

This draft remains stacked on PR1017. Production build/check/start and callers are unchanged. PR1016 remains blocked. No merge or consumer migration before independent review.

## Supported scope

Linux disposable GitHub runner, one exclusive job directory, reviewed Node generators and gates, no runtime credentials or inherited environment beyond an explicit allowlist. npm/bootstrap and browsers belong to that job. No shared source, storage or dependency cache. The preload only blocks selected Node networking APIs; it is not a sandbox.

Raw provenance is attested to Git bytes. Preparation makes independent regular-file copies of raw sources and the complete declared dependency tree (copy-on-write is allowed, hardlinks are not). Dependencies are no longer a link to mutable job inputs. Their physical node_modules directory component is preserved so Node bare-package resolution remains valid. Source, dependency and prepared snapshots record file hashes, types, directory/file modes and permitted links. Special files, external links, setuid/setgid/sticky modes and snapshot hardlinks are rejected. Dependencies' internal relative links remain supported. The prepared node_modules link resolves only to that generation's dependency snapshot.

Files are sealed 0444, or 0555 when executable; directories are 0555. Raw and dependencies seal before the worker; outputs and metadata seal after successful gates. Published snapshots are reverified before pointer publication and when resolved. A tampered mode, type or byte fails closed. Older generations without the snapshot contract require a fresh disposable store. These are owner-managed read-only snapshots, **not kernel-enforced immutability**: the same UID can chmod them. No protection against malicious reviewed code or a write after verification is claimed. The legacy v2 hit path is compatibility validation only and must not become a migration source.

## Durability and failure

All generation files and directories are fsynced, then the generations parent is fsynced **before** the reference can be renamed. Reference temporary bytes and the storage directory are synced before rename, and storage is synced after rename. Failure at the generations-parent fsync or a crash before reference publication leaves the prior pointer intact. This tests ordering and failure behavior, not power-loss guarantees beyond the filesystem's fsync contract.

Stale leases are never automatically removed. A command timeout or unproven process-group quiescence retains the lease and ends the job; it is not a retryable generation failure. A crash ends the disposable job. No reuse or cleanup with live writers. Fixture cleanup is allowed only after reaped children or explicitly verified fixture termination. Intermediate failed generations remain unreferenced for inspection.

## Processes

Every Node generator/finalizer/gate and harness validation command is launched by a trusted Node supervisor into a separate Linux process group. The supervisor kills the command group at root exit or timeout before inherited stdout/stderr can keep spawnSync waiting; the caller then verifies quiescence. A private PID control file is retained for inspection, never cleaned while descendants might remain. The parent kills the group after success, failure or timeout, waits up to two seconds for non-zombie members to disappear, and refuses progress if the group remains active. No output is sealed/published while an ordinary command descendant remains in its group.

**Negative reproduction:** a detached/setsid child can escape that group and continue after the parent timeout. The regression proves this with a bounded synthetic child that writes a marker and exits; no reference is published, and cleanup waits for its exit. Process groups do not contain setsid, chdir escapes, external helpers, or hostile owner writes. No cgroup, namespace or new system permission is requested. Therefore general process containment remains a blocker; migration scope must explicitly prohibit escaped/background descendants or provide a independently reviewed runner-level containment boundary. The current dedicated disposable job is the only allowed execution target.

## Reproduction and evidence

`node scripts/regression-staged-preparation-prototype.mjs` covers raw/provenance, cold/repeat, dependency changes, conflict preservation, gates, concurrent writer/source, v2 compatibility, publication race, nested private outputs, replacement recovery lease, parent fsync failure, SIGKILL after generation sync, mode/FIFO/hardlink tampering, dependency-copy independence, ordinary children with inherited stdout after success/timeout and the setsid negative boundary.

The experimental workflow installs exclusive dependencies and Chromium, executes the synthetic test, then runs `node scripts/ci/staged-preparation-experiment.mjs REPOSITORY JOB_DIRECTORY`. Its exact HEAD comes from the PR head checkout. Each cold/repeat/input/generator scenario is compared by prepared-file hash against independently Git-attested cold preparation. Report-producing fixtures and compiler/Vite/browser tooling use writable disposable validation copies; dependency snapshots remain read-only and the browser's Vite cache is outside them. The experimental Vite CLI uses its supported native config loader on Node22, avoiding .vite-temp writes into node_modules; production build commands are unchanged. TypeScript/build/browser gates are separate from the prepared source manifest comparison. No dist equality or production isolation claim.

Artifacts contain only synthetic results and hashes, never sources containing runtime secrets or personal documents. Each job uploads results.json and records the exact tested commit. Review must distinguish passing experiments from authorization to migrate or merge.

## Opt-in CI build/check adapter

`scripts/ci/staged-build-adapter.mjs` is the single opt-in adapter for trusted,
throwaway CI. `prepareCiValidation` requires explicit `inputKind: 'raw'`, an exact
Git commit and re-attestation even on hits. It rejects any preparation stamp,
including legacy v2, before preparing. It resolves and verifies the typed
published generation and creates a unique writable validation copy; dependency
links retain the owned read-only generation snapshot. HOME/TMPDIR use a separate
unique scratch directory outside the package scope. Failed preparation, timeout
or a pending lease throws; there is no stale-generation fallback or lock recovery.

`checkAndBuildCiValidation` runs gates followed by direct `tsc --noEmit`, the
Concierge compile module, and `vite build --configLoader native`. It never calls
npm wrappers that apply generators to the checkout. A failed command ends the
sequence. Generation verification occurs before and after successful validation.
The checkout, runtime callers and existing production workflows remain intact.

`scripts/ci/staged-build-check.mjs REPOSITORY JOB raw EXACT_SHA` exercises all
existing raw/prepared gates, direct tools and the synthetic physical browser gate.
The existing experiment still runs all cold/repeat/input/generator comparisons;
its job is not replaced. Additional CI steps test both the exact PR head and a
separate merge composition with PR1016 head
`647aaed4c4460f646865221b181419229ebe8e85`. That composition only exercises the
reviewed OFF synthetic fixtures in three timezones, with no real transport or
runtime integration. Results record the actual composition SHA. A conflict or
failure stops the job; the original checkout must remain clean at its original
HEAD. Adoption into an existing build/check job requires subsequent review.

This scope deliberately accepts same-UID chmod and setsid escape limitations
only for trusted code in disposable CI. It provides no security sandbox or
protection against hostile repository code. No runtime migration, deployment,
credential changes, message delivery or production data access is authorized.

## First build/check adoption: canonical-journeys only

The Concierge canonical journeys job now calls the approved adapter through
`scripts/ci/staged-concierge-job.mjs`. It preserves both raw gates, all five
prepared gates, the server syntax check, consumer preparation idempotency and the
final prepared TypeScript check. The raw Concierge gate writes bridge outputs,
so it runs in a separate writable raw validation copy, leaving the attested raw
input untouched. Build uses direct TypeScript/Concierge/Vite-native commands in
an exclusive writable prepared copy. The targeted Concierge apply/cmp regression
still runs there after build. No gate is optional or allowed to fail; errors,
timeouts, lease contention and composition conflicts stop the job without fallback.

Only this job changes consumer behavior. Runtime scripts and production package
entries remain unchanged. Dependencies and npm cache belong exclusively to the
job, lifecycle scripts are disabled, and no credentials or runtime .env are
inherited. Checkout HEAD, bytes and modes must remain intact. An extra early
TypeScript check supplements the existing final TypeScript gate. PR triggering
also covers the reviewed stack, and source/generator/dependency/config changes
are included for both PRs and existing main pushes; original path triggers remain.

Historical adoption validation was tested against main
`efdd999892df8330a26de15b821cd2466844535e` in a separate worktree, without
publishing it. If that main is already an ancestor, Git records the actual
already-containing HEAD instead of inventing a merge. `capture-composition-evidence.mjs`
saves the exact tested commit, parents, tree, full Git mode/type/object/path
manifest and a verifiable Git bundle with explicit prerequisites. The existing
1016 experiment also captures its actual per-lane composition bundle/manifest.
These artifacts are uploaded even on failure; validation reports separately
state whether their corresponding commit passed. Capture is evidence, not approval.

Evidence distinction: the earlier Library ZIP for f12cd50c contains local
composition ad5092aa (parents 4363adf5 and 647aaed4), whose adapter modules match
f12cd50c. It does not prove byte equality of the full CI trees ca8944d8/92de7a00.
The next CI artifacts preserve those newly tested objects directly, rather than
presenting an older local composition as proof of their complete trees.

Dependency audit at the main above: PR1017 head
`887aeb559fe85cda1c88ae495758e2d70af41f46` remains unmerged. All four scoped
changes are still absent/different in main: prepared CrewLock recognition, its
actual-block replay regression and mandatory web gate, and the Maps fixture
clock control. Eliminating duplicate preparation in this one job does not remove
the repeat/invalidation dependency or justify dropping another gate. The stack
and PR1017 remain unchanged; no PR closure or runtime migration is part of adoption.

The adopted job pins Node22.23.3, the runtime already validated for the approved
adapter. Retaining the previous job's Node22.13.0 fails closed at Vite's native
loader with ERR_UNKNOWN_FILE_EXTENSION for vite.config.ts; no fallback loader or
in-place npm build is used. This pin is part of the scoped CI behavior change.

Main advanced during validation to
`832b3cbaa13195adc471b4d7288082d2448ee664` (reviewed MyCrewCare debug OFF
composition). The historical cffd7b87 validation pinned that exact main. The
previous head83b97875 completed nine successful workflows against main efdd9998;
its captured main composition3e47f5e3/tree90a308d8 is historical evidence for that
base. Head cffd7b87 obtained nine successful workflows and exact captured artifacts for832b3cba; subsequent permanent adoption revisions must validate their actual event base.
PR1017 remains unmerged and none of its four scoped changes was absorbed by this
advance. No MyCrewCare implementation is changed by this adoption delta.

## Permanent event base and root-server trigger coverage

`server.mjs` is explicitly present in both PR and main-push path lists. The
mandatory trigger regression verifies24 isolated relevant paths for both events,
including the root server, generators, dependencies and configs, and reproduces
that server/** alone cannot cover server.mjs. No functional gate is removed.

The permanent job has no fixed main SHA. `staged-concierge-event.mjs` resolves
PR head/base exclusively from the event's head.sha/base.sha, verifies the base
repository, and exposes only validated hex SHAs as step outputs. The next step
checks that checkout HEAD equals the resolved head before installing dependencies.
For a main push, after must equal github.sha; its actual published HEAD already
contains the target and is tested directly, without merging an old before commit
back into it. Deleted/wrong-branch pushes, missing/zero bases, repository mismatch
and unsupported events fail closed. The pure resolver and actual CLI are tested.

A real divergent Git fixture advances base after head creation. Composing with
the event's advanced base includes its new module; the stale-base counterexample
omits it. The test also checks the actual workflow consumes event.outputs.base
and rejects a permanent fixed-base assignment. Captured artifacts now say
event-base-composition and record explicit input head/base, verified ancestry,
actual commit/parents/tree and whether a merge was needed. Already-contained
bases record the actual head; their original parent metadata is not presented
as a new synthetic merge. Fixed832b3cba/efdd9998 values above are historical
validation evidence only. Adoption remains draft pending the complete review.
