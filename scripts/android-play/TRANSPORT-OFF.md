# Inactive executor/journal wire protocol and legacy writer fences

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

Legacy joint publish.py, allocate_versions.py and CrewWatch allocate/publish now
stop explicitly at require_coordinator BEFORE reading credentials/policy or
creating sessions/edits. Google imports in joint publisher are moved below this
fence. CLI flags cannot remove the fence; no runtime coordinator is configured.
This intentionally disables those manual legacy mutation paths until separately
reviewed producer adoption, including mobile/Wear shared package coordination.
The joint multi-app publisher is wholly blocked; it is not enabled or converted
into a mobile publisher. Separate com.crewcheck.life Companion remains unchanged.
Mobile-only pipeline's existing early OFF fence remains untouched.

Tests instrument poison credential/file/session/API seams on actual legacy entry
functions; wire tests serialize Python frames through a test-only Node fixture;
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
