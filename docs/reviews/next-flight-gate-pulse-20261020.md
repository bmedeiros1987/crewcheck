# Next-flight boarding gate: automatic pulse alignment

Base: published main d54ba1df (#1140). No live flight-status query, manual-gate change, credential access or provider activation was used for diagnosis. The existing public Radar health endpoint reports configured sources; that proves configuration only, not coverage or a gate for a particular flight.

The screenshot establishes an upcoming-flight card without a gate. It does not establish which occurrence the user's manual value belongs to, whether it was saved, or what an external source returned. No manual value or storage record from the user's device was inspected or changed.

## Reproduced cause

The card uses `selectNextFlight`, skipping a departure more than20minutes in the past. Home's automatic Radar pulse instead received `nextRealFlight`, which keeps a canonical flight active until its end. During an airborne first leg, the card advances to the second departure while automatic polling keeps querying the first leg. The quick-roster gate card only reads cache, so the displayed upcoming flight can receive no automatic refresh.

An offline counterproof runs the actual Home call/pulse and real canonical selectors: synthetic05:00–06:45 first leg and07:30 second departure at05:42BRT produce cardLA4002/pulseLA4001 on the baseline. The fix makes the existing pulse reselect from the same events with `selectNextFlight` on every check, while retaining the still-active occurrence through `nextRealFlight`. It rotates between distinct due targets, making at most one fetch per existing five-minute check. A fresh target is skipped; unavailable sources cannot starve the other target. When both are distinct and stale, each receives a turn every ten minutes. It preserves the five-minute cadence, fresh-cache suppression, authentication/owned-roster/date/source-occurrence gates, response fencing and provider routing. No new timer, increased per-cycle query budget, provider, paid activation, force refresh or real query is added by validation. Reselecting inside the check also handles a boarding transition without requiring a parent rerender. Weather/current-flight selection is unchanged.

## Source, cache and manual boundaries

`fetchRadarSnapshot` still binds the canonical UTC departure and origin-local date; the server requires the owned published occurrence before calling existing providers. The reader accepts only explicit planned occurrence evidence. Departure gate remains separate from arrival gate and aircraft position; wrong route/day/instant or unproven evidence is rejected. Existing six-hour cache retention and30minute source freshness remain unchanged.

Manual identity remains account + flight + published date + route, with unchanged storage keys/read/write/remove behavior. A saved manual gate wins over accepted source data; divergence stays visible. A gate saved for another occurrence is never silently copied. The automatic pulse never calls the manual writer. The card's empty-state wording now says automatic gate is not yet confirmed, instead of asserting that no external source supplied it when the UI has only an empty cache.

## Validation

The new raw/prepared regression exercises actual Home call/pulse, real canonical selection, fresh cache, unchanged cadence, later boarding transition, no future flight, cleanup, active/boarding fairness under unavailable sources, per-cycle one-query budget and manual identity/precedence. A browser fixture combines the actual Home pulse/fetch/cache functions with actual card/manual editor: local-only HTTP proves outgoing flight/date/UTC identity, accepted gate propagation, manual save and retained precedence/divergence, and rejection of another route in three device timezones. All fixtures use fictional identities and dates; all external origins are blocked. Existing provider/source/binding/authority/cache/manual/watch tests remain required. No real message, notification, provider query, account write or native publication is part of validation.

Home diff is limited to the Radar pulse and its call site. Profile-name hunks, financial/regulatory engines and #1140 remain untouched. HOLDs #1128/#1135 and pending provider/FS integrations are not imported. Independent exact-HEAD review, all PR comments and terminal CI must be reconciled before merge/publication. A source without a boarding gate must still display an unconfirmed value; this fix does not manufacture coverage.

The first candidate replaced the active pulse outright. Automatic review correctly identified loss of periodic active-flight status/arrival updates (P1). It was not merged. The final bounded round-robin preserves that consumer while covering the upcoming gate card; tests exercise both targets and rejected responses before asserting manual preservation.
