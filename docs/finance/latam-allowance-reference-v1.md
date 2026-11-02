# LATAM/TAM allowance reference catalog v1

Scope is an **owner's local financial applicability declaration**, not employer verification. It covers TAM Linhas Aéreas S/A cabin or pilot ACTs only where clause 1.2 applies, excluding workers governed by Lei 7.064/1982. Brand, flight prefix, parser output, domicile, default rank, ABSA/Cargo or another employer cannot establish applicability. No user is silently enrolled; one explicit declaration per relevant period enables shared references, without monthly personal tariff entry. Declarations do not synchronize across devices automatically.

## Public evidence

- [Cabin ACT 2025–2027](https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf), clauses 1.2, 2.4.1 and 2.4.2.
- [Pilot ACT 2025–2027](https://aeronautas.org.br/wp-content/uploads/2025/12/20251209-ACT-Aeronautas-Pilotos-25-27_v13-site.pdf), same relevant clauses.
- [IBGE SIDRA table 1736](https://api.sidra.ibge.gov.br/values/t/1736/n1/all/v/all/p/202411,202511?formato=json): November 2024 index 7251.54; November 2025 index 7554.50.

Contracts run 2025-12-01 through 2027-11-30. Printed domestic meal floor is BRL105.04. Applying the stated index ratio gives 109.42843589; this implementation's half-up cent rounding gives **BRL109.43**, not 109.44. Quarter breakfast rounds to BRL27.36. Cent rounding is a calculation convention, not quoted contractual wording.

The separate product-administrator enterprise reference is **BRL109.44 meal / BRL27.36 breakfast / BRL27.36 taxi from 2026-01-01**, version `tam-allowance-admin-2026-01-v1`. It is not a personal confirmation by every account, a computed ACT floor, or payment evidence. Taxi amount/quarter ratio is not stated in these ACTs. The default ends at a **review boundary of 2026-11-30** pending the next domestic index; this is not a claim that the employer withdrew its rate. Before January, only the separately labelled computed floor can be projected. From December 2026, unestablished domestic values stay pending. Independently valid owned references keep their own scope.

## International native-currency minimum references

| Category | Printed floor | 2025-12-01 to 2026-11-30 | 2026-12-01 to 2027-11-30 |
|---|---:|---:|---:|
| North America | USD25.70 | USD28.70 | USD31.70 |
| Mexico | USD23.00 | Scope unresolved | Scope unresolved |
| South America/Caribbean | USD21.00 | USD21.00 | USD21.00 |
| Argentina | USD22.05 | USD22.05 | USD22.05 |
| Chile | USD25.15 | USD25.15 | USD25.15 |
| England | GBP24.00 | Scope unresolved | Scope unresolved |
| Europe | EUR23.00 | EUR25.00 | EUR27.00 |
| Africa | USD24.70 | USD24.70 | USD24.70 |
| Other positively known countries | USD21.05 | USD21.05 | USD21.05 |

The interaction of Mexico/England specific rows and the broad regional increments is unresolved: their printed amounts are inspection-only, not quantity projections. England is not all of GB/UK. Unknown airports/countries never become “other countries”. Each relevant route endpoint must be classified independently; a known origin cannot hide an unknown destination. Conflicting/unproved manual geography categories remain pending, while independently proved base breakfast/taxi retain their own location evidence.

All calculable international rows remain **minimum-reference projections**, not complete current company tariffs. The local-cost-of-living clause when paid in local currency is not quantified by the documents. Table currency does not establish settlement currency or exemption; USD can itself be local. No FX conversion, actual payment or entitlement eligibility is inferred here.

## Consumer and safety contract

- Valid bounded owned amounts, dated personal recurring references and existing manual amounts precede the shared catalog. Zero remains valid; a personal main meal alone does not consent to breakfast/taxi.
- Missing/unconfirmed applicability, malformed storage, unsupported scope, future index or expired ACT never falls back to the timeless printed table as an active complete forecast. Existing archive unreadability remains blocking.
- `referenceRows` and native `referenceTotalsByCurrency` stay separate from ordinary forecast rows. Each minimum-reference occurrence also supplies ordinary pending evidence, preserving incomplete total/delta/next-payment/capture guards. Range aggregation selects all snapshots then filters and recomputes the reference subtotal.
- Explicit preview/save, strict owner journal, session fences, Web Lock, revision and exact serialized snapshot comparison protect local changes. Reads and cancellation write nothing. No token is persisted in the journal. No migration, personal-source rewrite, production-account change, salary/geography/eligibility change, new service or permission is included.

Public source review date: 2026-10-25. Frozen normalized evidence SHA256: `45a30d8d7a3ffe0fbbd40d33d945f2834e639a5278f958b6a905c3259c9497b8`.
