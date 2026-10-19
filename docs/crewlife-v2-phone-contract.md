# CrewLife v2 — phone candidate, health remains OFF

**Draft/HOLD: corrected Wear79cfcb57 and phone producer pass synthetic composition
(11 protocol cases and 30 complete-sender assertions). Independent review of this
phone delta and the exact pair, strict MCC integration, vendor and physical gates
remain pending. No health activation or Store publication follows from these tests.**

Phone changes extend #1085 HEAD379eb3db. No Wear files, real SDK, permissions,
Health Sync activation, live health records, Store operation or routine/roster
projection is included. Final integration needs the exact independently reviewed
Wear producer/consumer composition and the strict shared-source MCC gate.

Transport names:

- Capability `crewlife_metric_validity_v2` (discovery prerequisite, never consent).
- Data Item `/crewcheck/watch/crewlife/v2`, DataMap string `crewLifeJson`.
- Directed control message `/crewcheck/watch/crewlife/v2/control`.
- Directed ACK message `/crewcheck/watch/crewlife/v2/ack`.
- Legacy CrewLife `/crewcheck/watch/crewlife/v1` is removed, never republished.
- Routine `/crewcheck/watch/routine/v1` is unchanged. Full existing explicit
  consent revocation still requests deletion of routine; protocol-only migration
  and source invalidation do not touch it.

Snapshot example (synthetic epoch and values):

```json
{
  "schemaVersion": 2,
  "kind": "snapshot",
  "streamId": "random-opaque-uuid",
  "revision": 4,
  "generatedAtEpochMs": 1800000000000,
  "validUntilEpochMs": 1800000060000,
  "metrics": {
    "recoveryScore": {"state":"valid","value":0,"validUntilEpochMs":1800000060000},
    "sleepMinutes": {"state":"no_data","validUntilEpochMs":0},
    "steps": {"state":"valid","value":51,"validUntilEpochMs":1800000060000},
    "activeMinutes": {"state":"no_data","validUntilEpochMs":0}
  }
}
```

The legacy WebView publish request now requests a native source refresh; it cannot
inject source-valid health using fabricated timestamps. Manual local entries remain
local and are not represented as automatic sensor data.

The phone maps `metricValidity.energyScore` to `metrics.recoveryScore`, with the
original value and deadline. This version carries ENERGY only, not a fabricated
recovery assessment. Other mappings retain their names. Integer bounds are
0–100, 0–1440, 0–200000, and 0–1440 respectively. Narrative, heart metrics,
labels, raw records and identity fields are not accepted. Unknown fields are
rejected at every object level; strings/fractions/negative numbers are not
coerced or clamped. A malformed individual metric becomes unavailable while
independently valid metrics survive. A malformed envelope invalidates CrewLife.

A snapshot replaces the entire previous snapshot. Missing/no-data/expired/
unknown-source/invalid/revoked/permission-denied metrics have no `value` and a
zero deadline. A numeric measured zero remains present. The consumer must show
`--` for unavailable values and recheck expiry while open/AOD/complications.
At exact expiry it is unavailable. The source envelope and each metric deadline
must both be valid; transport receipt and rendering never extend them. A source
envelope may conservatively expire before a remaining metric: it is never
extended by this protocol.

Protocol journal stores only an opaque stream UUID, revision and per-node
cleanup challenges/ACK state in a separate private preference file. No account
identifier or health values are retained. Commit failure blocks the process.
Each new owner/consent generation needs a fresh opaque stream and reset ACK.
Revisions increase durably; Wear must persist stream/revision fences, reject
older revisions/foreign streams and reject v1 replay after migration.

The phone first sends `{schemaVersion:2,op:"challenge_request",action:"reset",
streamId,revision,requestId}` to a capable node. Wear must generate and persist
`wearChallenge`, encoded as exactly 64 lowercase hex characters from 256 random
bits, bound to sender/action/stream/revision/requestId before responding via ACK
path with `op:"challenge"`, `action:"reset"` and the same tuple plus nonce.
The phone accepts only its currently pending exact node/action/stream/revision/
requestId, persists the nonce, then sends `{schemaVersion:2,op:"reset",streamId,
revision,requestId,wearChallenge}`. Control does not include `action` after the
challenge phase. For revocation the challenge action is `"revoke"` instead.

