# Authenticated read-only operational preview

Stacked dependency: PR #909, exact base `5883cdbc6a340acd0101814439d3c91a64246be6`. This change connects that planner to GET `/api/platform/operational-briefing/preview`. It does not implement subscription, consent settings, queue operations, a timer, device registration or provider delivery. #909 remains a draft until this composition is validated.

## Access and source authority

`server/v139/common.mjs::readExistingMainIdentity` is the sole authentication helper for the new endpoint. It calls the existing `requestToken` and `verifyJwt`; no JWT implementation, secret or token issuance is added. The route requires current main-account issuer/audience, bounded valid timestamps and a subject equal to the existing profile's public_id. Visitor claims, email-header/body fallback, missing/deleted profiles, stale same-email account incarnations and pending mandatory password change are rejected. It does not call either existing profile-creation helper. Existing `requireIdentity`, `requireMain` and global login/session behavior remain unchanged.

DB unavailability remains 503, distinct from missing/invalid authentication 401. Errors return fixed messages, never underlying connection/provider/SQL details. Only a GET is allowed, and the response is no-store.

`server/concierge/operational-briefing-source.mjs` performs a primary DB SELECT joining the current profile incarnation to the owner's active rosters. It selects at most two rows and requires exactly one active row; an absent current account cannot expose an orphan roster. There is no fallback to another owner, latest row, mirrored Concierge snapshot, local storage, body/query authority or client-supplied publication history.

The revision is obtained as SQL `UNIX_TIMESTAMP(updated_at)`, not by interpreting an unqualified DATETIME in Node's host timezone. SQL interprets such values in the database session timezone; the existing DB-managed write/read timezone convention must remain consistent. This change performs no runtime timezone/configuration mutation. See [MySQL's date/time function semantics](https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/date-and-time-functions.html). Unreadable or future revisions fail closed.

The response separates the existing stored `legacyFingerprint` from a new read-derived `contentDigest` (`sha256-canonical-json-v1`) of the complete JSON roster. Object keys are sorted, array order/multiplicity is retained, and unsupported/oversized data is rejected. This digest describes the authoritative row that was read; it is not a company signature, proof of a recent airline publication, or a newly persisted integrity record.

## Preview behavior and limits

The adapter uses the existing canonical planner with a fresh server read time and `previousPublication=null`. A GET never stores a baseline or classifies historical publication changes. Its response includes only next-duty briefing data and minimal source references, not the full monthly comparison state, raw roster, profile or account email.

Weather observations are deliberately absent until a verified source adapter is connected. The response says unavailable; no cached or fabricated report is substituted. No external request is made. `submissionAllowed` is false.

Only parser-normalized clocks are accepted. Malformed presentation/debrief metadata containing clock substrings is rejected instead of being presented as a confirmed time. Explicit `(+N)` flight-day offsets are currently unsupported at this adapter boundary: the existing engine does not consistently prove them for isolated legs, so the endpoint fails closed. Boolean rollover/continuity flags must actually be booleans. Valid canonical overnight/month-boundary continuity with normalized clocks remains supported. There is no new journey, APZ, debrief or weather classifier.

No upcoming flight, an earlier unsupported nonflight duty, and an unconfirmed presentation have distinct messages. This remains a preview of imported roster information, with no clearance or operational-safety guarantee.

## Verification gates

Focused tests exercise the actual existing JWT verifier/token extraction, new read-only account helper, real source adapter and actual platform route/policy/handler through a synthetic harness. SQL fakes reject every non-SELECT statement. Cross-account, main/visitor, account recreation, spoofed identity, malformed cookies/tokens, unavailable DB, missing schema, ambiguous rosters, malformed metadata, source expiry, minimal responses and side effects are covered.

The dedicated workflow runs source and #909 planner tests in UTC, São Paulo and Honolulu on raw and canonically prepared sources, plus existing auth-outage and canonical-journey regressions. Its paths include all preparation scripts because those producers can rewrite server behavior.

Real SQL checks use only a hard-coded disposable MySQL 8.4 database via a fixed Unix socket, in a network-disabled container with no published ports or production credential inputs. They verify actual JOIN ownership/incarnation behavior, duplicate active rows, JSON key normalization/full-content digest, SQL epoch conversion, future revisions and sanitized schema failure. All identities, tokens and source rosters are synthetic. Production DBs, credentials, messages and device permissions are untouched.

Local and exact-head CI outcomes are recorded in the PR description; neither this document nor passing mocked tests substitutes for the remote raw/prepared/SQL gates.

## Ownership and release

Only the platform import/policy/handler/route hunk and the additive common auth helper touch existing owners. The #891–#894 chat integrator must preserve these hunks when composing platform.mjs. The canonical planner remains #909's responsibility. Wake #872, MyCrewCare #907, Pulse, Android, service worker, weather consent and existing scheduler are unchanged.

Before publication as a working product path, review the combined #909/adapter tree and exact CI, then use the existing web deployment workflow. Queue hardening, explicit operational consent, device transport and physical background-delivery validation remain subsequent coordinated work. Do not claim that this GET enables notifications.
