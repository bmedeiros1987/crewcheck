# Allowance statement selected-period context

Base: 1b36e0a55b39e4e095372ae493cd9db58614eec6.

Reproduced the context mismatch using actual NextPaymentCard and nextAllowancePayment: an October statement displayed the current November payment cycle. Its selected item forecast was scoped independently; this does not demonstrate incorrect arithmetic.

The statement now receives the existing selected forecast and requires matching valid range boundaries. Missing or mismatched context reports unavailable. Overview/payment details retain their next-cycle forecast. A selected monthly/custom statement does not imply one credit date, so that timing is omitted there. Native currencies, partial known amounts, zero and privacy remain supported. No calculation, source-coverage gate, ledger activation, persistence, schema or provider changes.

Validation: six browser cases at 320/390/1280 in light/dark passed raw and canonically prepared. Covered period/currency switching, next-cycle isolation, missing/mismatched/invalid scope, partial/zero/empty results, privacy and immutable source data with API calls blocked. Existing financial-summary browser regression and history-period regression passed; prepared TypeScript and Vite build passed. The new regression fails against the original source. Browser fixtures extract the actual producer expression and use controlled synthetic forecast inputs; they are not full authenticated application or financial-engine end-to-end validation.

No real documents, account writes, imports, external provider calls, deployment or physical Android tests. Saved-history activation and missing adjacent-period coverage remain separate unresolved gates. Independent review and remote CI are required before integration.
