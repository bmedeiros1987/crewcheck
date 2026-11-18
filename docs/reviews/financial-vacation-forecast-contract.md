# Vacation forecast: reviewed scenario, separate from monthly payroll

Owner: Work. Based on main65a7dc07. This additive presentation contract does not
reopen closed, unmerged PR595 or import its seeds/averaging assumptions.

The existing Salary overview/payment surface opens an optional compact detail.
The scenario is ephemeral: switching account/token, logout, reload or remount
discards it. Nothing is saved to monthly settings, financial history or a server.
It neither reads private documents nor confirms an import, credit or bank receipt.

## Sources and limits

- Lei13.475/2017, arts67–71: 30 days, collectively agreed splitting, acquisition
  period remuneration and two-day legal payment deadline. Official text:
  https://www2.camara.leg.br/legin/fed/lei/2017/lei-13475-28-agosto-2017-785407-normaatualizada-pl.pdf
- TAM cabin ACT2025–2027, clauses3.2.1 (p14) and3.7.5 (p29): variable based on
  acquisition-period flown-KM average applied at concession; splitting15+15.
  Local public copy SHA25679d568813993a0d9f84c7adb915cebe4aa548655b7087fcb4efa50f2d4360628.
  This cabin rule is explanatory, not silently applied to pilots/other employers.
- Constitutional vacation third is shown separately. No sale of days is offered.

There is no automatic acquisition-period average producer yet. Neither a current
salary, geographic KM estimate, partial roster nor ACT floor becomes that average.
The user can review a sourced monthly remuneration average or an amount already
proportional to a particular gozo, excluding the third. Each gozo requires its own reviewed value, including monthly
averages: a concession cannot silently supply the other. Period amounts are never
proportionalized again. No generic moving12-month window is invented. This is a
user-reviewed scenario, not documentary verification by the application.

## Boundaries

Plan owner/revision, acquisition dates, gozo identity and reviewed source revision
are explicit. One30-day period, one15-day period or two nonoverlapping15-day
periods are supported. Missing dates cannot produce a deadline; the existing
financialVacationTiming helper retains calendar-day arithmetic without inferring
an employer deposit. A separate applicability declaration gates amounts/deadline.

Integer centavos, half-up per proportional component and then the third. Split
period rounding can accumulate across components (a synthetic three-component case differs by four cents); this is disclosed estimate arithmetic, not
proof of the employer's rounding. Known partial remuneration/third remains a
subtotal. Integral gross requires explicit complete remuneration review. Unknown
or malformed evidence never becomes zero; explicit zero remains valid.

Retentions, consigned loans and already-received advances are separate cash
reductions, bound to the particular period. They do not change remuneration or
create a tax base. Invalid/unreviewed deductions preserve valid gross but prevent
a net estimate. No ordinary-monthly IRRF calculator is reused for vacation, and
no INSS rounding rule is replaced. An advance is an offset, not a new negative
salary or an automatic second loan deduction. The source reviewer must distinguish
provision versus definitive deduction; the program does not infer either from MCP.
No MCP labels/amounts are installed as defaults or used in an average.

Net requires all cash reductions explicitly reviewed, including zeros. No default
schedule assigns all deductions to the second15-day period. No regular payroll
record, withholding, installment or financial-ledger credit is generated, avoiding
double-booking during reconciliation. Importing two pages cannot create two credits
through this path: it does not import pages or write credits at all.

## Remaining producer boundary

A later connection to the private payslip review must carry acquisition period,
document/row identity and revision, basis monthly/already-proportional, fixed versus
variable provenance, gozo, printed third, withholding/provision/advance identity and
reviewed completeness. It must reconcile repeated pages and settlement offsets.
Current monthly deduction settings and net-credit DTOs cannot be relabeled as
vacation evidence. Persistence/import integration and tax calculation are pending.
The current delivery offers no automatic forecast from a user's uninspected data.

## Validation contract

Synthetic pure tests cover30/15+15, independent dates, missing/zero, wrong account,
revision/acquisition/source mismatch, partial amounts, already-proportional basis,
retentions/loans/advances, duplicate IDs and overlap. Browser uses actual compiled
component and actual privacy control, explicit synthetic local identity and zero
external calls:320/390/1440, light/dark, keyboard, enlarged text, review and A→B→A.
The separate actual-app harness boots the prepared production bundle in18 cases:
320/390/1440, light/dark and UTC/Sao_Paulo/Tokyo, with computed text sizes doubled.
It checks the real Home integration, containment, pending net, and unchanged monthly
financial storage, with all API output stubbed and external requests blocked.
Text enlargement is simulated; no native accessibility zoom, screen-reader audio,
shipping-font availability, WebKit or physical-device acceptance is claimed.
Raw/prepared/build and exact-tree review results must be recorded separately.

Review hardening: source kind/document/revision/canonical item and component are required. Manual screen scenarios use explicit aggregate slots, not inferred documentary rows. Each gozo requires explicit retention, consigned and advance coverage, including reviewed zeros. Negative cash remains signed and requires reconciliation review. Entitlement and employer rounding are not assessed. Substantive edits clear all confirmations; changing a proportional period clears its amounts. Do not add this forecast automatically to monthly payroll.

## Account boundary under deferred rendering

Drafts are fenced by the existing auth generation as well as owner/token. A rapid A→B→A return, same-owner token replacement/return, logout/relogin or auth storage event cannot revive the previous scenario while React resets are deferred. Reset callbacks capture identity at the event; stale callbacks and edits cannot lend their old draft to the new context. Nothing is persisted. The browser regression deliberately defers resets using React transitions while forcing higher-priority renders, and checks dates/year, money and confirmations in both real components. It does not use sleeps or relax the original account-return assertions.
