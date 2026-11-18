# Ordinary payroll rest label

The DSR evidence producer accepted `DSR` and `Descanso Semanal Remunerado`, but silently omitted the ordinary printed label `1330 Repouso Remunerado`. A synthetic, fully reconciled payroll differing only in that label reproduced the failure: extraction was complete, while `payrollDsrDraft` was absent.

Accept the exact ordinary synonym through the same anchored label match. Keep the existing reconciliation, employer/role, eligible basis, unique regime, account, source revision and payroll/operational-month checks. Adjustments, vacation and complementary labels remain ineligible. No arithmetic, tariffs, financial settings, stored records or future-month applicability change. Existing confirmed entries are not rewritten; only a subsequent reviewed import can enrich the archive.

The regression exercises extraction, reviewed cycle, immutable archive and the actual operational-month context reader. It checks equivalent labels, mismatched totals, adjustment labels, idempotent reimport and other-account/other-month isolation with fictional amounts only.

Local validation: six relevant regression entry points in UTC, America/Sao_Paulo and Asia/Tokyo, both raw and canonically prepared sources (36 executions), plus canonical TSC and build. Build succeeded offline using existing OCR model files, whose hashes are verified by the normal asset builder. No local npm audit was run.

This repairs evidence recognition, not a complete forecast inventory. Home still marks estimated variable categories incomplete because no producer establishes an exhaustive category inventory; date coverage alone does not prove it. The change does not assert a complete salary, apply historical payroll to October, infer absent additions/deductions as zero, or activate currency lookup. No personal documents, screenshots or account values are included.
