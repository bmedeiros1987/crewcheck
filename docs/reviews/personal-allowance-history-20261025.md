# Personal allowance effective-date history

This corrects a dated-forecast regression: a future recurring reference used to replace the current category event before checking the queried date, so earlier forecasts lost their previous reference. Shared company/default tariff tables, eligibility, source observations and payment records are unchanged.

## Authority and dates

- Keep the existing account-local key and Web Lock. Reads do not convert legacy data or activate a reference.
- Schema 2 is saved only after the owner reviews and confirms the interval preview. The exact original schema-1 string is retained for audit. Only the final active legacy state of each category seeds the live timeline; older replaced/revoked assumptions are not restored automatically.
- An activation's effective day and its recording revision are distinct. Select the latest applicable effective start; revision breaks same-day ties. Exact-start and exact-source duplicate confirmations are idempotent. Equal sources at different dates remain meaningful future anchors.
- Revocation retains its existing global meaning: withdraw the category for every forecast date and cancel all its previously scheduled activations. A later explicit activation begins a new generation. This is not an invented date-effective stop.
- Source identity is selected before checking current source validity. Missing, corrected, zero or withdrawn reusable evidence blocks that interval instead of falling back to an earlier source. Independently confirmed bounded-month references retain precedence.
- The rate and unresolved-source diagnosis use the same date-specific selection. Owner/session, expected schema/revision and exact serialized snapshot are checked under the same lock. Invalid/unavailable data is preserved, not overwritten. Final serialized size and safe-integer bounds are enforced.

## UI

The existing archived-reference form now has a no-write preview and explicit confirmation. It shows preserved intervals and scheduled starts, discloses legacy conversion, and explains that global revocation cancels scheduled uses. Privacy masking, account changes, stale previews and repeated clicks remain guarded. It never labels a personal premise as company-verified or payment-confirmed.

If legacy data already lost an earlier live assumption, conversion does not guess its restoration. An already archived source may be explicitly selected for that earlier interval, without another amount entry or upload, subject to its original source-start constraint.

## Regression wiring

`regression-financial-rate-archive.mjs` already imports `regression-personal-allowance-reference.mjs`, which now also runs `regression-personal-allowance-history.mjs`. The existing per-diem workflow runs this chain before and after canonical preparation in three timezones. Existing owner-review browser coverage now includes interval preview/cancel, later changes, category revocation/restart, byte-preserving legacy conversion, privacy, storage/auth changes and repeated clicks; it remains in the existing known-values workflow.

Synthetic tests exercise the actual shared Home calculator as well as the store/selectors. The actual roster card and financial-month renderer consume those calculated February/November rows in a React server-render probe. It first verifies the real server privacy default is masked, then supplies an explicitly shown synthetic client snapshot to the real privacy hook; unrelated navigation/shell/editor decorations are stubbed. This proves displayed row consistency, not browser layout or interactive refresh. No real account is read or migrated. Browser, full type/build and exact-head CI results must be reported separately; source and unit tests alone are not UI or release approval.
