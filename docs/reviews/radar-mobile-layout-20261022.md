# Radar: compact responsive layout

Base: `6269b5100a5db25fbcd90696747cd95829221795` (published main).

## Scope

- Followed-flight identity and UTC date have separate layout rows; cache provenance and Stop have separate wrapping groups.
- Compact cards, short action labels with decorative icons, and optional source-quality details. Missing operational data, manual origin and conflicts remain explicit.
- Radar-only CSS retains 44px touch targets, visible keyboard focus, enlarged text, and clearance based on the existing footer height. No global footer redesign.
- The existing follow-flight and contextual-navigation materializers are preserved; only rendered markup and exact UI anchors change. Account/occurrence/session guards, provider calls, manual-field policy and operational evidence are not changed.

## Ownership

Checked open work before editing: #1191 Radar evidence, #1179 gate OFF, #1031 weather HOLD, #1039 PDF HOLD, #937 Concierge read-only and #919 global footer. No work from those branches is incorporated or overwritten. Home changes are limited to Radar rendering and one scoped CSS import; #1031's operational weather logic is untouched. No native/store, paid service, credential, permission or notification activation.

## Verification

- Raw TypeScript and clean canonical preparation/build are required.
- Existing followed-flight isolation/persistence, navigation-context, manual-field/review and next-flight-gate fixtures remain in force; the new structural gate also runs with synthetic data.
- `radar-mobile-layout.yml` checks out the literal PR HEAD and runs the actual prepared Radar/Follow/ManualGateEditor/BottomNav against the shipping CSS on the existing CI runner. Twelve cases cover 320/390/430/1440, light/dark, and 200% text on 320/390. It retains full-page and footer screenshots, geometry, source hashes and a network audit.
- Browser transport is explicitly mocked unavailable before network I/O. Real renderers, cache admission, manual-field resolution, follow persistence and stale-handler fences are retained. Existing remote document font is omitted and the known synthetic-airline image request is blocked, so screenshots use local fallback font/logo. No actual provider or account is exercised.
- Local Chromium was not launched or installed because its execution is restricted. Syntax, network-policy and bundle-only modes do not resolve Playwright. A successful bundle is not a visual pass.

Keep the PR draft/HOLD until exact-HEAD CI, screenshot inspection and final independent review are complete. This document does not claim production publication or authorize bypassing a review quota.
