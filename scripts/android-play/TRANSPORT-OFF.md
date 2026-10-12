# Inactive executor/journal wire protocol

The early sections record the prior contract-only stages. The functional phone
lifecycle section below supersedes their "no helper invocation" limitation;
production wiring, guards and publication remain OFF throughout.

Base main56ef873e744da463efafd9581dfc02dba4e969a1 (merged PR1005).
No live executor, service listener, subprocess launcher, connection URL,
credential loader, new identity/permission or production journal is configured.

JournalTransport serializes canonical JSON to an explicitly injected exchange
callback. It binds schema/request ID, package, owner, producer, exact source and
controller SHA, run ID, AAB hash and version code. It checks response schema/ID,
owner/intent/revision/state and rejects duplicate JSON keys. Any malformed,
blocked or lost reply permanently blocks that client instance; no retry occurs.
A new client cannot overcome durable journal ownership/revision fencing.

createJournalProtocol takes an explicitly injected journal, independently pinned
binding and trusted authorize callback. None are created from request fields,
flags, secrets or environment. Allowlisted read/reserve/advance operations only;
no edit creation, allocation, upload, commit, unlock, delete or rollover operation.
Serialized advances are limited to edit_open/pending/reconciliation_required;
callers cannot assert acknowledged/reconciled outcomes over this wire. Existing
reviewed in-process commit/reconciliation helpers remain responsible for those.
Canonical frames, binding, replay and revisions are checked before authorization
or database access. The authorization seam is NOT a deployed machine identity:
future embedding must verify actual artifact/CI/review/live-allocation evidence
and authoritative receipt transitions. A callback returning true is used only in
fictional fixtures/isolated QA. No production embedder is supplied here.

The existing bridge/journal verifies durable writes before returning receipts.
Protocol errors disclose no database/network response. Unknown availability and
retryAllowed=false are fixed outputs; they cannot grant publication. This wire
contract is not yet an implementation of the older Python DurableJournal backend
interface, nor does it connect mobile_internal.publish to Node. That adaptation
requires reviewed receipt/state mapping and executor lifecycle coupling.

Legacy joint publish.py, allocate_versions.py and CrewWatch allocate/publish are
byte-identical to base main56ef. Their existing manual behavior is preserved.
This protocol does not fence, wrap or coordinate those paths. Shared-package
coordination across all writers is NOT active; this PR cannot claim global
exclusion against manual scripts or external Console writers. No publication
path is executed by this change. Separate com.crewcheck.life Companion remains
unchanged. Mobile-only pipeline's existing early OFF fence remains untouched.

Wire tests serialize Python frames through a test-only Node fixture;
Node negatives cover absent capability, foreign intent/owner/producer, replay,
stale revisions, duplicates and unknown operations. Existing disposable MySQL QA
checks this protocol against actual platform bridge/journal: a pending SQL write
commits but reply is lost, response is blocked, stale frame/new owner cannot
write and no Play operation occurs. Existing explicit CI failure propagation is
retained; no new service/container/socket/database is provisioned.

Still independent code work: map Python publisher receipt semantics to this wire
state machine; pin consumed-byte validation evidence in the trusted executor;
full reviewed state reader and uncertain Play commit reconciliation; controlled
generation/history CAS; producer migration and external Console coordination.
Current policy-only artifacts cannot authorize reservation/publication. Production
transport, identity/access/durable settings and Play eligibility remain unproved.
Render workspace confirmation remains pending; no scheduler credential is reused.

## Python receipt projection (OFF)

receipt_backend.ReceiptBackend implements the existing DurableJournal backend
methods over an explicitly injected JournalTransport. It binds package/owner and
release provenance, hashes staged snapshots into the existing Node intent fields,
and maintains the acknowledged CAS revision. create_if_absent reserves once;
replace_owned maps edit_open/pending and uncertain `unknown` to the Node
reconciliation_required state. read verifies the actual owned Node record before
returning an exact copy of the Python receipt projection. The local projection is
never a durable store or a way to recover ownership after runner loss.

Any uncertain write/read or invalid receipt blocks that backend instance. A fresh
backend cannot acquire the already reserved package. There is no retry, deletion,
unlock, timeout, generation rollover or automatic release. This is an injected
contract adapter, not a configured backend for mobile_internal.publish. It does
not load credentials, start subprocesses, connect or grant executor authority.
The existing manual CLIs and publisher workflows remain byte-identical. The
read-only preflight includes the receipt backend, both end-to-end test files and
the deterministic SQL fixture in its PR path filter; source-only changes trigger
the existing offline suite. A contract test checks each standalone changed path.

