# Hotel binding v2 — integrated candidate, operational HOLD

The candidate is connected to the actual stays GET/PATCH route, editor and roster
hotel reconciliation. It has not been deployed or used against any real account.
**Do not merge, deploy, automerge or execute the migration before separate review.**

## Final behavior

- Readiness checks expected column types/defaults/nullability, unsigned BIGINT, full unique owner/binding index without prefixes, and InnoDB for profile/roster/stays without DDL. Missing
  schema or a failed probe leaves GET legacy-readable, v2 writes unavailable (503),
  and roster hotel reconciliation review-required. There is no writable v1 fallback.
- Explicit user selection/confirmation associates one existing owned row to a
  selected program. The same row ID, encrypted room, grants and APZ are retained.
  NULL roster_key is unknown provenance, never proof of a manual hotel. An explicit
  association can link a NULL-roster row to a selected existing roster in place.
- The association loads remote hotel and baseline together; it does not stamp a new
  version onto an old draft. A later intentional hotel save records a manual
  override with provenance. UI/context metadata is explicit user association
  evidence, **not a provider occurrence reference**, and is never used by sync to
  infer source identity. Changed context/signature requires review, not auto-rebind.
- Pending remote callbacks are invalidated by local edits/actions, cancellation, navigation, unmount and account changes. A late reload/association response cannot restore a captured draft or undo cancellation. Cancelling retains current room and lead in the local record. If an explicit remote association already committed, invalidating its response does not pretend to roll it back; the user must reread.
- PATCH requires exact owner, ID, binding and decimal-string monotonic rowVersion.
  ABA, another device, stale draft and foreign/ambiguous binding are rejected.
  Readback must confirm v2 readiness, exact ID, context and requested hotel.
- No insert/delete/upsert-by-name path remains in the roster hotel block. Current
  parser observations lack proved stable occurrence IDs: they produce pending
  reconciliation without deleting, overwriting or duplicating hotel rows. A month
  import still saves the existing roster/compliance/gym payloads unchanged.
- Internally, linked source snapshots can advance only with exact occurrence/source
  evidence and expected source revision. Manual override remains effective until
  explicitly cleared with CAS. Missing source is not cancellation. The current
  parser does not manufacture these references from mutable local event IDs,
  hotel/date/airport or list position.
- There is deliberately no remote hotel creation from an unbound local draft.
  Without an existing confirmed record, editing remains local pending review.
- Transactions acquire profile(owner) → roster → sorted stays; CAS and constraint
  failures roll back, without destructive merge or blind retry. A lost-response
  retry can return 409; explicit reread reveals the saved state without duplication.

## Preparation composition

`saveRosterMysql` preserves its roster/compliance/gym SQL and payload values; only
its hotel block, shared account lock and hotel result change. Two preparation
scripts required narrow composition updates:

- `scripts/p0-active-roster-server/apply.mjs` recognizes the existing hotel profile
  lock and expanded return. Its canonical active-roster invariant is retained.
- `scripts/v14376/apply.mjs` forwards hotel reconciliation through the prepared
  context sync helper and HTTP response. Its Telegram linking/authentication and
  roster payload handling are unchanged.

No auth helpers/JWT, Asaas, Home, MCC flags or real data are changed by this patch.
Prepared generated files were tested only in disposable copies and are not part
of the source diff.

## Migration and remaining operational gates

`migrations/20261019_001_hotel_binding_candidate.sql` is an additive review-only
file, **not executed**. It does not backfill provenance, remove legacy uniqueness,
change IDs/room/grants, or wire a startup migration. Legacy uniqueness conflicts
remain explicit conflicts without deletion/merge. Review schema, all active
writers and deletion concurrency before activation. No MySQL/MariaDB/Docker binary
was available locally; real disposable InnoDB integration remains unverified.

## Local validation

67 tests passed in each of UTC, America/Sao_Paulo and Asia/Tokyo on both raw and
canonically prepared source. They exercise literal production functions extracted
with the TypeScript parser, the real client/store and actual mysqlAdapter over a
synthetic transactional native API. That lock queue is not an InnoDB substitute.

The actual React editor → real client → literal routes → mysqlAdapter/synthetic DB
browser scenario passed raw and prepared: explicit link, PATCH, repeated sync,
reopen, stale draft rejection and intentional edit after explicit reload. It also
uses slow-GET barriers while editing room/lead, cancelling, navigating and changing
accounts. The same test against the previous editor reproduced the reported loss
of room edits, providing a negative control. TypeScript
(noEmit, incremental false) passed raw/prepared. Canonical preparation and Vite
prepared build passed. Browser requests are confined to a local fixture origin;
no corporate document, real token, account or production database was used.

The original checkout and corrupt pack were preserved. Recovery used an independent
remote clone with no alternates/reference/shared objects, verified fsck and base
66ef87af23d878e46de6588a464b3d3f4e445b9b before applying candidate files.
