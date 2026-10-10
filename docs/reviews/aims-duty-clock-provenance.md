# AIMS published duty clock provenance

Base: be292f81a7945c9a038d0cac95b53b8a8b421463 (same tree as approved salary PR966).

The AIMS early return from parsePDF bypasses the generic PDF parser provenance finalizer. The human AIMS producer conflated a literal debrief clock with arrival +30 minutes and did not carry its source into the public roster model. Consequently a freshly imported valid roster could remain pending. Legacy records lacking evidence also remain pending, correctly.

This change records source at token selection, preserves it through physical reconstruction and binds regrouped boundaries to the selected timeline item. The visual/text superset generator carries source whenever it replaces a boundary. Unknown inputs remain unknown; an arrival fallback remains estimated even when its numeric clock equals a literal release.

No changes to canonical measurement, legal limits, analyzeSafe, Home visibility, rates, salary clocks, transport or cache migration. No automatic reset/reimport. Existing records are not retroactively certified. Other unsupported/ambiguous parser routes may still return unknown rather than prove a boundary.

## Synthetic reproduction and acceptance

Physical PDF bytes pass through real PDF.js, parsePDF, AIMS, canonical events and measurement in UTC, America/Sao_Paulo and Asia/Tokyo. Literal report07:25, flights08:20–10:50 and11:35–13:35, literal release14:05 yield400 duty minutes including45 ground minutes from either selected flight. The same PDF without14:05 yields numeric fallback14:05 but estimated source and null measurement. Missing report, both missing, OP/PS and JSON persistence are covered. All limits remain unconfirmed. Legacy records with removed provenance produce both boundary warnings.

The same test on the approved previous prepared tree fails on missing published source. Compiled Home reuses the parser-produced models: widths320/360/390/1440, light/dark, actual Settings text100/200%; available6h40 and missing-release pending, no0h00, clipping or overflow.

Run after canonical preparation and Vite build:

```
node scripts/regression-aims-duty-source-browser.mjs
AIMS_DUTY_SOURCE_REPORT=artifacts/aims-duty-source/report.json node scripts/regression-canonical-duty-home-browser.cjs
```

Use MENU_PLAYWRIGHT_PACKAGE for the isolated Playwright install and PLAYWRIGHT_CHROMIUM_EXECUTABLE only when a local browser path is required. Browser tests intercept APIs and block external origins. All committed fixtures and review artifacts are synthetic. Actual source PDFs and screenshots are excluded from GitHub.

Independent review must verify the exact source and prepared tree, including the authorized original PDF corpus, boundary regrouping and missing-token counterproof, before merge/deploy.
