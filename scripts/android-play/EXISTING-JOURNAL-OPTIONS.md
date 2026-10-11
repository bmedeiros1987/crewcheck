# Existing-resource journal candidate — OFF, new review required

PR929 now includes an offline immutable artifact consumer and inactive MySQL
adapter/coordinator. The prior c30eb8a9 approval does not cover these additions.
Composition preserves main aa281eee (PR1002); PR951 is not incorporated.

## Implemented and testable without production access

`artifact_consumer.py` accepts reviewed archive digest, source/controller SHAs and
run ID, verifies exact phone APK/AAB bytes and provenance and rejects archive path,
duplicate member, size, hash and identity errors. Its CLI reads a local zip without
extracting or rebuilding. It never grants store mutation; actual tool-based manifest
and signer checks and current review/CI still precede any future submission.

`mysql_journal.mjs` receives an existing native mysql2 pool; it does not read environment
variables, connect, create schema, expose a route or supply credentials. It checks
existing InnoDB engine, JSON payload and the single-column state_key primary key before
writing. Namespace play-release-journal:com.crewcheck.app reserves the shared phone/Wear
package with a plain INSERT, never an UPSERT. Owned revision CAS runs under FOR UPDATE;
release/edit/track digests cannot change. Receipt state transitions are constrained.
There is no TTL, deletion, auto-unlock or automatic rollover after reconciliation.

`coordinatedCommit` durably writes and read-verifies pending intent before invoking
one injected callback. Lost durable acknowledgements prohibit the callback; lost
external responses require reconciliation. Even acknowledged commits have unknown
availability and cannot be retried. Fresh owners remain blocked after runner loss.
No real Play client or application/CI endpoint is wired to this coordinator.

Unit fixtures test concurrency/CAS, missing/wrong schema, lost acknowledgements,
immutable identities and fresh-run blocking. A real SQL test reuses the **existing**
notification-mysql CI socket/container/table; it adds no service, uses no network/TCP
or application DB credential, and scopes test rows to that disposable QA database.
Real SQL CI must pass before claiming an InnoDB integration result.

## Code evidence for the smallest existing resource

The repository already depends on mysql2. server/platform.mjs uses a native pool
adapted for application persistence; server/free-day-sources.mjs and notification
modules use transactions and FOR UPDATE on crewcheck_telegram_state. Migration
20260715_003_aiven_mysql_full_platform.sql defines its state_key PRIMARY KEY, JSON
payload and ENGINE=InnoDB. Production deletion code is scoped to account/notification
keys; no journal prefix is reused. Actual deployment/schema/cleanup/backup/durability
must still be verified. MySQL locking-read reference:
https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html

## Concrete wiring choices — only this boundary is paused

1. **Reuse an already-authorized DB connection in the release executor.** If CI or an
   existing server executor already has approved access to this same MySQL table,
   inject that pool and adopt the journal in every mobile/Wear writer before edits.
   No new table/service or credentials are needed by the module. Existing workflow
   code shows QA sockets only, not production DB access; no secret values were read.
   Therefore this is a candidate, not evidence that such CI access is configured.
2. **Use the existing application connection through a reviewed broker.** This avoids
   copying database credentials to CI but requires a restricted authenticated release
   interface and an already-authorized caller identity. No endpoint or new grant was
   added. If existing identity cannot authorize that boundary, a concrete credential/
   permission decision is required; do not invent an unauthenticated route.
3. **Use a different existing authorized atomic store.** Supply its exact identity,
   existing access and CAS/durability contract. GitHub artifacts alone are immutable
   evidence, not an atomic package reservation. No new cloud resource is provisioned.

Regardless of wiring: confirm no retention/deletion process can clear pending records,
use primary reads with durable transaction settings, test actual loss/crash recovery,
coordinate Console/outside writers and reconcile old review/edit state first. A
controlled reviewed rollover/reconciliation operation remains to be implemented so
subsequent releases can proceed without silently clearing uncertainty. The Python
publisher's journal interface and Node adapter also still need a reviewed transport
integration; neither is wired by this patch.

## Remaining implementation versus access

Implementation: approved artifact transfer/staging into actual validation; executor/
journal bridge; controlled reconciliation/rollover; live allocation under reservation;
all-writer adoption and separately reviewed mobile-only auto-delivery trigger/production
route. Access: existing credential read-only verification, current Console eligibility,
reviews/drafts/rollouts, existing DB identity/connectivity/durable settings and authorization
for its release namespace. No store action, DB connection, schema creation, new costs,
services, permissions or credentials performed. All publication gates remain OFF.
