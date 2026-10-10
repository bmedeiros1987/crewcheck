# Operational salary clock review

Base: 22af8e9b14cacb0d06b8cd7caf466fd846e10b5a. Synthetic evidence only.

The supplied AIMS fixture previously produced gross 3900 in UTC/São Paulo and 4527 in Tokyo. The correction returns 3900 in all three, with leg production 100/400/300/400/500/1200. Rates, distance rules, PS multipliers and nominal payroll competence remain unchanged.

Night windows and Sunday/holiday dates now use the explicit operational timezone, with the existing corporate Etc/GMT+3 default when the field is absent. Invalid explicit zones and unzoned/invalid canonical instants remain unavailable. They propagate unknown through aggregate production and block amounts in SalaryReliableView; they are not confirmed payments.

UTC minute segments preserve endpoint seconds and modern IANA DST elapsed time. Historical second-offset timezone transitions are outside the covered fixtures. Tests include UTC, America/Sao_Paulo, Asia/Tokyo; 22/05 boundaries, leap/month rollover, modern DST folds/gaps, Sunday and configured holiday separately, missing timing, dedup and OP/PS/per-diem invariance.

No tariff, ACT, transportation, Cirium, hotel, credentials or payment confirmation changes. Independent review is required before merge or deployment.
