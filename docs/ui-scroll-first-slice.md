# Compact navigation, reading preference and overlay recovery

Base main: `5fb5cf746c1a0cbf4af08634513b917b519435a5`. PR933 has been incorporated from main; its notification/BIDS changes and financial calculation rules are outside the authored UI change.

The app already had a fixed bottom navigation and menu overlay, but competing CSS made menu scrolling and favorites inconsistent. The import confirmation could orphan a pending promise when another confirmation opened. No account-scoped reading-size preference existed.

This change adds local account-scoped 100/150/200% reading preferences in Settings, wraps essential text, and preserves the approved bottom navigation. The menu has one content scroller with its header retained. Favorites keep their semantic badge, with the icon left of its label. The Home operational-alert link is compact and retains a 44px touch target.

A shared overlay lifecycle restores body locks, original scroll and focus on Escape, browser Back, backdrop and cancellation. Nested dialogs keep the parent locked; duplicate import requests decline without deleting the active confirmation. Menu keyboard handling yields to an active child dialog.

QA uses synthetic fixtures only: actual app Settings/menu and financial views, the actual generated import-confirmation component, menu component interaction and responsive shell. It does not activate an import or exercise the complete PDF pipeline. Safe-area checks include a deterministic emulated bottom inset, not physical-device certification. Final reports accompany the private review package.

Independent review is required before merge/deploy. Reference images 112742.jpg, 112743.jpg and 112744.jpg resolved through official Library metadata, but all supported transfers returned HTTP403. No bytes or pixels were available on this Mac, so reference comparison remains blocked. The top brand/header remains in page flow; the fixed menu header and approved fixed bottom navigation are preserved. No real documents or account data are committed.

Real financial reconciliation and updated values remain separate. Statement deposit dates are not bank confirmation.


### Review corrections: account select and large monetary groups
The mounted reading selector listens to account/session changes and resets to the current account preference. Whole currency/number/cents groups use nonbreaking spans; separate currencies may flow independently. At 150/200%, finance rows stack and amounts fit their available card width. Synthetic browser coverage now uses 1,234,567.89 in multiple currencies, measures glyph lines for complete currency tokens in cards and rows, and checks both the root preference and the mounted selector after switching accounts.


### Monetary contrast review correction
MoneyText introduces spans, so each token explicitly inherits its b/strong foreground instead of a global muted span color, and uses full opacity instead of the global translucent span style. Contrast checks now measure every actual money token in summary cards and finance rows, including real100/150/200 preferences, in both themes. The minimum required ratio is4.5:1; surrounding muted text checks alone are insufficient.
