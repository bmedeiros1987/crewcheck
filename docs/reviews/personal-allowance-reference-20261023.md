# Personal allowance references — forecast only

The previous statement remains an observation for its original dates. The app's bounded statement/month model is not evidence that an employer tariff expires every month. The consulted ACT sections (2.4.1 and 3.3.7) did not establish a monthly taxi recapture rule or a taxi amount. No official tariff or eligibility is changed.

Following the user's clarification that taxi works like the other allowances, this adds one shared action for main meals, breakfast and taxi: choose an already confirmed account-owned BRL reference, choose the first forecast date, and explicitly confirm reuse until alteration/revocation. No new amount entry or upload is needed. It does not activate on read or apply any premise to the user's real data.

The premise is stored separately from the immutable rate archive and ledger. Append-only revisions retain activation/revocation history and point at the original source fingerprint, amount, revision and observed period. A corrected/superseded source requires another review. A source valid for the queried date takes precedence. Reuse is a personal forecast assumption, never official ACT applicability or confirmed historical payment.

Account/session checks, expected-revision checks and same-origin Web Locks serialize writes. Unsupported locks refuse the write. Invalid/unavailable/missing active source blocks a complete national forecast rather than silently falling back. Same-account storage/config events refresh consumers; other-account changes do not adopt a premise. Existing APZ/base, BRT time boundaries, deduplication and eligibility remain unchanged.

Ownership: Home finance hunks coordinated with #1203 owner; importer untouched because #1113 owns unrelated changes there. #1212 FX changes are separate. Base bcfdcf8b90c48608f14ca24ed5bb85400319ea3b.

Synthetic coverage: actual archive/source parser, real Home caller, three timezones, recurring meal/breakfast/taxi after original dates, no monthly recapture, immutable source bytes, explicit start/revoke, queued account switch, concurrent stale activation, invalid/unavailable source, superseded revision, base/APZ cutoff and duplicate suppression. Browser exercises existing monthly confirmation plus the common archived-source reuse and revocation without changing the original archive.

## Confirmed document precedence — 2026-10-23

A synthetic counterexample reproduced an old unversioned account manual principal-meal setting overriding a confirmed printed reference even inside its documented interval. The Home caller now identifies every validated confirmed owner reference as confirmed for the existing resolver's priority, including printed observations. Personal recurring sources retain the same explicit confirmation and source identity. No global tariff, source amount, stored setting or observed interval changes. Outside the applicable interval without an active personal premise, the existing fallback remains. Breakfast still requires its own printed/confirmed price; no percentage is inferred from the principal meal. Raw/prepared three-zone counterexamples exercise the real Home config with the stale manual setting, and retain outside-period, source correction/zero, owner/session and revocation checks.

Composed current main2e2045fd by normal merge with no conflicts. Reused the exact CI-only browser mirror patch from ec156e50, including bytecode-free helper tests; no financial FX code from1212 imported. All existing tests, events, versions, permissions and timeouts retained. Exact-SHA CI/review and coordinated AIMS diagnosis remain gates before merge.
