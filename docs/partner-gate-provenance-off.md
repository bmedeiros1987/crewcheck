# Partner gate projection — offline, no external activation

## Evidence and direction

Base inspected: main `3f8d0477`; rebased and tests rerun on main `6bb88844`. Source selectively inspected/reused:
`feat/partner-gate-api-v1` at `c71697b0664835024a16a8fc35d31ae84de291f8`
(PR #579 independently confirmed closed, unmerged and draft through the connected
GitHub app; local gh REST/GraphQL calls returned Forbidden).

The intended direction is CrewCheck Radar -> outbound partner gate API (Crewtopia
consumer). This is not importing Crewtopia gates into Radar. The old branch also
contains watches, webhook delivery and roster import/activation; those are distinct
capabilities and are not adopted by this change. No roster PDF is included.

Main already supplies field provenance and occurrence identity. The old API instead
uses a global/class/environment sharing policy, reads a live-flight/route without
an exact occurrence, and relies on an earlier fetch filter to strip restricted
values. Its serializer itself can expose gate/terminal/status from restricted input.
Keeping `unclassified` blocked is correct; removing that default would not establish
rights. A source class or provider name alone cannot prove redistribution rights.

## Implemented and tested

Only normalization helpers and the API payload concept are selectively recovered.
`readPartnerGate` is an injected offline composition seam, not an HTTP endpoint.
It consumes a trusted server-side partner identity and an exact flight/route/occurrence,
then independently checks every operational field. A grant must match partner,
provider, occurrence and field, carry a review ID and future expiry, and separately
approve access and redistribution. Those booleans are an internal contract, not
proof of legal rights. No resolver or approvals are installed here.

Every field must also match its Radar provenance value and occurrence, with an
observed timestamp no more than 15 minutes old and not in the future. The 15-minute
window is a conservative offline policy to review before live composition. Unapproved
terminal/status stay null even if the gate is approved. Raw metadata, provider
payloads and arbitrary Radar fields are never copied into the partner response.
Caller request flags and Radar `partnerShareable`/`sourceClass` cannot grant rights.
Request partner identity cannot override the trusted dependency.

No route registration, DB/migration, key creation, scheduler, HTTP reader, provider
credentials, env permission expansion, deployment, B2B or webhook activation occurs.
The old API's key/scopes management and network fetch are intentionally not copied.
No files in the alert or MyCrewCare workstreams are changed.

Run:

```sh
node scripts/regression-partner-gate-api.mjs
node scripts/regression-radar-field-provenance.mjs
node scripts/regression-radar-occurrence-identity.mjs
node scripts/regression-cirium-radar-provider-off.mjs
```

Fixtures, grants, partners and review IDs are synthetic. Tests include the existing
Radar provenance builder -> partner projection path, independently denied rights,
wrong partner/provider/field/route/occurrence, freshness, redaction and inert defaults.
These demonstrate implementation behavior, not a successful live integration.

## Remaining integration gates

1. Confirm Crewtopia's consumer contract, partner identity, exact occurrence inputs,
   response shape/version and real provider-field provenance on the selected Radar path.
2. Independently establish license/redistribution rights and recipient access. A legal
   review must define the trusted grant resolver and revocation/expiry semantics.
3. Compose authenticated, rate-limited HTTP access with that resolver and a reviewed
   internal Radar reader. The offline dependency seam does not authenticate clients.
4. Port/review watches and webhook state transitions separately if still required,
   including durable revocation checks, retry and destination protections. None run here.
5. Revalidate main, independent review and applicable checks before any separately
   authorized rollout. No web publication is performed by this patch.

The complete gate API and real Crewtopia integration remain uncompleted until those
gates are resolved; this patch closes the unsafe projection/provenance seam only.

## Independent review

A separate reviewer executed the regression and found one metadata leak: a rejected
occurrence could expose gate existence through `gateStatus=restricted`. All denied
gates now return `unavailable`, and the regression asserts that for every rejection.
Review suggestions added: trusted partner anti-spoofing, zero reads without trusted
identity, explicit status grant and the exact freshness boundary. Review applies to
this offline seam, not the unported full API or external integration.
