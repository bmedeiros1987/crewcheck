# Financial entry keeps its page heading

In the main 0f8f89e1 compiled-app fixture, entering Diárias from Concierge with
no saved financial position scrolled to the payment overview. That card sits
below the normal-flow application header and page title. The scroll moved from
zero to approximately 293–298 pixels, leaving both headers outside the viewport
at widths 390 and 1440. This reproduced the reported missing-header entry; it was
not simply scroll inherited from Concierge.

The navigation hook now starts a fresh scope at the page top after its first
valid application. A valid saved history position remains higher priority, and
later internal financial screens retain their existing content alignment.
Account-scope guards, cancellation, focus with preventScroll, URL filters and
history state are unchanged. The marker lives only in the hook instance and is
set after the existing scope/root checks and successful position application.

The existing compiled-app focus regression also exercises salary and allowance
entry on mobile/desktop in both themes, internal back position/focus, and return
to a scrolled Concierge source. A synthetic margin expands only that source to
ensure nonzero restoration; financial layout uses the shipping CSS.

The separate Concierge-origin fixture also settles explicit scroll/focus before
measuring its baseline. Its existing restoration predicate, timeout, tolerance
and counterproofs remain unchanged; ordinary focus races remain in the four
legacy focus variants. An earlier origin run failed and its diagnostic copy
passed without capturing the cause, so that failure is preserved separately.

Accounts, rosters and values are synthetic, APIs are mocked, external requests and service
workers are blocked. This is browser evidence, not Android hardware, financial
calculation certification or publication. No financial calculation, persistence,
capture flag, permission or billing behavior is changed.
