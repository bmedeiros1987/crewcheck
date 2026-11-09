# Local recovery and observed salary statement

Base: published main `031ce12acc999cbe5c63f05c41885c40032a30e7`.

The real salary producer retains observed component cents while its exhaustive
inventory stays incomplete. The statement header previously discarded those
cents by requiring the complete-salary diagnostic. It now displays a partial
gross subtotal for whole operational months only, with current account/month
fences, duplicate-month rejection and safe integer checks. Unknown observations
remain absent, explicit zero stays known, and no deductions are subtracted from
an incomplete gross. This does not change tariffs, DSR or payment rules.

An unavailable ACT storage read now offers an explicit read-only retry on the
same device. It reuses the journal validator and existing calculation event;
it never writes, recreates a declaration, synchronizes another device or retries
automatically. Invalid bytes remain blocked. A valid saved declaration is not
proof that any particular user's screen currently has access to that storage.

## Integral salary remains blocked

`consumeSalaryDsr` still returns `inventoryComplete:false`. The existing model
accepts complete components, but there is no complete occurrence/category
inventory producer. A publication fingerprint, day coverage, scalar amount or
empty array does not certify this inventory. Before extending import/persistence,
the missing source contract must identify:

- Owner, company/category/regime, operational competence and publication revision.
- Planned, executed and paid scenarios separately, with complete source scope.
- Each occurrence and applicable rubric, plus authoritative explicit empty
  categories; absence of a record is not zero.
- Rubric eligibility, effective tariff/source and original amount or calculation
  evidence, including training/additions without duplication.
- Revised/revoked/conflicting sources and the distinction between operational
  month, payroll month and expected credit month.

No new parser, storage or source certification is introduced here. ACT journal
recovery cannot complete this contract. The Wednesday–Tuesday work interval and
expected Thursday credit are separate existing concepts, unchanged. All fixture
amounts are synthetic estimates, not verified personal salary or bank payment.
