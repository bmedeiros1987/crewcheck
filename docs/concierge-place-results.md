# Nearby results: pharmacy and hospital references

The shared Concierge reference resolver now supplies a small result model alongside its plain-text reply. Only the trusted app channel receives the model from `/api/telegram/concierge/ask`; `reply` remains a string for existing clients. Telegram and WhatsApp receive plain text with a route immediately beneath each place, without Markdown hyperlinks or a second numbered URL list. The app uses scoped cards with a route button beside each result.

## Relevance and evidence

- Start with three results; “mais farmácias” / “mais hospitais” requests up to six. The existing single restricted Nearby request considers up to twenty candidates before selection. No second provider request is added.
- Ordinary pharmacy queries exclude names/types indicating veterinary care. Manipulation/homeopathic pharmacies appear only on explicit request, or as a clearly labeled fallback when no ordinary pharmacy was returned. Classification is best-effort from provider name/types; it cannot establish stock, eligibility, clinical suitability or every specialization.
- Known-open results precede unknown opening status, then closed results. Distance breaks ties within those groups. No opening status is invented. Permanently/temporarily closed businesses are omitted when the provider supplies that business status.
- Distances are explicitly straight-line measurements. Maps links contain only a validated destination, without claiming the hotel is the user's current GPS position or selecting a transport mode.
- Hospitals keep a neutral category and ask the user to confirm specialty/urgent-care availability. No emergency telephone number is inferred from a reference location.

## Context boundary

A hotel is only a search reference. The existing account/channel scope, ten-minute reference expiry, roster fingerprint, published stay boundaries, ambiguous selection, superseded-request and late-response guards remain in place. A current valid reference can carry from pharmacy to hospital searches even if separate GPS data is stale. Explicit “perto de mim” still requires fresh voluntarily shared GPS. “Perto de hotel/endereço, cidade” works without the rigid `referência:` prefix, which remains backward compatible.

A published active roster stay or a recently selected reference is required. This change does **not** bridge the separate hotel-stays database or reinterpret historical hotel records as a current stay. With no guarded reference, the response asks for a hotel/address and city; GPS is optional.

## Verification

`node scripts/regression-concierge-place-results.mjs` tests synthetic relevance, output, hospital/reference continuity, status uncertainty, unsafe coordinates, no unsupported links, and no travel-time claims.

After canonical `node scripts/v139/apply.mjs`, run the existing `regression-concierge-pharmacy-reference.mjs` and the new result regression with `--prepared` to exercise emitted channel adapters/provider projection/API wiring, along with account/channel/TTL/race safeguards. Scoped preparation is hash-checked for idempotence.

`node scripts/qa-concierge-place-results.mjs` compiles the actual React component with the repository's esbuild and runs a real local Chrome/Chromium. Screenshots and the assertion report are written to `.artifacts/concierge-place-results/`. All data is synthetic; Google Maps and application APIs are not contacted. Full canonical preparation, TypeScript, Vite and browser checks run against the exact PR head in the dedicated workflow. No live lookup or physical-device delivery is claimed.
