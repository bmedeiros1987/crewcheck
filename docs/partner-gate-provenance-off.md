# Partner gates — testable HTTP, no external activation

## Evidence and direction

Main revalidated: `6bb88844`. Selectively inspected/reused source:
`feat/partner-gate-api-v1` at `c71697b0664835024a16a8fc35d31ae84de291f8`.
The connected GitHub app independently confirms #579 closed, unmerged and draft.

Direction: CrewCheck Radar -> outbound partner gate API (Crewtopia consumer).
The source branch also has watches, webhook delivery and roster imports. Those
capabilities are separate, not adopted or activated here; no roster PDF is included.

The existing contract is **not missing**: source #579's
`docs/partner-gate-api-v1.openapi.yaml`, `GET /api/v1/flights/{flight}/gate`, and
`GateResponse` define the route, optional origin/destination, Bearer key, gates:read,
rate limits, response fields and failure statuses. `partnerGateApi.mjs` on that
branch implements them. The gate-only contract recovered here is
`docs/partner-gate-http.openapi.json` (1.2.0). Administrative key creation,
webhooks and roster paths are excluded.

## Implemented and tested

`createPartnerGateHttpHandler` implements that GET contract. Default/incomplete
composition returns 503 before any dependency call. It is not registered in the
application. Trusted injected dependencies must explicitly enable it, authenticate
an existing active credential, enforce gates:read, consume a rate limit, resolve a
current exact occurrence, read Radar, and resolve field rights. Optional route
queries are preserved; an exact occurrence is resolved server-side rather than
requiring a new caller query. Caller partnerId/rights/occurrence flags grant nothing.
Invalid input and dependency failures do not expose tokens or provider errors.

The HTTP handler delegates to `readPartnerGate`. Every field independently requires
matching flight/route/occurrence and provenance value, an observed timestamp within
15 minutes and not in the future, and an unexpired reviewed grant matching partner,
provider, occurrence and field. Access and redistribution approvals are separate.
The 15-minute policy is conservative and must be reviewed before a real rollout.
Class labels or Radar shareable flags alone are never grants. `unclassified` stays
blocked. Unapproved terminal/status are null even with an approved gate.

The #579 confidence/confidenceBand and constant `occurrenceMatch=live-flight-route`
are preserved; **occurrenceVerified** is the additional authoritative boolean for
an exact provenance match. Confidence is finite/clamped and zero for denied gates.
Denied gates return unavailable without revealing whether another occurrence has a
gate. Raw provider metadata is never copied. Grants/review IDs are an internal
contract, not proof of legal approval.

No route registration, credential creation, DB migration, scheduler, network reader,
provider config, permission expansion, deployment, B2B or webhook activation occurs.
No files in alerts or MyCrewCare are changed. All tests use synthetic fixtures;
HTTP tests bind an ephemeral loopback server only.

```sh
node scripts/regression-partner-gate-api.mjs
node scripts/regression-partner-gate-http.mjs
node scripts/regression-radar-field-provenance.mjs
node scripts/regression-radar-occurrence-identity.mjs
node scripts/regression-cirium-radar-provider-off.mjs
```

The HTTP regression checks the recovered response schema, default/missing
composition, authorization/revocation/scope, rate limit, optional queries, trusted
occurrence resolution, anti-spoofing, redaction and dependency errors. The projection
regression includes the existing Radar provenance builder -> projection path.

## Exact evidence/decisions still needed for real composition

These do not block the testable HTTP implementation above:

1. **Source redistribution approval record**: provider/license agreement clause or
   signed review identifying the actual provider, permitted fields, Crewtopia as
   recipient/use, effective date, expiry and revocation. The #579 source class
   allowlist and feature flag do not supply that document. No such grant is installed.
2. **Recipient access approval and existing credential binding**: approved Crewtopia
   partner identity mapped to an existing active credential with gates:read. The
   #579 `authenticatePartnerApi`/key table describes an implementation, not evidence
   that a recipient has been approved. No credential is created or scope expanded.
3. **Reviewed server composition decision**: select the existing Radar reader that
   actually supplies field provenance/current exact occurrence, the credential/rate
   storage adapters, and authoritative rights lookup/revocation source. Registering
   the handler or enabling dependencies in the running app is outside this patch.
   No external endpoint is called to infer readiness.
4. Watches/webhooks remain outside this gate GET patch and need their own review if
   requested. No requirement for them is inferred from the GET contract.

No new consumer contract is demanded to finish the HTTP implementation. Real
integration remains unproven until the specific evidence above is provided and a
separately authorized server composition is reviewed.

## Independent review

The first review caught gate-existence metadata on rejected occurrences; fixed and
covered. A second review ran both projection and loopback HTTP regressions and found
no blockers in the inert scope. Consumers must use occurrenceVerified as documented.
CI status for the final SHA is recorded in PR #1047, not inferred from local tests.
