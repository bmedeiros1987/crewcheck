# Allowance statement selected-period context

Base: 1b36e0a55b39e4e095372ae493cd9db58614eec6.

Reproduced the context mismatch using actual NextPaymentCard and nextAllowancePayment: an October statement displayed the current November payment cycle. Its selected item forecast was scoped independently; this does not demonstrate incorrect arithmetic.

The statement now receives the existing selected forecast and requires matching valid range boundaries. Missing or mismatched context reports unavailable. Overview/payment details retain their next-cycle forecast. A selected monthly/custom statement does not imply one credit date, so that timing is omitted there. Native currencies, partial known amounts, zero and privacy remain supported. No calculation, source-coverage gate, ledger activation, persistence, schema or provider changes.

Validation: six browser cases at 320/390/1280 in light/dark passed raw and canonically prepared. Covered period/currency switching, next-cycle isolation, missing/mismatched/invalid scope, partial/zero/empty results, privacy and immutable source data with API calls blocked. Existing financial-summary browser regression and history-period regression passed; prepared TypeScript and Vite build passed. The new regression fails against the original source. Browser fixtures extract the actual producer expression and use controlled synthetic forecast inputs; they are not full authenticated application or financial-engine end-to-end validation.

No real documents, account writes, imports, external provider calls, deployment or physical Android tests. Saved-history activation and missing adjacent-period coverage remain separate unresolved gates. Independent review and remote CI are required before integration.

## Reconciliation with current main

The 2026-11-17 reconciliation uses main `f4aef1547c2ef8df5d4fbbaa210ebcaea16c50fa`. The only textual conflict is the adjacent Home imports: the selected-period `NextPayment` type and the existing financial cache import are both retained. The cached `financeSnapshot` implementation, including owner/session and DSR fences, is unchanged from main.

The history workflow merges both test families: selected-period context plus the existing cache paths, build source attribution, pending-calculation regression and evidence upload. The historical validation above belongs to `8a439c3e`; reconciliation requires raw/prepared period and cache regressions, typecheck/build, independent review and CI on the new HEAD. No history activation, provider, capture or calculation rule is changed.

The existing compiled payment-preview regression now also asserts selected-month dates independently of the next-cycle card, same-source cache reopening after period navigation, and removal of the previous account's visible statement amounts during an account switch. These use the compiled application with synthetic local accounts and intercepted APIs; they do not establish real-account, device or published behavior.

The first combined test expected the overview immediately after reopening. A diagnostic confirmed that the application correctly retained the statement screen and selected period instead. The test now explicitly opens the overview before checking its next-cycle card. The account-switch check also requires a visible numeric amount before switching, so an initially empty or masked statement cannot satisfy the negative assertion.