Caller-provided acknowledged/reconciled/positive store outcome fields are refused.
The older publisher's final persistence calls are therefore deliberately NOT
supported by this increment; do not wire it into publication. Read-only projection of existing trusted helpers' durable final results is now
provided below; invoking the helpers from the actual publisher still requires
separate lifecycle integration. Same-state evidence enrichment, recovery after
runner loss and authoritative reconciliation are also not implemented here.

The existing offline transport CI test imports the end-to-end receipt test. Its
Node test-only fixture uses createJournalProtocol and createMysqlJournal with the
same deterministic SQL fixture as test_mysql_journal; extraction preserves that
fixture's implementation. Batch replay models persistent rows for fictional
requests, not a production process or real database. It exercises SQL and wire
reply loss, duplicate/stale/foreign frames and coordinatedCommit's uncertain
callback. No real commit, store inspection or production configuration is tested.

Snapshot hashing matches reconcile_journal.snapshotDigest for an explicitly
limited JSON schema: printable ASCII keys, UTF-8 strings, null/booleans, safe
integers, arrays and objects. Fractional/unsafe numbers, non-ASCII keys and lone
surrogates fail closed. Cross-language tests include Unicode release names,
emoji, controls and nested values; schema limits are not silently coerced.


## Verified final helper projection (OFF)

ReceiptBackend.project_verified_result accepts a helper result as a lookup claim,
not authority. It verifies pinned package/owner/source/controller/run/AAB/version,
edit and staged snapshots, known lifecycle revision progression, and reads the
exact existing Node record. Only matching durable state produces Python outcome
flags. Reconciliation also requires the complete observation matching the persisted
proof hash, preceding acknowledged revision, inventory and review/edit guards.
No final-state advance/write, retry, release or rollover operation is exposed.

Caller-authored final persist calls remain refused. Successful acknowledged import
may subsequently import the next proven reconciled revision; replay or uncertainty
blocks the instance. A new owner still cannot acquire the reserved package. The
projection preserves unknown store availability, including after reconciliation;
it does not prove tester access, review submission or public availability.

The test-only batch fixture invokes existing coordinatedCommit and
reconcileAcknowledged with a fictional commit callback and complete fictional
observation, on deterministic fictional SQL. Positive, forged, stale, owner/hash,
snapshot/proof drift and lost read responses are exercised through the actual
Python/Node contract. This is not the real isolated MySQL end-to-end test; the
existing real MySQL QA continues to cover prior components. No runtime wiring,
real state reader, production identity/transport/DB access or Play eligibility is
proved. Helper invocation, restart recovery, same-state enrichment and publisher
lifecycle coupling remain separate, and all automation gates remain OFF.

## Restart observation fence (OFF)

`readRecoveryFence` extends the existing reconciliation module with read-only
observation of the existing shared-package journal after runner loss. A trusted
embedding pins package/owner/source/controller/run/AAB/version independently;
two equal journal reads bind an observation digest to the current durable record.
Missing, stale, foreign, racing or uncertain evidence cannot authorize anything.
Even an empty or reconciled journal observation returns reservationAllowed,
storeMutationAllowed, retryAllowed, rolloverAllowed and resumeAllowed=false.
It does not reconstruct a Python receipt, invoke commit/reconcile, allocate,
upload, open an edit, unlock or adopt a legacy writer.

Offline deterministic SQL tests model a stopped runner with a committed pending
row and lost SQL response, uncertain Play commit acknowledgement, Mobile/Wear
competition for com.crewcheck.app, foreign immutable binding and racing reads.
This is not a real process-kill/production durability test or a complete Play
reader. Existing publishers, OFF controller guard, identities, pool wiring and
external Console coordination remain unchanged. Preflight must still establish
current store eligibility through the existing read-only main workflow; no new
credential or permission is introduced by this code.

## Functional phone lifecycle invocation (OFF)

The optional trusted lifecycle embedding adds commit/reconcile operations to the
same protocol. Without it they remain blocked before journal access. It owns the
staged/complete readers and commit callback; serialized requests contain only
bound intent/revision, never outcome flags, reader data or functions. Pending must
be durably acknowledged before staged read or commit. Complete observation guards
and digests are shared with reconcileAcknowledged. Helper results and proof are
returned with the exact stored record; ReceiptBackend still performs an independent
owned read before projection. Publisher helper uncertainty cannot fall through to
legacy commit or cleanup. There is no live capability, listener or auth configuration.

The actual mobile publisher uses this path when given the reviewed ReceiptBackend.
Legacy fake backend tests and manual publisher workflows retain their prior behavior;
this does not enroll any live writer. Mobile helper operations reject Wear/allocator
bindings. All parties still use the shared com.crewcheck.app reservation for fencing.
See RECOVERY-HISTORY.md for the concrete existing-pool connection and restoration
sequence; offline integration is no longer just a result-projection stub, but no
store execution/eligibility or automatic delivery is claimed.
