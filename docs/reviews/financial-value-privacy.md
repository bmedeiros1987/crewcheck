# Financial value visibility

Scope: the existing financial interface only. No bank-style hierarchy, new payment forecast, taxi rule, imported-rate confirmation rule, export data, or calculation was introduced.

One in-memory preference per authenticated account controls Eye/EyeOff. It survives navigation and period changes in the current page, but reload starts visible. No preference, monetary values, or token are persisted by this feature. Other accounts do not inherit it.

Concealed amounts are replaced in rendered text with “Valor oculto”, including salary composition, flight/activity details, original currencies, conversions, tariff review/history and statement reconciliation. Financial setting inputs are blank/disabled while concealed, and the existing FX prompt does not prefill a stored amount. Graph amounts, changes and weekly links are concealed; proportional bars and the highest-period annotation are omitted. Missing data, coverage, pending rates and calculation limitations remain readable. There are no amount-bearing tooltip/accessibility attributes in these consumers; browser assertions cover the DOM and accessibility tree, including closed details. This is presentation privacy, not encryption of the account's stored financial records.

Ownership: #1018 remains separate at c708cc6f9e0b7b22de593b899e98c3a7020f1ea2. It overlaps Home.tsx and FinancialStatementImporter.tsx. This change touches presentation there, preserving importFile/confirm and the compensation engine. It does not merge or supersede that PR; a future reconciliation must preserve both the taxi/import safeguards and visibility formatting.

Validation: TypeScript, production build, synthetic actual-app Chromium tests at 390px and 1440px (complete/multi-currency/partial/empty), Enter/Space, DOM/accessibility concealment, exact text round trips, navigation, period/account changes and reload. Real PDF.js review paths use locally generated synthetic payroll and per-diem PDFs without confirming/saving them. The existing financial statement, owner, salary diagnostic/caller and PDF export regressions remain applicable. The financial workflow runs the new privacy browser regression and retains synthetic screenshots as an artifact.

References were unavailable locally because Library downloads failed. The redesign remains pending. Synthetic visible/hidden screenshots were created locally; Library upload separately failed with a network error before upload. No images with real data were used in code or fixtures.
