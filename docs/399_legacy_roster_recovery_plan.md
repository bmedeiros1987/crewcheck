# #399 — Legacy roster recovery: schema mapping and conversion proposal

Status: **proposal only, nothing here is implemented or executed**. No migration
code exists yet. `POST /api/auth/admin/legacy-recovery-candidate` (admin-only,
read-only, per-e-mail) is the only new runtime behavior in this slice.

## 1. Production evidence (2026-08-16, via `legacy-table-audit`/`rosterBridge`)

- `totalLegacyUsers` = 29, all with a normalizable e-mail.
- `legacyUsersMatchingCurrentIdentity` = 2, `legacyUsersNotMatchingCurrentIdentity` = 27.
- `totalLegacyRosters` = 60, **100% (60/60) resolve to a valid `crewcheck_users.id`** —
  `rostersWithoutLegacyUser` = 0. No orphaned rosters even within the legacy layer.
- `distinctLegacyUsersWithRoster` = 19 of the 29 legacy users have at least one roster.
- `legacyUsersNotMatchingCurrentIdentityWithRoster` = 17: legacy users with no current
  account/profile who still have real legacy roster data.
- All 60 legacy rosters were created between 2026-06-01 and 2026-07-04, i.e. entirely
  before the Aiven MySQL cutover commit (`9cf5fad2`, 2026-07-15).

**Conclusion this data supports:** for this June/early-July generation of users, the
critical data was never lost and never left the current Aiven MySQL database. This is
an identity-reconnection problem, not a data-recovery-from-Supabase problem.

## 2. Column-by-column schema comparison

### `crewcheck_users` (legacy) → identity bridge only, not migrated as a table

| legacy column | current equivalent | note |
|---|---|---|
| `id CHAR(36)` | — | Never reused as a current identifier. Used only internally, server-side, to join to `crewcheck_rosters.user_id`. Never returned by any diagnostic endpoint. |
| `email VARCHAR(320) UNIQUE` | `crewcheck_platform_accounts.email` / `crewcheck_platform_profiles.email` (both `VARCHAR`, email as PK) | The entire bridge. Compared via the same `CONVERT(... USING <charset>) COLLATE <collation>` pattern #501 introduced, never a raw `=`. |
| `password_hash TEXT`, subscription/billing/verification columns | — | **Never read for recovery.** No code path may authenticate against this hash or copy it anywhere. |

### `crewcheck_rosters` (legacy) vs `crewcheck_platform_rosters` (current)

| legacy column | current column | conversion note |
|---|---|---|
| `id CHAR(36)` | `id VARCHAR(64)` | New id generated fresh at conversion time (`crypto.randomUUID()`, same as `saveRosterMysql()` does today). The legacy id is preserved only in the audit log (§4), never reused as a live PK. |
| `user_id CHAR(36)` | *(none — current has no roster→identity FK; it uses `owner_email`)* | Resolved once via the bridge, not stored on the roster row itself. |
| *(none)* | `roster_key VARCHAR(20) NOT NULL`, part of `UNIQUE KEY (owner_email, roster_key)` | Legacy never had this concept. Must be **derived deterministically** (e.g. from `period_year`/`period_month`, or a stable hash of legacy `id`) so re-running the conversion is idempotent and collisions are detectable, not from anything that could differ between runs. |
| `roster_json JSON NOT NULL` | `roster JSON NOT NULL` | **Different shape.** The AIMS/CrewRoster parser changed substantially between v11.x (legacy) and the current v14.x pipeline (continuity/anti-teleport engine, canonical day classification, DO/rest rules, etc. — see the version history in this repo). The legacy JSON cannot be copied byte-for-byte into the current `roster` column and treated as equivalent; it needs to go through the current parser/normalizer, or an explicit, reviewed compatibility transform written and tested against real (anonymized) legacy samples first. |
| `compliance_json JSON NULL`, `gym_json JSON NULL` | `compliance JSON NOT NULL`, `gym JSON NOT NULL` | Same shape concern as above, plus current requires `NOT NULL` — these should be **recomputed by the current compliance/gym engines** after the roster is re-parsed, not copied from the legacy blob. |
| `checksum VARCHAR(128)` | `fingerprint CHAR(64) NOT NULL` | Different algorithm/length. Must be **recomputed** by the current fingerprinting logic against the converted roster, since it's derived from content that itself needs re-parsing. |
| `source_file_name VARCHAR(255)` | `source_name VARCHAR(180)` | Direct copy, truncated to 180 chars if needed. Metadata only. |
| `is_active TINYINT(1)`, `active_at`, `deleted_at` | `active TINYINT(1) NOT NULL DEFAULT 1` | Current enforces **one active roster per `owner_email`** via an explicit `UPDATE ... SET active=FALSE WHERE owner_email=?` before every insert (`saveRosterMysql()`, `server/platform.mjs:1620`). A converted legacy roster must go through that *same* function/invariant, never a raw `INSERT ... active=1` that could silently deactivate or shadow a roster the user is using today. Rows with `deleted_at IS NOT NULL` in the legacy table were explicitly deleted by the user and must be **excluded from recovery entirely**. |
| `storage_provider`, `source_storage_path`, `source_file_size_bytes`, `storage_uploaded_at` | *(none)* | Some legacy rows may have stored the roster in external storage with only a pointer here, rather than inline JSON. Any row where `roster_json` is empty/absent and `storage_provider` is set is **not recoverable from this table alone** — it depends on whether that storage still exists, which is out of scope for this proposal and must be checked case by case before a user is told their data is recoverable. |
| `period_year INT`, `period_month INT`, `crew_name`, `crew_id`, `base`, `` `rank` ``, `airline` | *(none as separate columns — folded into `roster`/profile in the current model)* | Informational / derivable from the re-parsed roster content, not migrated as standalone columns. |
| `score`, `intensity_score`, `alerts_count`, `critical_alerts_count` | *(none stored — computed at read time in the current architecture)* | Not migrated as stored values; recomputed live by the current engine once the roster is converted. |
| `created_at`, `updated_at TIMESTAMP` | `created_at`, `updated_at DATETIME(3)` | Conceptually the same (second vs. millisecond precision is a trivial widening). `created_at` should be **preserved** from the legacy row to keep real history, not reset to "now" — `updated_at` will still re-fire on any later write regardless of what's set at insert time. |

