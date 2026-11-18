# Local tariff archive diagnostics

Base: `6269b5100a5db25fbcd90696747cd95829221795`. All examples/tests are synthetic.

## Defect and minimal fix

A valid monthly review supplied a main meal of 200 and breakfast of 50. A single malformed salary entry made the shared archive reader return `[]`; a midday airport reserve then appeared as a **complete 125** using the synthetic ACT fallback of 100/25. The new regression fails on the base at that assertion.

The reader now distinguishes missing, ready, invalid, unavailable and unauthenticated. The legacy array reader remains fail-closed. A per-diem calculation reads the status and applicable rates from one validated snapshot. Invalid/unavailable archives produce domestic financial pending items instead of silently adopting ACT/manual amounts; an eligible taxi remains a separate pending row. Independent international references are unchanged.

The P1 follow-up also preserves authentication read failures: if every localStorage read, or just the user/token read, throws, the archive is unavailable rather than unauthenticated. A genuinely absent session remains unauthenticated. The regression reproduced a complete synthetic ACT total of 125 before the fix; it now requires a null total, pending taxi, unchanged storage and no writes, then verifies the original confirmed values return when reads recover. The public nullable owner helper keeps its existing fail-closed behavior.

The second P1 counterproof covers a present token with a missing, malformed or invalid-shaped cached user. A swallowed JSON parse failure cannot establish logout: these cases now produce unavailable/pending, do not read any owner archive and cannot authorize a write. A known absent token remains unauthenticated even when the leftover user record is malformed or unreadable. The minimum financial owner shape requires a nonempty string id and a string role when supplied; guest/visitor identities remain excluded. No authentication record is repaired or removed, no owner id is normalized, and the legacy nullable owner API remains fail-closed. Recovery reuses the original account's untouched rates.

No entries are filtered, deleted, repaired, migrated or uploaded. The existing writer still rejects replacing malformed/conflicting archives or dropping history. Manual values are preserved; a valid monthly owner review keeps its existing bounded precedence. Merely missing or expired references retain the existing reference calculation and its source warning, rather than becoming a corruption error. A missing archive additionally says the own reference is not saved on this device.

## Cross-tab behavior

The detailed explorer listens for the current authenticated owner's versioned tariff archive and manual financial settings in localStorage. Another owner, sessionStorage or unrelated key does not trigger that financial refresh. LocalStorage clear resets loaded account history; listeners are removed on unmount. This is same-origin cross-tab refresh, **not cross-device synchronization**.

## Boundaries and existing local update flow

Personal statements do not establish a global tariff for all employees. This patch has no real rates, account identifiers, documents or retroactive dates. ACT/global defaults and schema remain unchanged. No server endpoint, migration, flag, grant, cost, permission or transport is added.

The existing monthly owner-confirmation UI preserves history and manual settings outside the reviewed month. With an eligible unpriced taxi, it is reachable under **Diárias → Extrato → Revisar tarifa de táxi → Confirmar tarifa informada pelo titular**. The administrator's existing **Calibração financeira** also contains this form. Values must be reviewed and saved in the affected browser/app origin: an update of web code cannot transfer another device's local archive. Do not clear app storage to update code.

An invalid archive remains preserved and blocks the existing writer; explicit recovery is a separate design, not an automatic partial salvage. This slice does not diagnose the contents of any real device or prove payment receipt.

## Gates

- Regression executes the real reader/writer, Home calculator and Explorer effects with synthetic owners, dates, amounts and storage failures.
- Invalid JSON/version/owner/entry/date/conflict, unavailable storage, immutable history, one-snapshot consistency, manual/international independence, expiry and owner isolation.
- Cross-tab relevant/irrelevant events, account switch, localStorage/sessionStorage clear and listener cleanup.
- Existing #1192 precedence and financial caller regressions retain their assertions; their extraction harnesses receive the new production dependency.
- Run raw and canonically prepared in UTC, America/Sao_Paulo and Asia/Tokyo, then typecheck/build; independent review and exact-head CI before publication.
