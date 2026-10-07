# Independent review follow-up — visitor private delivery

Review confirmed two P1s in a2670503: stay sharing/existence/content could change after rendering without changing visitor-wide permissions, and unlink could complete during the final awaited context lookup after the handler had already read the binding. Activation remains blocked until the fixes are independently reviewed and real MySQL/CI acceptance is complete.

## Before/after evidence

The new deterministic fixture run against the a2670503 materialized snapshot FAILED with stay_unshare_after_render, stay_delete_after_render and unlink_during_final_context. The fixed materialized snapshot PASSES those cases, same-ID stay revision/content update, unlink just before locked delivery, and missing-guard fail-closed. Existing visitor lifecycle/ownership/permissions/Premium, owner separation, messaging window and duplicate-webhook cases also PASS. Sender, menu, payload dedup and signed PDF integration PASS after the fix. All identity, DB, transport and resources are fictitious.

## Fix

Read the final context before rereading the binding. More importantly, private delivery now requires the platform's coherent delivery guard; an absent guard cannot fall back to send. The initial scoped producer returns text plus resource kind, entity IDs and a SHA256 version of the actual authorized rows, retained only in memory. No private resource version/body is persisted or logged.

Immediately before the single outbound attempt, the guard uses the same canonical MySQL connection/transaction: lock the phone-role reservation; verify its exact visitor/owner/receiver/binding revision and reject an owner-role conflict; lock/recheck active visitor, owner profile and subscription; rerender the same scoped command with FOR UPDATE reads on selected shared stays or active roster; compare entity IDs, resource version and rendered text. Committed unshare/deletion/update/unlink or permission/Premium changes reject the private response. Final gate/window/sender checks are repeated inside the outbound callback. Existing Telegram uses the same read producer without delivery locks or a changed reply shape.

The authorization row locks are held during the one bounded outbound attempt (existing transport timeout 10s), then released on commit/rollback. This may delay concurrent unshare/revoke operations until the attempt finishes. This is NOT an atomic MySQL/Meta transaction: accepted/in-flight messages cannot be retracted, database/network failure can leave delivery uncertain, and no retry is made. The pre-existing durable message receipt remains the at-most-once safeguard. Deadlocks/timeouts fail closed before a new attempt where possible; native contention/failure behavior must be homologated before activation.

## Remaining validation

No full build/server/production database/Meta send was run. The source was tested by applying only the relevant finalizer over the preserved prepared-main review snapshot. Independent review must inspect the newly materialized guard, adapter and lock ordering. The optional disposable-local-MySQL8 script now contains the actual materialized guard with real resource unshare/unlink checks and a second-connection lock-wait-timeout assertion during fake outbound acceptance. JavaScript syntax PASS; runtime UNEXECUTED because MySQL/Docker is absent. Table engines, real transaction behavior, schema/index compatibility and actual runtime access/isolation are not proved by mocks. Exact-code remote CI, full browser/build and authorization to real test configuration remain pending. Visitor SOS remains disabled. No credential/env/service/permission grant was changed.

## Review artifacts

The pre-fix source ZIP is Library libfile_de5a20bd57248191b216273356e39148 v0, SHA256 82544cec2067e5a6102ff6d945404c67d5b00e1152b1a997503a841d937d6d30. It contains a2670503 relevant reconstructed materialized source, DDL-only schema, helpers/tests and hashes. It excludes env/dependencies/user data. Original full prepared output had been restored, so the manifest explicitly does not claim byte identity to the discarded tree. No build was triggered to produce it.
