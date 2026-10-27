# AIMS flight-source coverage in allowance forecasts

This is a **coverage guard**, not a new allowance rule, tariff, payment confirmation, roster repair or proof of company publication.

## Source contract

The existing AIMS parser records recognized flight occurrences before they can be omitted. It retains original source dates across the existing physical grouping and continuation recovery, then finalizes a versioned optional `aimsFlightSourceCoverage` witness after reader selection, merge and review.

- Reliable visual columns own their dates. Alternate linear text does not inject its warnings into those dates. A genuinely absent visual source date may use the existing secondary reader's evidence.
- Repeated occurrences remain a multiset, even when their flight numbers match. Identical repeated source blocks do not double the inventory.
- The witness records authority period, source dates, unresolved/unplaced date evidence, source occurrences and meaningful final published flight identities. Its checksum binds those fields and raw text for change detection only; it is **not cryptographic authentication**.
- Calculation rechecks the witness, original published-flight identities and actual projected flight occurrences. A cached `complete` boolean is not accepted as evidence. Changed/removed flights, unmatched projected flights, malformed metadata and unplaced source references remain pending. Benign crew/hotel annotations do not invalidate flight provenance.

## Scope and monetary behavior

Known meals and taxi items remain available as a **known subtotal**. No missing tariff, discarded flight or unknown source interval becomes a zero amount, invented entitlement, event or inferred arrival.

A source flight with an unknown endpoint can affect later dates. Coverage-only pending markers run from its proven source date through the snapshot's nominal **authority period**; that endpoint is not the duration of a flight or evidence of additional meals. Earlier complete dates remain independent. Missing source dates conservatively affect that source period. Invalid or changed authority produces undated pending, retained by reconciliation and payment guards.

Explicitly printed spillover dates retain their coverage issues for all-row/weekly consumers; they do not establish authority over a new month. Monthly payment and reconciliation consumers pair nominal monthly rows with nominal monthly pending evidence (including undated issues).

An independently witnessed later-month snapshot is assessed against its own authority. An unresolved previous snapshot is not silently deleted, and a range containing its affected dates remains pending. This does not establish a previously unknown arrival, reconstruct cross-month missing activity, or replace independent carry-in evidence.

Source coverage is currency-independent: an affected foreign-currency upcoming item stays partial. A BRL-only taxi tariff problem does not, by itself, invalidate an independent foreign item.

## Existing saved rosters

No stored roster, manual value or reference is rewritten or migrated. JSON persistence preserves the optional witness naturally. Existing valid evidence is reused.

A positively identified legacy AIMS source without supported evidence shows coverage unverified while retaining known rows. Reviewing or reimporting the PDF may provide new evidence; this is neither an automatic action nor a guarantee that an unreadable source will become complete. Other import formats and erased/blank source origins are deliberately unchanged. **This is not universal import-completeness certification.**

## Capturing a forecast

A review prepared from a complete source must not survive a change to incomplete coverage, even if its known monetary rows are unchanged. Home's capture identity includes completeness. The capture component also guards the current snapshot, operation, mounted lifetime and existing account session before submitting or accepting delayed results. An already-submitted request cannot be retracted; late responses cannot overwrite a newer source's review. No endpoint, server permission or consent policy is changed.

## Verification and limits

Synthetic regressions execute the public text/visual parser, actual Home projection, snapshot, scoped forecast and server-rendered financial component. They cover omitted and repeated flights, malformed/unplaced dates, continuation recovery, selected-source authority, JSON persistence, manual changes, legacy evidence, scopes, missing meal/taxi rates, native/converted subtotal separation, upcoming foreign items, undated reconciliation and capture identity. A separate controlled-hook suite executes the actual capture component with deferred promises and a transport spy, including stale confirmation, source/account switches, duplicate clicks, cancellation and unmount.

The existing financial workflow runs these tests before and after full canonical preparation, in three timezones, and retains its existing complete TypeScript/build/browser gates. Controlled hooks and server rendering are not browser or device evidence. Fixtures contain only fictional dates, rates and identities. No real account, API, SQL, provider, payment or corporate inbox is used.
