# Monthly net estimate: context and privacy checkpoint

Base: 13cb5a556879e0ab4540b6ee069b592e18378e2b. This increment uses the existing
PayrollNetEstimate component mounted by PayrollPaymentCard. It does not introduce
another calculator or change tax tables, payroll producers or deduction writes.

## Reproduced on the base

1. A synthetic approval survived rapid A→B→A (checked states false,true), because
   it was keyed only by recurring owner/token text. Same-token return is not the
   same authenticated generation.
2. Financial masking removed the digits but left the negative-adjustment
   classification in the DOM.
3. A gross value whose conversion to cents was unsafe could still be displayed
   as a complete net when all deductions were explicit zeros.

## Protection

Approval now holds the existing canonical auth-generation capability. Changes in
amount, contribution/payment month, session text or completeness revoke approval;
returning to the previous context does not restore it. A stale queued checkbox
update checks the captured auth generation and context revision again. No global
auth implementation is changed. Session capture/validation fail closed when
storage is absent, blocked or becomes unavailable after approval; an independent
review finding was reproduced before that correction (SSR localStorage error). Invalid/overflowing cent arithmetic remains
pending, with an explicit reason. The signed deficit remains visible for review
when money is shown; both its digits and classification disappear when hidden.

Reviewed current-month deductions retain precedence. Missing offsets remain
pending, explicit zero remains distinct, and a partial gross only produces a
partial balance. Ordinary-monthly tax estimates still require the existing
explicit premise and the versioned 2026 catalog. No vacation or 13th tax context
is manufactured. Main salary totals/inventory gates are unchanged.

Synthetic public-table vector: BRL5000 gross, one employment, October2026
contribution and November2026 payment, simplified monthly IRRF, and explicitly
reviewed BRL100 personal offsets: INSS501.50 (existing per-bracket truncation),
IRRF0, estimated balance4398.50. This is not an account's payroll or payment.
Sources remain financialTaxReferences.ts and financialReferenceCatalog.ts;
no rate/formula modifications. Do not interpret a passing vector as validation
of any real user's taxable base, loans, deduction coverage or gross inventory.

## Separate vacation/13th dependency

#1113 remains open/draft at90d5e181fbe91ecb581fd88cc2579bcb1c68aee8, conflicting,
with no comments, assignee or session owner in its metadata/body (read2026-11-11).
Its FinancialStatementImporter.tsx and deduction-review paths are not touched.
Ownership has not been reconciled merely by GitHub authorship or age of the PR.
The automatic benefit producer still needs acquisition/concession, average/basis,
service/avos and reviewed offsets with source/owner/revision. The separate local
planning candidate f15e7253 is preserved, not included here or published.
