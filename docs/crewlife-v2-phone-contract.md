# CrewLife v2 — phone candidate, health remains OFF

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

Reset control is `{schemaVersion:2,op:"reset",streamId,revision,requestId}`.
ACK echoes those fields with `op:"reset_ack",status:"cleared"`, from exactly the
pending node. Wear ACKs only after durably clearing old CrewLife values and
persisting the new fence. Duplicate requests are idempotent. An unknown node,
stale challenge, wrong operation/revision/stream or extra field cannot grant
readiness. Capable presence alone does not authorize a publication. The phone
requires reset ACKs and successful legacy Data Item deletion before values.

Revocation/source invalidation advances the revision and publishes a durable
`kind:"revoked"` tombstone with `metrics:{}`, generatedAt/validUntil zero. Control
uses `op:"revoke"`, ACK `op:"revoke_ack",status:"cleared"`. Tombstone is retained,
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
