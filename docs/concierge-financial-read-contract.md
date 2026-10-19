# CrewCierge financial read contract — coordination packet

Inventory base: e079bc641d902cc9004cf5a72ca800abd22418e5. This delivery adds only characterization tests and documentation. No live bot wiring, financial calculation, ledger/schema/auth change, scheduler, operational flag, actual account read or message is included.

## Published sources to reuse

| Existing source | What it establishes | What it does not establish |
| --- | --- | --- |
| `GET /api/platform/finance/upcoming` / `shared/financialUpcoming.mjs` | Latest owner-bound persisted forecasts, 30 civil days by expected payment date, original minor units/currency, at most 3 mixed-category events, partial/empty states | Work competence, per-event revision/update/provenance, an allowance-only complete view, Telegram financial authority or production activation |
| `GET /api/platform/finance/history` / `shared/financialReadModel.mjs` | Explicit work period, latest revision, ruleVersion/sourceId, separate categories/currencies/statuses and missing amounts | Timestamp of the canonical captured snapshot, proof that it equals the open app estimate, automatic payment confirmation or Telegram authorization |
| `CanonicalForecastCapture.tsx` and canonical capture/producer modules | Explicit owner-reviewed capture through the existing producer | Automatic capture by render/import, a proof of deployed schema/flag or populated current accounts |
| `ConciergeFinancialPreview.tsx` | App reader of upcoming; only on `FINANCIAL_LEDGER_NOT_ENABLED`, it can use `localUpcomingAllowance(useHomeFinancialEstimate())` from this authenticated browser session | A backend snapshot for Telegram. This session-local result must not be reconstructed from the bot roster or overnight stays |

No relevant source changed since the prior inventory. Runtime ledger default is OFF; docs still separate actual production migration/enablement and capture activation from published code. This task did not inspect/change production flags, databases or protected accounts. Whether a given real account has a usable persisted snapshot remains unconfirmed.

## Ownership and coordination

Financial workstream: active draft #1113 (observed HEAD90d5e181) reviews local payroll deductions and explicitly leaves application/rollback disabled. The separate IndexedDB monthly prototype is also unactivated. Neither supplies a new server-side allowance snapshot contract. Existing #888 WhatsApp and #909/#910 briefing drafts are reference-only here and are not imported or activated. #1114 Wakeup and #1111 reminder cancellation remain outside this task.

Open PRs were inventoried before code. The financial, ledger, app, Home and scheduling files are read-only for this slice. New files are this packet, `scripts/tests/telegram-financial-read-contract.test.mjs`, and its test-only CI workflow. Approval of the minimum read contract below remains with the financial workstream; no new DTO approval is claimed.

## Minimum dependency before /diarias can show amounts

1. Financial owner confirms an existing enabled and populated authoritative source, or explicitly retains `unavailable`. No migration, activation or actual financial write is requested by this test-only slice.
2. The host provides a reviewed server-internal owner-bound read for the validated Telegram link. Existing HTTP JWT authority must not be fabricated from `profile.email`, a callback, request parameter, or a copied browser token. Revalidate account/binding around async reads and before delivery, using existing identity rules; no JWT investigation or permission change is included.
3. One consistent read must supply allowance category/coverage **before** limiting/paging, work period bounds, original currency/amountMinor (including null vs zero), forecast status, source kind, nonprivate revision/capture timestamp and essential pending reasons. Reuse existing latest-revision, ambiguity and timing logic; no second calculator, copied rates, implicit FX or pernoite fallback.
4. Distinguish work competence from expected payment date/timezone. Missing dates remain missing; unknown coverage, original source or snapshot freshness cannot be asserted as current. Do not merge separate API reads into one allegedly atomic snapshot without a consistency token supplied by the owner.
5. Allowance-only filtering after the current mixed-category cap is insufficient: payroll/vacation/advance can occupy all 3 visible slots while an allowance remains behind `hasMore`. Do not report “sem diárias” from that filtered empty subset.

The requested enrichment is a proposal for the owner, not an implemented endpoint or asserted data availability. It need not expose raw statements, source documents, owner identifiers, private provenance references or internal record IDs to Telegram.

## Short bot result after the dependency is met

Proposed result: “Diárias · previsão salva\nTrabalho: [início–fim]\n[moeda original] [valor confirmado no snapshot, ou valor pendente]\nPagamento previsto: [data e fuso, ou pendente]\nFonte/revisão: [rótulo e atualização comprovados]. Recebimento não confirmado.”

Use existing bounded owner-bound callbacks with pages and Fundamento/Voltar/Início; bind details to the returned revision and refresh on account/source change. Keep the complete result short, preserving partial/coverage warnings. The currently verified direct destination is `https://crewcheck.online/?view=perdiem`, labelled “Ver Diárias”; no record/period deep link has been verified, so no guessed URL parameters are proposed. Add a more precise detail link only when the financial owner supplies the existing supported navigation contract.

Until then preserve the published unavailable answer and the existing app link. “No data” means an available empty authoritative source; “unavailable” means no confirmed usable source. Neither is financial zero. The task introduces no actual notifications or sends.

## Synthetic evidence

The new tests execute the published route and shared read model with synthetic host identities and an in-memory injected store; all write paths throw. They characterize owner isolation, invalid/visitor identity, default OFF and missing schema, read-only methods, work competence vs payment horizon, BRL/USD/JPY/KWD precision, null/zero, latest revisions, settlement exclusion, mixed-category truncation and missing compact metadata. These tests document the current contract and its gaps; passing is not approval to wire the bot or evidence of production enablement.
