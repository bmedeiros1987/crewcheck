# Operational experience recovery — 20 October 2026

Base: main 95cfbc4b. No provider activation, credential change, paid call, real flight query, notification dispatch or user-data write.

## Reproduced causes and changes

- The compact next-flight summary rendered a roster `Programado` without the origin qualifier already present only in expanded details. Operational fields now show no confirmation when evidence is absent, old or conflicting. The published schedule remains separately labelled as planning. A recent Radar response does not establish the provider's field observation timestamp.
- The prepared FlightAware selector ranks route/time, then the final guard checks flight identity. A wrong-ident row before an otherwise matching exact row can win the first selection and make the final guard discard valid data present in the same response. A synthetic counterexample fails against prepared main and passes with the response-owned unique exact-occurrence filter reused from #1143. Ambiguity remains no-data; healthy no-data no longer trips a global outage cooldown. No additional request or fallback is added. Actual provider response for Bruno is not available, so this is a confirmed defect, not a claimed incident attribution.
- Whole-journey duration was labelled with the selected leg and an unqualified base. Canonical measurement and regulation hydration preserve APZ and OP/PS legs in the sanitized three-leg fixture. The card now identifies the sequence, published base and endpoints; no duration calculation changes. Fixture clocks/routes beyond the supplied report are synthetic and do not reconstruct Bruno's actual roster.
- The current regulation shortcut opens the temporal scenario. It has no contextual Concierge bridge; legacy `/regulamentacao` chooses today's record rather than the selected journey. A deterministic explanation now reads the already admitted journey/reference/form/projection locally, explains known OP/PS/APZ data, separates arrival/engine stop/release, labels conditional references and focuses the next field to confirm. It does not call a model or the legacy endpoint, authorize an extension or assume composition/acclimatization.

## Reliability and manual occurrence fields

The explicit reliability requirement supersedes displaying uncertain values with a freshness disclaimer. Gate/status/registration each require exact flight/route/scheduled-UTC identity, a valid recent receipt and a separate primitive-string source observation tied to the field value. A source-produced custom gate update can prove only its own gate. Conflicts and stale/missing evidence hide automatic values; receipts are not renamed as observations. Automatic terminal is not confirmed merely because gate evidence exists. The projection records disagreements between matching source responses without choosing an operational value arbitrarily.

No current provider is advertised as producing a new status/registration observation contract. Unsupported automatic fields remain unconfirmed. The existing local manual editor/controller is extended for per-field status/registration and exact UTC occurrence storage; no second editor, Radar-cache write, server transport or synchronization is introduced. A manual value takes precedence and disagreement remains visible. Legacy gate records remain available for explicit confirmation rather than silently becoming evidence for a repeated occurrence. Field removal must preserve other fields and occurrences. Phone, FlightDeck materialization and watch projection use the same operational decision; schedule values remain planning.

## Notifications: event and delivery are separate

`saveRadarSnapshot` emits a gate-change event only for confirmed changed gates (or a proven newer candidate relative to manual choice). An unknown gate alone does not produce that event; no flight-delay notification producer was established in this path. The local notice passes account/review/deduplication, settings, background visibility and permission gates before invoking the native bridge/browser Notification API. A successful invocation is not proof of display or receipt.

The existing GET `/api/notifications/diagnostic` is observational and account scoped. It distinguishes absent/history/pending/failed/uncertain jobs and scheduler status; `sent` means provider accepted, with receipt null and deliveryConfirmed false. It explicitly leaves device/native/watch/Concierge delivery unobserved. No authenticated diagnostic from Bruno's device/account was obtained here, so permission, configuration, queue state and receipt remain unknown. Do not substitute global health or job completion for delivery.

## Remaining evidence needed

Actual sanitized published sequence (all OP/PS legs, clocks, APZ and release evidence), current delay estimate and applicable composition/acclimatization/profile conditions are needed to assess Bruno's specific duty. No legal deadline is confirmed here. The existing owner-scoped diagnostic result plus device notification readiness are needed to attribute notification failure. Provider entitlement/usage and Cirium activation remain a separate blocked workstream; existing FlightAware diagnosis does not depend on enabling it.

Additional code risk observed: the scenario deliberately invalidates source admission on authentication events until remount. Safe re-admission requires fresh source authority; this change does not bypass that account fence or attribute the incident to it without runtime evidence.