### No legacy equivalent found for `crewcheck_platform_stays` / `crewcheck_platform_hotel_rules`

Production's `unexpectedTables` only ever surfaced `auth_accounts`, `crewcheck_users`,
`crewcheck_rosters` — no legacy stays/hotel-rules table exists in the current
database. Whatever stay/hotel data these 19 users had, if any, is only reachable (if
at all) by parsing the legacy `roster_json`/`compliance_json` blobs once their real
shape is understood — not through a separate table-to-table copy. This proposal does
not assume that data is recoverable; it should be scoped as a separate, later step
once the roster JSON shape itself has been reviewed.

### `auth_accounts` remains excluded

Per the prior investigation, `auth_accounts` has no trace in this repository's git
history under any name variant. It is deliberately **out of scope** for this
conversion proposal until its own schema has been reviewed independently — it should
not be assumed to be part of the same legacy user/roster model just because it was
flagged by the same `unexpectedTables` query.

## 3. Proposed identity bridge

```
crewcheck_rosters.user_id (UUID)
        │  JOIN, collation-safe
        ▼
crewcheck_users.id  →  crewcheck_users.email  →  safeEmail() normalize
                                                        │
                          ┌─────────────────────────────┴─────────────────────────────┐
                          ▼                                                             ▼
        current identity exists                                       current identity does NOT exist
   (crewcheck_platform_accounts/profiles                                  no account/profile row for
      already has this normalized e-mail)                                    this normalized e-mail
                          │                                                             │
      import roster(s) into the existing                            user must complete the MODERN
      identity via the same saveRosterMysql()                       self-service recovery flow
      invariants used today (§4) - no new                           (requestReset/resetPassword,
      account created, no credential touched                        already built, already tested)
                                                                      to PROVE e-mail ownership before
                                                                      any current account is created.
                                                                      Never authenticate with, or copy,
                                                                      the legacy password_hash.
```

## 4. Required invariants for the future migration (not yet implemented)

Per explicit instruction, the migration itself is **not** part of this PR. When it is
written, it must satisfy all of the following:

- **Idempotent.** Re-running the migration against the same legacy row must never
  create a duplicate or double-count. The derived `roster_key` (see table above) plus
  a dedicated recovery-log table (below) make re-runs a no-op for rows already
  processed.
- **Transactional per user.** All rosters recovered for one legacy user must commit
  or roll back together, matching `saveRosterMysql()`'s existing `BEGIN`/`COMMIT`
  pattern — never a partial import for one person.
- **Auditable.** Every converted row must be traceable back to its legacy origin. This
  needs a new, append-only table (e.g. `crewcheck_platform_roster_recovery_log`) with
  the legacy roster id, the resolved current `owner_email`, a conversion timestamp, and
  outcome — never smuggled as extra columns into `crewcheck_platform_rosters` itself.
- **Never silently overwrite a current active roster.** If an active roster already
  exists for that `owner_email` with a conflicting derived `roster_key`, the recovered
  legacy roster is inserted **inactive**, never auto-activated over what the user is
  using today. Activation, if wanted, is a separate, explicit, reviewed step.
- **Detect duplicity.** Before inserting, check whether an equivalent roster (same
  `owner_email` + derived `roster_key`, or same recomputed `fingerprint`) already
  exists in `crewcheck_platform_rosters`; skip and log rather than duplicate.
- **Keep the legacy record intact.** The migration may only ever `SELECT` from
  `crewcheck_users`/`crewcheck_rosters` — no `UPDATE`, `DELETE`, or `ALTER` against
  them, ever. They remain the durable historical record.
- **Respect current invariants.** Roster creation/activation must go through the same
  functions `saveRosterMysql()` already uses today (single-active-per-owner
  enforcement, hotel_rules/stays population where derivable) — never a parallel raw
  `INSERT` that bypasses that logic.
- **No credential reuse.** The migration never reads, copies, or authenticates against
  `crewcheck_users.password_hash`. A missing current identity is only ever created
  through the existing self-service recovery flow, which requires proving e-mail
  ownership first.

## 5. Suggested pilot

Per review guidance: once the flow above is implemented and reviewed, pick one of the
17 `legacyUsersNotMatchingCurrentIdentityWithRoster` accounts that belongs to the team
(not an external user) as the first end-to-end proof:

old account → modern recovery (prove e-mail ownership) → current identity created →
legacy roster(s) imported inactive → reviewed/activated → login twice → roster verified
intact.

This PR does not select or touch that account — it only prepares the read-only
diagnostic needed to identify it safely.
