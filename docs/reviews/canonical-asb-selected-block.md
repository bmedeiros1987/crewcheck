# Selected second ASB block: factual measurement correction

Base: e729566dd7fdaeee4da9eb1a1954d3ae5b240d35 (#1127).

A published ASB row can contain two already-classified canonical journeys. With a row-level reserve presentation of 03:00 and a second flight block explicitly published at 15:00, the complete measurement reader incorrectly applied the earlier reserve start to the second journey. Its available result bypassed the endpoint reader's more restrictive fallback. CrewCierge Next and Departure consequently showed 03:00 for the selected second block.

The reserve contribution now applies only when the selected group's first flight has legIndex 0. Later groups retain their own published presentation. This changes the factual shared measurement reader, so independent domain review is required before merge. It does not change journey classification, parser, regulatory limits, financial calculations, authentication, or transport. No real Telegram/provider messages or data were used. Menu/hospital work remains paused pending review.

Synthetic regression covers the real canonical producer and readers: ordinary date and year boundary, distinct journey identities, first ASB presentation retained, second explicit presentation retained, unknown second presentation stays unknown, estimated final release stays unknown, and source immutability. Canonical measurement runs in four process timezones. Existing first reserve, overnight, deduplication, and source-proof cases remain.

Baseline counterproof: both new real-reader integration cases fail on the raw and prepared #1127 base (03:00 instead of 15:00); the shared measurement counterproof also fails. Corrected raw integration has 54 passing cases. Full prepared/check/build verification is recorded separately in the delivery report.

This is a separate correction from #1127's route fallback date formatting. It does not establish that every APZ case is fixed. No financial snapshot integration is introduced; #1115 remains contract-only and the isolated financial prototype remains unavailable to Telegram.
