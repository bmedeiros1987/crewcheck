# Shared FX for allowance estimates

The allowance engine previously multiplied foreign entitlement amounts by raw numeric account settings, without requiring their date or source. The currency calculator and Home estimate instead used the existing validated FinancialFxProvider. The same account could therefore see an automatic conversion in one place and a pending/manual or undated conversion in another.

Keep entitlement calculation in its original currency. The allowance screen and reconciliation now project those original rows through the existing shared FX arithmetic using the live provider's quote set, just like the calculator/Home estimate. The statement details expose the reference source/date and retrieval time. Raw undated numbers cannot populate converted totals. Selecting/configuring a manual reference remains explicit; automatic failure never silently blends manual settings into the quote set. Original values, entitlement dates, rule sources and saved records are not rewritten.

The projection is ephemeral. BRL entitlements, including national meals and taxi, are not converted. It does not change ACT rates, domestic archive/unavailable guards, taxi eligibility, payroll composition or provider activation. No network endpoint, environment variable, permission, credential or dependency changes.

## Existing date and fallback policy retained

- Entitlement occurrence dates keep the existing roster BRT clock.
- Quote observation dates and retrieval timestamps use the provider's existing UTC validation. This is a current reference estimate, not an official historical payment conversion.
- The existing Frankfurter service uses its shared 24-hour retrieval cache, 5-minute failed-refresh cooldown and seven-day observation/retrieval limit. It reports prior dates rather than inventing a current-day price. The client refreshes at access/focus boundaries, without background polling or per-keystroke requests.
- Temporary failures may retain still-valid, explicitly dated cached quotes. OFF, access denial, invalid or expired references leave foreign conversions unavailable. Mixed observation dates block a complete combined foreign projection. Native amounts remain visible.
- Dated manual references are kept under the existing account scope and explicit manual mode. No existing settings or data are deleted.

## Synthetic validation

Red proof against main2bc6e354: the actual allowance caller accepted an undated raw USD setting and produced a converted weekly total. The new expectation fails on that baseline and passes with the shared projection.

Twelve relevant entry points run in UTC, America/Sao_Paulo and Asia/Tokyo, both raw and canonically prepared (72 executions). Tests cover the actual scoped caller and public allowance component, provider quotes reaching statement/reconciliation, inverse/manual direction, original amounts, missing/zero/future/expired/mixed-date references, unavailable scope and preserved archive/taxi rules. Canonical TSC/build run after preparation. No local npm audit.

Compiled browser tests cover 390/1440px, native carousel/keyboard/privacy/account switching and automatic available/stale/unavailable/expired states. New checks open the actual allowance statement and inspect converted BRL, source/observation/retrieval, and absence of fabricated fallback. All remote requests are blocked or fulfilled with synthetic responses; no ledger writes. The initial run timed out on the existing keyboard calculator shortcut at1440px; a diagnostic run completed all scenarios without a product routing change. The separate existing open-client test checks OFF/access invalidation and bounded transient cache without upstream requests.

Home financial hunks were reserved with the #1203 owner before editing. #1210's DSR correction stays on its own unchanged branch/HEAD for review. No production configuration was inspected or activated by this change. Production flag state cannot be inferred from a screenshot showing an explicit manual simulation.
