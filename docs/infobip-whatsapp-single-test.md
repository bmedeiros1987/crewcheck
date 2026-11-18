# One neutral WhatsApp reply — prepared, not activated

The installed caller accepts only a separately configured single-test policy.
Missing or malformed policy stays OFF, without resolving credentials, SQL,
timers or transport. The general application factory remains no-options/OFF.
Publishing this patch alone does not activate WhatsApp. This supersedes the
previous no-environment-switch statement only for this restricted caller.

Policy: version 1, mode `single-neutral-reply-v1`, maxCostUsd `0.02`, and
configuration.singleMessageTest true. Existing ingress/configuration/credential
bindings remain required. Admission has exactly one recipient, maxAttempts 1,
and a fixed window of at most 15 minutes. Its durable ID is the original test
approval message ID exported by the caller. Never rotate it to replenish quota.
No real recipient, policy or secret is embedded in the repository.

After whole-body HMAC authentication and schema validation, only the allowed
recipient's exact TEXT `Teste CrewCierge` is eligible. Other text, linking codes
and recipients are ACK-denied before SQL/link mutation. Held jobs are also checked
for this exact text before quota/engine/send. Existing confirmed link, consent,
canonical link hash, reply freshness, durable quota, dispatch marker, no-retry,
lifecycle and revocation locks remain mandatory.

The reply is always `Teste de conexão CrewCierge.`. It does not invoke account
tools, model providers or general Concierge. The final send guard rejects every
other output, including old link confirmations. This is a transport smoke test,
not proof of AI behavior or proactive notifications. DLR and SEEN remain separate.

Quantity reservation is not a monetary guarantee. maxCostUsd records approval,
not provider billing enforcement. Before setting the policy, the operator must
verify current tariff and service window against the US$0.02 ceiling. Otherwise
leave OFF. A bounded request has no redirects/retries; an unknown outcome consumes
quota and must not be resent. Provider acceptance is not physical delivery.

## Remaining activation gates

This patch performs no real profile association, configuration, deploy or send.
Independent review and exact-head CI precede publication; the coordinator owns
deployment sequencing. Provider inventory received renewed read authorization;
the latest attempt reached an expired-login screen, so association is unverified. Preserve
Voice and shared consumers when associating HMAC. Observe a real valid signed
callback before claiming secret equality.

Secure host preflight must validate content-key format, API-key sender scope,
effective canonical link-key reference, schema readiness and no active/unknown
engine fences. Env-name presence proves none of these. All overlapping processes
must support durable revocation. Unknown completion stays pending without TTL
unlock/refund. Credential entry continues to require personal handoff.

The target must have an existing confirmed link/consent and send fresh exact
test input after deployment. Never forge inbound/link/consent from a chat phone.
General responses and proactive notifications remain outside this test approval.
