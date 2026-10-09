# Menu scroll and compact controls: first review slice

Base: main `1f8e9efee877837605a086bc11c3887167ba4918`.
Concurrent PR #933 (`fix/push-readiness`) is outside this change.

## Diagnosis

The canonical source already creates a fixed menu overlay with a dedicated `.cz-menu-scroll`, keyboard Escape, a focus trap, focus restoration and body-class cleanup. Several older CSS layers also describe the entire panel as scrollable. Favorites have their own two-column chip layout rather than the menu's icon-and-label rows. No reusable user text-size preference was found in the inspected TypeScript source; existing appearance settings select themes.

## This slice

Explicitly keep the menu panel non-scrollable and its content independently scrollable, preserving the header and bottom safe-area clearance. Favorites form one column with an icon at the left and an 8px gap before wrapping text. Alert action buttons retain at least 44px height while using compact padding. Alert data, classification and handler behavior are unchanged. The approved bottom navigation and financial engine are unchanged.

## Verification

Canonical preparation, TypeScript and Vite build passed. Chromium component/CSS QA passed 56 cases: nine viewport modes, light/dark themes, root text sizes 100/150/200%, plus two rotation cases. Assertions cover containment, touch targets, label contrast, favorite alignment, header position during scroll, one menu scroller, and the last destination being reachable. Fixtures use synthetic account data; no production APIs or records are used. The harness renders the real prepared MenuDrawer with shipped styles. It does not establish full-app or physical-device acceptance.

## Outstanding before completing the broader UI request

- Add and validate a user-facing text-size preference across essential app content; root-size QA of the menu alone is not that feature.
- Exercise interactive full-app keyboard/back/cancel/dismiss and modal/body-lock recovery, plus the approved bottom navigation with last-item clearance and safe areas.
- Independently review the draft and screenshots before merging or publishing.
- Reference images `112742.jpg`, `112743.jpg`, `112744.jpg` were resolved with official Library metadata, but all three official transfers returned HTTP 403. No image bytes were materialized or pixels inspected on this Mac. Visual comparison with those references remains blocked.

Real allowance reconciliation is a separate task. The supplied statements alone do not establish the cause of the app's different amount or bank settlement. No real documents, personal values or screenshots are committed here.
