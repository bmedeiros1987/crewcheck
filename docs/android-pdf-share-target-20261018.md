# Android PDF share target — candidate, no store publication

The exact internally distributed144158 AAB has SHA256
`f2f83e1ff301c2b24d45a41a637f51a959dda2bc4743b41e978d7f0185b15a32`.
Its freshly dumped base manifest has two SEND filters requiring scheme `content`
for `application/pdf` and `application/octet-stream`. MainActivity is exported,
with no activity alias. VIEW accepts PDF content/file URIs; SEND_MULTIPLE is not
advertised or handled by the current receiver.

A normal SEND can put its content URI only in EXTRA_STREAM or ClipData while
Intent.data is null. Actual Android15 IntentFilter matching reproduces that the
published scheme requirement rejects this shape. This candidate removes only
those two SEND scheme attributes. VIEW, MIME types, permissions, receiver,
parser, account/session policy and the existing native ACK path stay unchanged.
No wildcard MIME type or unsupported multiple-file import is added.

The screenshots do not establish the emitter's actual MIME/intent, installed
native package/version or installation profile. One screenshot already shows
“CrewCheck — Roster Inte…” on the Personal tab. That matches the PWA manifest's
long name; it is not proof that the native package is installed in that profile.
Therefore the framework defect is demonstrated, but the specific Crewtopia
intent and physical-device outcome still need verification.

The JVM regression uses the real Android Intent/IntentFilter/Uri/ClipData classes
from pinned android-all15. It runs the extracted production receiver/reader and
warm-entry method with synthetic PDF bytes and controlled resolver, lifecycle,
UI-error and dispatch boundaries. It verifies discovery, EXTRA_STREAM, prepared
ClipData fallback, cold/warm byte reception, VIEW retention, denied grants,
invalid PDF signatures, missing URIs and rejection of unsupported actions/types.
The strict test fails against the actual144158 manifest. It does not prove OS
permission delivery, parser/account dedup, WebView/session recovery or physical
Crewtopia integration. Existing canonical import regressions remain required.

The related PDF ACK/session candidate#1039 remains separate and HOLD. Its
prepared manifest also removes this SEND requirement; this small correction
does not integrate or approve its broader receipt/session changes.

Safe workaround: save the PDF, then use the existing Importar flow and
“Escolher PDF no dispositivo”. That button was located in the prepared app
source. Do not send personal PDFs to an external reviewer or install a new
candidate on the device without review and release criteria.

Before release, Bruno must confirm native package/version and Personal/Work
profile, then test a reviewed internal build using one authorized PDF through
Crewtopia, cold and warm, checking one import and correct account/month. No
physical success is claimed by this patch or its synthetic tests.

Reference: [Android receiving shared data](https://developer.android.com/develop/ui/compose/sharing/receive)
and [intent filters](https://developer.android.com/guide/components/intents-filters).
