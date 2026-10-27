# Finite promotional exposure reserve — OFF

This is explicit risk authorization, not evidence that an observed price or invoice is fresh. No public policy mode, transport, grant, provider request, environment discovery or real data operation is introduced. FINITE_RESERVE_SHIPPING=false. The existing promotional caller still requires genuinely fresh evidence and cannot activate this alternative.

The existing state table and existing account/global/request keys are reused. A trusted provisioner would first require a distinct approved authority manifest binding account, grant, program, sender/recipient, period, maximum attempts, per-attempt conservative reservation, total pool, observation hashes/dates, outside-consumer provision and the explicit provisional-cost risk disclosure. No authority provisioner or real approval is supplied here.

Prefunding requires a truly fresh initial budget/price observation (15 min), locks the existing account/global rows, and reserves the whole finite pool plus the explicit outside-consumer provision globally once. No user balance is created. Replays never top up or reset; a different allocation cannot replace the existing one. Existing ordinary reservations see this full global hold, preventing reuse by another app consumer sharing this global ledger. Expired/unused holds are retained; no automatic release/refund exists.

Spending reuses the shared-credit candidate's request idempotence, transaction rollback and account debit. It consumes the pool's bounded amount and attempt count without charging global exposure twice. Freshness, expiry, owner, consent and abort are rechecked after SQL waits/writes. A lost acknowledgement retains debit and attempt. Revoked risk authority denies. Each received message still needs current canonical link/consent and a live service window; synthetic SQL tests do not establish a production identity source.

Tariff validity is a separate deadline and is part of the approval. The authority manifest binds observedTariff.validUntil (an integer after the observation). Funding requires the locked verified-tariff row to carry exactly that validUntil and rechecks now<validUntil before and after the real UPDATE. Each spending attempt requires the resolved quote's validUntil to equal it, rechecked by the candidate after every write. A missing, non-integer, rewritten (later) or past validUntil denies. Expiry during SQL waits rolls back the hold, account debit, global usage and request marker. A funding replay may still answer already-reserved after the tariff expired; nothing is written and spending denies independently, so callers must not read already-reserved as permission to spend.

All deadlines use the injected application clock shared with the canonical resolver and candidate. Database NOW(3) only stamps updated_at, so one transaction never mixes two deadlines. Two caveats remain. Passing the same clock to resolver, candidate and prefunder is a wiring convention, not enforced. Clock skew between whatever writes tariff rows and the app hosts is not bounded here. The residual window is the time between the last check and COMMIT, as in the existing ordinary path.

Observed verifiedAt/reconciledAt stay unchanged. A stale observed quote remains rejected by the ordinary quote checker. Only the separately configured explicit-risk path uses the fixed ceiling after 15 minutes. That ceiling is an app exposure reservation, not a guaranteed Infobip tariff or absolute invoice cap. Actual fees, inbound charges, adjustments, taxes and consumers outside this ledger remain risks requiring coverage/approval. Never label a risk approval as provider reconciliation.

Final send gate (prepared, OFF, wired nowhere): createFiniteReserveSendGate returns an object with checkSend(c,job). The production store already calls that method in its last transaction, right before provider I/O. It denies unless enabled is the literal true, and FINITE_RESERVE_SHIPPING stays false. Under the store's transaction it rechecks, in order:

1. the message: provider, non-link kind, sender/recipient, owner binding, event key, age ≤ 15 min;
2. canonical identity reported by the trusted resolver: link, consent, binding, owner. The gate denies on these itself and does not rely on the resolver filtering;
3. the quote's approved observation and tariff validity, and the live service session;
4. the authority window and period, with a clock that must not move backwards;
5. the locked rows:
   - the account hold and grant validity;
   - the approved tariff row;
   - the global finite reserve: reconciled, approved billing evidence, still reserved, usage consistent with attempts;
   - the approved authority;
   - this event's credit-request marker: still reserved, with the same finite manifest, basis, per-attempt amount, account and period.

It then consumes the marker (state send-authorized), so a retry, replay or concurrent check is denied. Every deadline checked before that write is checked again after it, the account grant's expiresAt included; any expiry there throws and rolls back.

The single-send guarantee is the store's committed no-retry dispatching marker, not this one. If the store transaction rolls back after a real send (e.g. COMMIT fails), the request marker returns to reserved, so reserved never proves a message was not sent and must not drive a refund. Use the gate only behind that store marker. A denial releases nothing: the event's reserved credit and finite attempt stay used (fail closed, no refund method), and errors before the gate's write leave the job uncertain.

Real MySQL 8.4 synthetic tests cover:

- deny-by-default;
- each denial reason above, including tampered marker/authority/global/tariff/account rows, an expired session and a backwards clock;
- rollback after the write;
- one authorization out of 12 concurrent checks;
- single use across an actual restart.

Not yet exercised through the real store's dispatch (send failure/timeout after the gate); that belongs to the wiring step.

Remaining integration gates: reviewed trusted canonical/grant resolver that separates identity from financial evidence; wiring the prepared final send gate into a reviewed finite admission (allows/reserve/checkSend) under this same finite authority; approved authority provisioning/revocation lifecycle; exact external-consumer coverage and real permission/evidence; specific human approval of recipient, amount, period and risk. No finite reserve is currently approved or active. Existing pilots1/1 and3/3 remain consumed and separate. Voice is excluded.
