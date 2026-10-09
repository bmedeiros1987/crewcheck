# Compact navigation, reading preference and overlay recovery

Base main: `1f8e9efee877837605a086bc11c3887167ba4918`. PR933 and financial calculation rules are outside this change.

The app already had a fixed bottom navigation and menu overlay, but competing CSS made menu scrolling and favorites inconsistent. The import confirmation could orphan a pending promise when another confirmation opened. No account-scoped reading-size preference existed.

This change adds local account-scoped 100/150/200% reading preferences in Settings, wraps essential text, and preserves the approved bottom navigation. The menu has one content scroller with its header retained. Favorites keep their semantic badge, with the icon left of its label. The Home operational-alert link is compact and retains a 44px touch target.

A shared overlay lifecycle restores body locks, original scroll and focus on Escape, browser Back, backdrop and cancellation. Nested dialogs keep the parent locked; duplicate import requests decline without deleting the active confirmation. Menu keyboard handling yields to an active child dialog.

QA uses synthetic fixtures only: actual app Settings/menu and financial views, the actual generated import-confirmation component, menu component interaction and responsive shell. It does not activate an import or exercise the complete PDF pipeline. Safe-area checks include a deterministic emulated bottom inset, not physical-device certification. Final reports accompany the private review package.

Independent review is required before merge/deploy. Reference images 112742.jpg, 112743.jpg and 112744.jpg resolved through official Library metadata, but all supported transfers returned HTTP403. No bytes or pixels were available on this Mac, so reference comparison remains blocked. The top brand/header remains in page flow; the fixed menu header and approved fixed bottom navigation are preserved. No real documents or account data are committed.

Real financial reconciliation and updated values remain separate. Statement deposit dates are not bank confirmation.
