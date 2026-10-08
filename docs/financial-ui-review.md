# Financial UI review

Selected competence uses the canonical monthlyRows without the previous 40-item cap. One native-currency forecast card remains visible; conversion, Wednesday–Tuesday reference weeks, individual items and source/rule details expand on demand. Currency, competence and forecast wording do not assert settlement. No producer, persistence, transport or payment-confirmation source was added.

Synthetic QA: 22 actual compiled Chromium cases, light/dark, 320/390/1440 widths, large amounts, four currencies, unknown classification and empty data; owner roster month changes verify January/February/March boundaries. Glyph rectangles, panel/header alignment, contrast, cumulative opacity and last-row navigation clearance are asserted. CSS zoom and reduced CSS viewport emulate stress at 200%; native browser zoom and physical devices are not certified. Navigation styles remain unchanged. Fixtures use explicitly synthetic manual rates, not an ACT or official tariff.

Behavioral red/green verifies 48 monthly rows and adjacent-month selection in UTC, America/Sao_Paulo and America/New_York. Build and TypeScript passed before review.

Reference: Library resolved Latam - Demonstrativo Tripulante(2).pdf, 311097 bytes expected; fresh official materialization returned HTTP 403, no local bytes or pixel inspection. This UI is not claimed to match that PDF. Independent review and exact-head CI are required before merge or deployment.
