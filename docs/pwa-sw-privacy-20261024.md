# Service worker private runtime boundary

Successor to #1230, based on main `3d506335ff7a293a9eb6c199682f5d88764d5039`.
Mobile Core transferred only this privacy sub-scope in #825 comment6382480929;
#825's shared-PDF work, candidate and physical acceptance remain separate.

The prior generic GET handler cached an authenticated/no-store synthetic JSON
response outside `/api` and could replay it after account switching. This is a
synthetic counterexample, not evidence that production user data was exposed.

The correction blocks credential-bearing requests from generic cache lookup and
admission. Runtime caching accepts only same-origin static asset paths, known
public query keys, matching media types and explicit public/max-age responses,
rejecting private/no-store and sensitive Vary responses. Stored request headers
are validated on lookup; runtime writes use a fresh URL-only request. Arbitrary
origin-wide `caches.match` is removed. Existing build caches can serve explicitly
listed public shell assets (including no-store build downloads) and validated
public runtime assets, so still-open older documents keep their build chunks.
Activation selectively removes unsafe entries from owned runtime caches under
the existing lifecycle lock. It does not delete entire caches, PDF or OCR data.
Lookup remains fail-closed even if cleanup fails or an older worker writes again.
An already controlling old worker retains its old behavior until normal explicit
activation; this does not forcibly reload tabs or bypass update consent.

Tests exercise actual worker code with synthetic caches/network and real Chromium
worker activation, seeded legacy runtime/shell/unrelated caches, authenticated
and no-store admission, A→B offline replay, old public chunks, public runtime,
PDF receive/read/single-use, OCR preservation and offline shell. Existing update
lifecycle/retirement gates cover old/new workers, pending installs and old tabs.
No real account, token, message, permission prompt or external provider is used.
No Play, environment, credentials, channel activation or deployment changes.
