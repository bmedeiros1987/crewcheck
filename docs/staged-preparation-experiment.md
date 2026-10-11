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
