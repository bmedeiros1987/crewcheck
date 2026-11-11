# Checkout feedback: preserve pending subscriptions and report uncertainty

Base: main13cb5a556879e0ab4540b6ee069b592e18378e2b. Work owns this isolated
correction. Open PRs #1260/#893 overlap only visitor/sharing hunks and #1086 only
hotel/roster hunks in the same files; those hunks and their owners are preserved.
Additional platformClient.ts overlaps in #891/#893/#1086 affect other helpers, not
the billing functions. No competing checkout candidate/local branch was found. No wholesale replacement,
provider configuration, account data, price, migration or subscription policy is added.

## Reproduced failure

Actual raw and canonically prepared handleAsaasCheckout plus SubscriptionCenter's
subscribe function reproduced six misleading outcomes with synthetic dependencies:
existing pending payment lookup fails or has no URL, or a newly requested subscription
is stored pending but no payment URL is available. HTTP200/ok:true plus a null URL
caused a success toast without opening payment. Positive link and cancelled-prompt
controls were retained. This does not establish which stage Bruno encountered.

## Resulting contract

- Existing pending lookup error:503 CHECKOUT_LINK_UNAVAILABLE, pending record intact,
  zero new customer/subscription writes. Do not retry creation automatically.
- Successful lookup without a link:202 CHECKOUT_LINK_PENDING and checkoutState=pending.
- Newly requested subscription: keep the existing pending persistence path. No link
  means202 with pending/unavailable explicitly distinguished. A ready URL means200
  with checkoutState=ready; it is not payment evidence or premium activation.
- Local persistence error after provider creation:503 CHECKOUT_CONFIRMATION_UNCERTAIN.
  No rollback, deletion or second creation is attempted. An uncertain DB ACK must
  not be described as proof that nothing happened remotely or durably.
- The actual client shows a short pending/error notice when no ready link exists,
  including legacy no-state/no-link replies. It never announces paid/active success.
  A ready link opens the existing external flow with a neutral confirmation-dependent
  message. Popup display, provider acceptance and payment are not certified here.
- A captured canonical auth generation is rechecked after the CPF prompt and before
  initiating checkout, then fences post-await opens, notices, reload and busy clearing; late A→B→A success/error cannot affect the new account context.

No endpoint or new payment retry/queue is added. This is not general concurrency or
exactly-once proof for subscription creation. Explicit subsequent calls after a
confirmed local pending record reuse that record; uncertain creation remains pending
for reconciliation. Provider idempotency, real DB/Asaas health and historical webhook
backlog were not inspected. Existing durable receipt/quarantine/access gates survive.

The first reviewed candidate c105 had two confirmed gaps: account switch during
CPF could still issue checkout, and a late post-checkout reload could overwrite the
shared billing cache. Synthetic fail-first probes preserve both failures. The owned
SubscriptionCenter loader now checks the captured session after catalog/private awaits.
Its new getFreshPlatformBilling selector reads the EXISTING authenticated endpoint,
checks before/after, and neither writes nor adopts the legacy shared cache. Default
getPlatformBilling and its other callers remain unchanged: this is not a migration or
a claim that every legacy cache consumer is repaired. No extra request or retry is added.

The second review confirmed those fences but found that an HTTP200 empty receipt
was still accepted by the new reader. A fail-first probe demonstrated the missing
rejection. The fresh path now requires ok:true and the existing typed plan/status,
premiumAccess, plans and usage fields (safe nonnegative integer counters, valid month).
The UI uses that validated receipt directly, without merging profile fallback billing.
The final cleanup clears only its own plan request, not the database-unavailable
lock created by the refresh. The browser counterproof caught the old finally
reenabling contracting after that error. Fresh reads also keep contracting paused while awaiting verification (the prior
loader cleared busy too early; a controlled browser hold reproduced it). State
updaters recheck their captured session when React applies the update. Invalid
receipts pause contracting; stored data is not repaired/deleted or promoted.

## Validation

The actual-handler/controller regression has20 synthetic cases: pending error/empty,
invoice/boleto links, new pending/ready, explicit subsequent reuse, uncertain DB write,
cancel, invalid CPF shape, existing active subscription, Android rejection, expired
session, late ready/pending/error, legacy empty, unknown readiness and account change inside the CPF dialog. Eight
additional real fresh-reader cases cover current/expired-before/expired-after, network
failure, storage failure, empty/missing-ok receipts and invalid usage, with no cache adoption/write or retry. Provider/SQL/UI
capabilities are injected; no real service is called. It is not a real-DB test.

The real SubscriptionCenter/platformClient/auth module runs against intercepted HTTP
in54 browser cases (320/390/1440, light/dark):202/503/200, legacy response, keyboard,
200% text containment, late A→B→A ready/error, revocation during catalog/private reload, preservation of
the other-context cache sentinel, invalid HTTP200 receipts against a cached-premium
fallback, and one explicit checkout request only.
Only fictional accounts/CPF/products/prices/URLs occur in tests and screenshots.

The existing Play catalog AST harness needed the actual canonical auth module after
the subscribe guard was introduced. The existing native catalog browser fixture also supplies only synthetic read data
through the fresh-reader interface and checks its captured session. Its assertions
were preserved; a synthetic event
proves generation revocation, not an always-valid fake fence. Raw failing evidence
and corrected results are retained outside Git. Native/store behavior is unchanged.

Google Play investigation is separate: catalog/product readiness and JS listeners can
be tested offline; the local Java stage did not execute (javac ENOENT). No JDK was
installed. Real Play catalog availability, backend verification authority, physical
purchase/restore and listing approval are not proved by this web fix. Donations have
no dedicated flow identified in the consulted code/search; no payment destination or
PIX key is invented. Android/Play ownership and policies remain with that front.

WhatsApp remains a separate held stack #1262→#1263→#1268. Offline link/admission/menu
checks do not prove production policy, callback receipt, budget or delivery. No
provider, sender, credential, route, gate, notification, Android or Watch change is
included here. Store listing assets are not recreated or submitted by this patch.
