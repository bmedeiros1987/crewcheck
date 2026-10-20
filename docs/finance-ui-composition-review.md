# Isolated finance/UI composition

Source heads: PR934 454d4bda740cc496faa5b91f572a6255241c0923 and PR939 472335243cce51ed7bc39e24eb0fed0c8bd69893. Stable main:5fb5cf746c1a0cbf4af08634513b917b519435a5.

Separate branch/worktree based on PR934, with PR939 applied using three-way patching. Original source branches unchanged. Sole content conflict: adjacent salary details/rows in Home.tsx. Preserve reviewed payroll competence text from PR939 and MoneyText totals from PR934. Other overlapping caller/browser changes applied cleanly. No new calculation, tariff, payment evidence or transport behavior.

Source PR independent reviews pending. This is a review candidate, no main merge/deploy. No real values updated; discrepancy remains unresolved without app source items. Combined QA: actual150/200 preferences with large currencies, mounted selector/account changes, owner references, historical filters and forecast states.


Independent review fixes are explicitly included: monetary token foreground inheritance/full opacity with actual-token contrast checks; fixed base selected only in fixed competence; FX prompt writes bound to its original session; parser derived replacement never printed; shortened latest revision prevents old tariff resurfacing. Source review branches remain separate.


Composition-only browser coverage additionally exercises actual salary flight rows with large synthetic money at150/200%,320/1440 widths and light/dark, with glyph bounds, label intersection, whole currency groups and monetary-token contrast. This extra QA is not silently copied back to the source branches.
