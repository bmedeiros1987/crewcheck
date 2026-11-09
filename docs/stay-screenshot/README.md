# Local screenshot OCR: reproducible assets and privacy boundary

## Fixed inputs / reproducibility

- `tesseract.js` and `tesseract.js-core` **7.0.0**, exact npm dependencies + lockfile integrity. Official JS release: https://github.com/naptha/tesseract.js/releases/tag/v7.0.0 . Core: https://github.com/naptha/tesseract.js-core/tree/v7.0.0 .
- Fast English + Portuguese data from official `naptha/tessdata`, commit `806cd9adc8c6e8abc11c782db1818c990576bebc`, directory `4.0.0_fast`. `ocr-assets-manifest.json` contains actual byte sizes, SHA-256 and Git blob SHA-1 computed from downloaded bytes. Both model Git blobs match the upstream tree.
- `scripts/stay-screenshot-assets.mjs` only runs at build/development preparation, never in a browser. It verifies package versions and every artifact's size and SHA-256 before atomically installing public files in `client/public/ocr/v7/`. Official model downloads are immutable HTTPS paths, no redirects/fallbacks. A verified existing copy is reused. `--model-dir DIRECTORY` can supply the same hash-verified models in an offline build.
- Generated `client/public/ocr/` is ignored, copied by Vite to the existing site's `dist/ocr/`, and not part of the `/assets/` service-worker precache list. No new host, credential, permission or paid API.
- Re-running the asset preparation gives the same asset inventory (no timestamps). A 15.5 MB deployed-asset cap is enforced. Missing/incompatible bytes fail the build rather than falling back to a CDN.

## Runtime / lifecycle

Only the user selecting a file starts a worker. The implementation accepts one actual PNG, JPEG or non-animated WebP (signature and declared MIME consistency), at most 10 MiB, 12 million pixels and 10,000 pixels per edge. Header limits are checked before decoding; decoded dimensions are checked again. Browser decode converts input into a fresh PNG capped at 2,400 pixels per edge, strips metadata and keeps bytes in RAM. Animated PNG/WebP, SVG/GIF/PDF/HEIC, unsupported/corrupt inputs and mismatched MIME are rejected.

The direct v7 worker protocol intentionally avoids `createWorker()`'s asynchronous handle exposure: the native Worker exists before core/model initialization and can be terminated immediately. The only jobs used are `load`, `loadLanguage`, `initialize`, `setParameters`, `recognize`; OEM is LSTM-only, legacy is never enabled. Recognition has a 90-second total deadline including decode/init; abort/timeouts/errors terminate the worker, clear pending work, close decoded bitmaps and zero owned image buffers/canvas. Late decode after cancellation is closed. Output above 20,000 characters is rejected, not truncated to hide possible conflicting records.

The content-addressed entry `worker-f7266295819b4f8f.js` (our reviewed wrapper; SHA-256 pinned in the manifest and checked against the client path) allows `importScripts` only for the pinned worker and three LSTM core variants in the same `/ocr/v7/` directory. Worker fetch allows **only GET of eng/por public models**, with credentials omitted, redirects forbidden and HTTP cache bypassed (matching the existing server no-store behavior). CDN/API uploads, request bodies and other hosts/paths are rejected even if an upstream default regresses. Worker console output is suppressed. Tesseract `cacheMethod: none` disables its IndexedDB cache. A dedicated CacheStorage cache, `crewcheck-ocr-models-v7-18c1ac52-7b0f1749`, retains only these two public model files. Every cache read and network response is bounded to the exact expected size and checked against SHA-256; corrupt entries are discarded and refetched. Quota/private-mode storage errors degrade to verified downloads. The service worker bypasses only `/ocr/` GET requests before generic cache lookup/write; the OCR worker alone owns the two-model cache. No OCR asset enters shell/runtime caches or the `/assets/` precache list. Source images, filenames, OCR text and intermediate evidence never enter localStorage, sessionStorage, IndexedDB or CacheStorage in this module. The bypass leaves the PDF share-target, single-use PDF cache and all other routes unchanged; it does not incorporate PR #825 or #1039.

