# Explicit web update consent

The existing App update-notice placement now hosts the native Play offer and a
separate PWA worker offer. Android keeps the existing eligible Play version-code
event and official store link; no web release comparison, native flow or APK is
added. Labels are Atualizar agora / Depois. An older installed APK without that
bridge cannot infer an eligible update from the web UI.

PWA discovery only checks for a waiting worker whose complete precache is proven
by its own metadata. The build stamps the worker with a fingerprint of the served
entry HTML and a distinct cache namespace, even when the marketing version stays
the same. A mismatching served index or missing JS/CSS rejects installation. A
release announcement is never interpreted as a completed download.

The coordinator no longer activates on idle or hidden state. Atualizar agora sends
explicit consent bound to the downloaded build; controllerchange confirms the
active worker but never reloads any tab. To preserve forms/imports/operations whose
save state cannot be inferred globally, the updated page opens only through a
second explicit link in a new tab. The original document remains open. A dropped
ACK, failed activation, offline check or missing controllerchange is unconfirmed,
not success. There is no automatic retry/reload loop.

Depois is remembered per build for 24 hours and synchronized through origin-local
storage; memory handles blocked storage. Storage and controller events do not
reload other tabs. Native shells hide the PWA notice. The install notice, when
composed separately, is hidden while the update notice is visible.

Activation preserves old cache versions while windows remain open, and old chunks
can be read offline by those documents. Existing shared-PDF storage is not deleted
by the update action. Obsolete cache cleanup is deferred until activation without
open windows; long-lived tabs can retain additional browser storage until then.
Browser eviction/quota and physical iOS/PWA behavior remain validation limits.

Tests use actual workers on localhost and simulated controller failures. They cover
incomplete/mismatched downloads, explicit consent/defer, two tabs, offline, old
form/action values, controllerchange without reload, retained old assets, explicit
new-tab loading, ACK rejection/loss, missing controllerchange, cleanup, SSR and the
existing Android Play UI. No real install, permission, subscription, provider,
credential, account mutation or store publication occurs. Push/ACK/fallback gates
and all Android/security HOLDs remain unchanged.
