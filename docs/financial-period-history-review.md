# Financial periods and history review

Owner-only forecasts now offer week, month, year and custom civil-date ranges. Saved roster periods are selected by canonical crew identity and newest revision; conflicting revisions and missing months remain unavailable. Graphs and totals use the same range and native currency. Opening history does not activate or save a roster. Authentication changes clear pending results and statement state.

Salary calculations exclude adjacent-month events using the canonical display timezone. Monthly fixed salary is not prorated into weekly totals. Historical forecasts are recomputed with current configured rules, not immutable payroll or payment records.

The optional statement comparison reads a PDF locally using the existing parser. Repeated declared totals are deduplicated; declared payment dates do not prove settlement. Comparison never writes calibration, uploads the document, or offsets advances. Item-level and executed-roster reconciliation remains necessary even when totals match.

Validation: baseline salary scope regression fails with adjacent-month events; corrected production functions pass in UTC, America/Sao_Paulo and America/New_York. Prepared build and TypeScript pass. Compiled browser QA passes 22 existing visual scenarios plus four history scenarios covering themes, desktop/mobile, filters, missing months, revision selection, foreign crews, account changes, guest access, salary boundaries and a synthetic PDF. All fixtures and screenshots are synthetic.

Remaining review requirements: independent review, exact-head CI and reconciliation against the actual operational items for the reported discrepancy. No payment source or confirmed-payment ledger was introduced. CrewCierge transport and concurrent WhatsApp work are untouched; the existing owner financial read-model remains the integration contract.

Revision after independent review: the selected current month participates in latest saved-revision resolution, and ambiguous revisions remove its source from totals and document coverage. PDF work dates request their own months independently of the visual filter; partial or conflicting coverage cannot display an integral difference. Adjacent-month rows do not substitute for nominal source coverage. Updating configured FX invalidates all parent snapshots. The repeated competence header was removed from filtered views; conversion captions use the selected work interval. Mobile controls stack with selected-text width and caption-line assertions. The KM source warning preserves the canonical guard text.
