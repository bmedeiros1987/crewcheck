# Financial preview follow-up

Base: main 09d6c70399fcce06a5f06b14554efae1a8e29961, after #1055/#1056/#1058/#1059.
Continues draft #1054; no merge or deployment in this stage.

The next-payment card gives the amount and timing priority, labels the cycle separately from the consulted period, and retains estimate, currency and gross-before-deductions caveats. An incomplete forecast stays explicit. Compact actions open the existing composition, statements and pending-item surfaces with keyboard focus.

There is one financial privacy control per allowance/payroll screen. The duplicate control in the history filters was removed; the account-scoped privacy implementation and amount calculations are unchanged.

The active Home uses a shared navigation card in the canonical FlyDeck source and the personalized layout source. It opens existing allowance/payroll views and deliberately displays no unverified aggregate. The operational briefing stays first. Empty-program Home also exposes the card. Shared navigation, Pulse implementation, flags, credentials, integrations and production data are unchanged.

Acceptance: compiled app with synthetic accounts, schedules and values; local static server, external requests blocked and API responses 503. Matrix: 390/1440 pixels, light/dark, complete/partial/empty. Checks cover repeated Home/finance navigation, hidden DOM/accessibility, single 44px privacy control, focus transfer, cycle/filter independence, incomplete payroll coverage, overflow and runtime errors. Existing privacy/account isolation and financial model/caller tests are also run. Screenshots and report are stored as financial-payment-preview-synthetic CI artifacts; local artifacts/financial-payment-preview contains the same fixture captures.

Limits: these are synthetic browser checks, not real payroll validation or a physical-device test. Independent review remains required before integration.