Wear must check its own durable pending nonce; a reset cannot supply its own
authority. Missing/corrupt/lost journal means unavailable and a NEW Wear nonce.
After atomic cache clearing, fence installation and nonce consumption, Wear ACKs
`{schemaVersion:2,op:"reset_ack",streamId,revision,requestId,wearChallenge,
status:"cleared"}`. No `action` in final ACK. Without that exact persisted nonce,
wrong node/action, stale challenge or prior-generation ACK cannot grant readiness.
The phone does not issue the Wear nonce or reconstruct it from a clock.

Duplicate exact consumed resets may only ACK idempotently from a durable applied
receipt; they must not clear newer data or lower the fence. Issuing a challenge
alone cannot change the active stream. Delayed old hello may cause another retry,
never authorize old data. The actual receiver-side rules require verification in
the separate Wear PR, including losing the Wear journal after issuing a nonce.
Capability alone does not authorize publication. The phone requires challenge-bound
reset ACKs and successful legacy Data Item deletion before values.
Revocation/source invalidation advances the revision and publishes a durable
`kind:"revoked"` tombstone with `metrics:{}`, generatedAt/validUntil zero. Control
uses `op:"revoke"` with the persisted Wear nonce, ACK
`op:"revoke_ack",status:"cleared"` echoing that nonce. Tombstone is retained,
including after ACK, until a new stream is reset. Pending challenges survive
restart; bounded local retries and incoming watch requests resume cleanup.
Unknown/offline previously seen nodes stay pending. Empty node lists never mean
remote clearance. `putDataItem` success means queued, not consumer ACK/display.
Optional snapshot ACK is not used as cleanup authority in this phone version.

Local consent is disabled before asynchronous full-revocation I/O. Every async
publication boundary checks persisted generation/revision and current consent.
A task already handed to the Data Layer cannot be recalled. A late completion
republishes the current tombstone if revoked; Wear's persisted fence must reject
the old stream/revision. Offline/old watches cannot be declared cleaned merely
because a deletion task succeeded. Data Items are shared/persistent, so one
capable watch does not prove migration of all paired devices. Unseen old/offline
caches remain a release limitation, not a guarantee fixed by this patch.

Common synthetic acceptance vectors live in `tests/fixtures/crewlife-v2/`.
`regression-crewlife-v2-phone.mjs` compiles and executes actual phone protocol,
journal, transport coordinator and actual MainActivity producer method with
explicit Android/storage/Task doubles. It does not execute the new Wear parser,
real Data Layer, proprietary SDK, encryption migration or physical display.
Those proofs and old/new composition remain with the separate Wear candidate.


## Exact composition validation

Wear input is pinned to `79cfcb57c720f3f06a8cc4beb2f4129f1d5572fe`.
The receiver fixes challenged initial clear-only revoke and zero-time value-free
revocation tombstones. CI checks out that exact read-only source tree and compiles
its actual `CrewLifeFence`/`CrewLifeSnapshot` with this phone's actual native
producer method, publisher, protocol journal, coordinator, ACK listener service,
consent and revocation retry implementation. Input hashes are checked before/after.
Transport Tasks, source query/clock, Android and persistence are explicit doubles.
The store encryption/Android lifecycle proofs are separate Wear CI tests, not
claimed by this harness.

The sender suite covers cold-start cleanup before consent; fresh Wear challenge and
reset ACK through the real phone service; zero/absence/source deadlines; old/new
schemas; old Companion with missing provenance; logout during discovery; late
already-handed-off put completion and tombstone repair; account stream replacement;
Wear journal loss; and an old/offline peer never treated as cleaned. Protocol-only
migration/source invalidation preserves routine, while existing full explicit
consent revocation still removes routine. The operational publisher is not called
by any health ACK flow. Old phone + old Wear behavior remains unsafe and is not
certified by this rollout. No physical delivery/display or remote cache clearance
is inferred from a DataClient success.