The review component owns and revokes the preview object URL and fences identity/occurrence before application. The module has no store, backend, provider, alarm or sharing imports. Candidates are not authenticated MyCrewCare facts, and no room field is extracted.

## Measured package / model inventory

| Asset | Uncompressed file bytes | gzip level 9 estimate (not measured HTTP transfer) |
| --- | ---: | ---: |
| worker.min.js | 111,307 | 33,805 |
| tesseract-core-lstm.wasm.js | 3,896,484 | 1,453,570 |
| tesseract-core-simd-lstm.wasm.js | 3,899,472 | 1,454,316 |
| tesseract-core-relaxedsimd-lstm.wasm.js | 3,905,767 | 1,455,779 |
| eng.traineddata.gz | 1,984,273 | already gzip |
| por.traineddata.gz | 1,009,185 | already gzip |

Three core variants are required by v7's non-SIMD/SIMD/relaxed-SIMD feature detection. Only one is requested per worker. Raw engine+model inventory is **14,806,488 bytes**; the complete generated output is **14,921,511 bytes** at this revision, including **3,924 bytes** of inventory and all wrapper/license notices. The builder prunes known obsolete wrapper files, rejects unknown extras/non-files, and checks the actual full-directory file-byte sum, not only selected assets. Cold raw transfer is approximately 7.00 MB (one core + worker + two models); compressed JS transfer would be approximately 4.48 MB **if** the actual server uses the estimated encoding. These are not claims of measured production transfer, mobile CPU/memory performance, offline support or Android compatibility. Browser CI separately measures actual first/second-import requests and timings; deployment/browser smoke testing remains required.

## Supply-chain and license evidence (2026-10-22)

Official npm acquisition succeeded through the normal environment route. Initial npm cache default was unwritable; using the permitted workspace cache fixed that without network bypass. Installation for the isolated audit used `--ignore-scripts`. `ocr-dependency-lock.json` records the exact isolated tree; `ocr-dependency-audit-20261022.json` is a successful npm audit with **0 reported vulnerabilities across 13 installed dependency packages**. The main app's complete dependency audit is a separate gate. This is not a guarantee that all native libraries compiled into WASM are vulnerability-free: npm advisories do not cover that entire native dependency graph.

The `opencollective-postinstall` 2.0.3 script was inspected: it reads its package JSON and prints a donation message unless CI/disabled; no network call, telemetry, subprocess, account or purchase action. No screenshot/data is ever present during dependency installation. Runtime distribution does not include that script.

Top-level JS/core/models are Apache-2.0. Unmodified license/notice copies are distributed next to the public assets, including native dependencies referenced by the pinned core's `.gitmodules` and worker bundle dependency notices. `license-sources.json` records immutable upstream sources; permissive MIT/BSD/ISC/zlib/IJG notices remain intact. OpenLibm explicitly identifies LGPL only for its test-double.c/test-float.c tests, not its library; those test programs are not distributed here. The worker wrapper is CrewCheck code, not an edited upstream binary. No model/runtime service is purchased or contacted at recognition time.

## Verification responsibilities

`node scripts/regression-stay-screenshot-ocr.mjs` checks signatures/limits, initialization cancellation, late decode disposal, error sanitization, timeout, input buffer scrubbing and worker model-only network allowlisting plus verified model-cache reuse/corruption/quota fallback. Its fake-worker outputs explicitly test lifecycle, **not OCR accuracy**. The independent browser CI suite must feed actual synthetic PNG/JPEG/WebP pixels through the real shipped worker/core/models and review/editor before this feature is considered functional. No local browser launch is used to bypass the known sandbox restriction.

`regression-stay-screenshot-service-worker.mjs` runs the real SW in a VM before/after preparation and with stamped build constants, including a negative baseline proving legacy duplicate caching, unchanged PDF behavior and strict `/ocr/` scope. Browser CI additionally exercises real OCR under an active service worker: public shell/runtime entries and legacy empty notification IDB are snapshotted before import and must remain byte-identical; only the two verified model cache entries may be added. That fixture uses the real public SW with unexpanded build placeholders to isolate fetch/cache behavior; it does not claim to test the production update/activation integrity protocol.
