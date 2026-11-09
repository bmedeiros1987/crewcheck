# Optional screenshot import in the canonical stay editor

## Scope

First vertical: browser/PWA file picker → local OCR → editable/selectable review → local draft → existing explicit Save. No new backend/schema/sync, provider login, MyCrewCare session, paid service, third-party sharing, export, notification job or Android release. Android wrapper is deliberately unavailable in this UI until its PDF-only chooser and persistent image URI grant are addressed and validated separately. The existing PDF/financial/share pipelines are untouched.

A screenshot is an untrusted source, **not** authenticated MyCrewCare. Only `kind=stay` with a unique selected roster identity can use the feature. The target stay is visible. The user selects each group (hotel / hotel APZ / transport); defaults are unchecked. Applying the review only changes the editor draft. The existing Save button is the only operational persistence action. Sharing remains a separate existing preference, off for new records; import neither grants nor revokes an earlier user's choice.

Hotel room is never an OCR candidate and is always preserved as manual CrewCheck data. Pickup, hotel APZ and flight clocks are distinct. The parser requires explicit labels, never guesses year or timezone, and rejects ambiguous/conflicting records. APZ and transport are atomic groups: replacing a partial screenshot APZ clears its absent date/zone rather than borrowing a previous one. Screenshot APZ remains unconfirmed until the existing explicit hotel-hall date/time/IANA checkbox; only then does operational APZ provenance become `manual`. Input provenance remains `screenshot` separately. Missing/invalid/ambiguous dates, zones and DST instants cannot become a confirmed operational APZ.

## Retention and removal

Selected PNG/JPEG/WebP bytes, decoded pixels, OCR text, raw evidence and preview URLs are transient RAM only. Cancel, replace, logout, auth expiry, account storage event, pagehide, selected occurrence change/removal/duplication, discard-draft and unmount terminate recognition and revoke preview URLs. A result never updates an editor field by itself. Fields manually edited while recognition/review is open win over stale candidates.

Only normalized selected operational values and small allowlisted provenance are saved under the pre-existing authenticated account-local stay key. Provenance stores each imported field's value and previous manual value so the user can remove imported fields without destroying older manual data. It does not store OCR lines, source image, filename, reservation numbers, credentials or tokens. Removal restores only still-matching imported fields; manual changes made after import win. The user must explicitly Save the removal. APZ restoration requires confirmation again. Unselected draft fields are not normalized or erased as a side effect.

Transport is a passive private editor reference, restored on reopen. No transport field is mapped to hotel APZ or published roster facts. Saving/importing/removing never programs or reactivates a canceled alarm, replaces an existing wakeup job, changes breakfast/lead overrides or makes a network mutation.

Only immutable public OCR models may be cached; they are not user data. See `README.md` for the exact worker, assets, hashes, licenses, network boundary and byte budget.

## Validation gates

- Pure parser/provenance, account-scoped persistence, worker cancellation/signature/network fixtures, existing APZ/editor/timezone/projection/details contracts in three process timezones.
- Real synthetic PNG/JPEG/WebP pixels through shipped worker/WASM/models, actual review component and canonical editor in CI Chromium. Fake-worker lifecycle tests are not OCR accuracy evidence.
- Explicit selection/decline/apply/save/reload/removal, manual edits, owner/session/occurrence fences, partial dates/timezones, blank/conflicting text, corrupt/oversized MIME/signature inputs, failures, timeouts and revocation.
- Same-origin GET-only asset traffic; no screenshot/recognized text upload or unintended API write; storage excludes raw input and allows only normalized selected operational fields plus public-model cache.
- Raw and canonically prepared TypeScript/build and browser bundles, preparation idempotence; current dependency audit and independent exact-snapshot review before branch/PR publication.

Local Chromium remains unexecuted because of the known sandbox restriction. Functional/visual acceptance requires successful exact-head CI pixel tests; Android/device support is not claimed by web CI.
