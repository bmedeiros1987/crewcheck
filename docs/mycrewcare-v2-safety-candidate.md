# MyCrewCare v2: bounded safety candidate

Status: **DRAFT, not an available integration.** `RELEASE_ENABLED = false` and no
Home/MainActivity entrypoint is wired. Do not ask users for login or credentials yet.

## Provenance and scope

Base: main `d3f7e356cd1c2eeaedfb01615cfb1713bada84ea` (includes #905/#906).
Reuses the transport-only parser and separate Android portal approach from #872
`eaabf28abadde1f9f7fdf3aaf65d3f1b7237d24e`, with conservative safety corrections.
The original branch/history remain intact. This is a narrow reconciliation, not
the 26-commit exclusive Wake port or the inherited #857 visual history.

No changes to Home/quick roster/shortcuts, alarm scheduling, paid messaging,
server/weather/health/consent/account-deletion, parser/canonical roster, APZ,
finance, manifest permissions, credentials or `scripts/v139/apply.mjs`.
`sync-canonical-manual.mjs` remains the final canonical preparation step.

## Entry points and future wiring contract

Import `createMyCrewCareSession` and `createMyCrewCareNativeAdapter` from
`client/src/lib/myCrewCare.ts`. The single session controller is in-memory and
never stores credentials, portal text, provider identity or transport globally.

1. The Mobile Core owner must supply authenticated account ID, active roster ID
   and checksum/revision, and a **verified** MyCrewCare subject mapping. A name,
   email guess, URL, previous connected flag or login page is not identity proof.
2. Supply a registry of current persisted platform stays, explicitly linked to
   canonical roster `stay` events. `id` is the server stay ID; `rosterEventId` is
   separate; `rosterEventKind` must be `stay`, and both IDs must be unique. Do not synthesize IDs or use `ZeroLeg.id` as the persisted ID. Reject
   localOnly/offline fallback, missing/ambiguous links, unsupported event kinds,
   unknown timezone/pairing/hotel, and missing explicit bounds. The present
   `listPlatformStays` fallback and date-only `savedFor` are not sufficient proof.
3. Call `setContext` whenever account, active roster revision, selected registry
   or stay metadata changes, before pending callbacks can publish. Rebind only
   from fresh authenticated reads; changed scope resets automatic consent.
4. Enable automatic pickup only after explicit opt-in. Invoke `sync` explicitly;
   no `onResume` auto-sync is included. Call `setAutomatic(false)` for off,
   `disconnect()` for disconnection, and `logout()` synchronously at the local
   logout/account-delete boundary, before awaiting network completion.
5. Expose a true Disconnect/Cancel action in the future UI. Close/cancel must
   abort the request and clear the session; never label a page connected before
   a verified extraction completes. Empty successful sync clears earlier pickup.
6. Future Android bridge methods are `myCrewCareProtocolVersion() = 2`,
   `myCrewCareReleaseEnabled()`, `openMyCrewCareV2(requestJson, automaticConsent)`
   and `disconnectMyCrewCareV2()`. Dispatch only `crewcheck:mycrewcare-v2`.
   Each request uses a cryptographically unique controller nonce and echoes its
   full account/roster/subject scope. Native user cancellation revokes consent.
   Old #872 parameterless methods are inert, and old snapshot/status events are
   ignored. The callback must stay bound to the current trusted CrewCheck page.
7. Native `AuthenticationVerifier` must verify the actual authenticated provider
   subject and transport atomically in one consistent DOM/session snapshot, prove
   an empty state separately from pending DOM, and create a
   genuinely isolated per-account portal profile. A normal separate Android
   WebView shares cookies with other WebViews and does **not** meet this contract.
   It must also supply a provider-verified `transportationCardSelector` for active records only; the
   parser has no guessed generic-ancestor/body selector. No implementation of
   that unverified provider/profile/DOM contract is supplied.
8. Consume `session.pickup(persistedStayId)` only if it returns one unique match.
   It requires exact airport, pairing and hotel, a valid explicit date and clock,
   unique timezone conversion, and a pickup inside the persisted stay bounds.
   It rejects overlapping matching stays and conflicting pickups. It does not
   rewrite presentation/APZ, save hotel facts or create/change any alarm.

Freshness is capped at 15 minutes with a 30-second future skew. This conservative
candidate default needs operational acceptance; no stale fallback is returned.
Manual pickup remains a separate existing input and must not be overwritten.

## Release blockers (must all be closed on the exact final SHA)

- Independent source review and all technical CI, including pre/post complete
  canonical preparation, TypeScript, Vite and Android assembleDebug.
- Documented/verified provider integration permission and authenticated identity
  evidence. This is DOM extraction, **not** a documented MyCrewCare API.
- Genuine per-account native cookie/session isolation and its logout/revocation
  implementation. Do not call global `CookieManager.removeAllCookies()` because
  that could sign unrelated CrewCheck/SSO sessions out.
- Confirm real LATAM page labels, DMY date convention, timezone semantics,
  active/cancelled/historical record status, dynamic DOM/empty state/error behavior, MFA redirects and exact required hosts.
  Do not broaden allowlists by wildcard to make an unknown redirect work.
- Implement the canonical persisted-stay registry binding, subject mapping,
  account/roster/logout lifecycle, explicit opt-in and Disconnect UI.
- Real Android validation: SSO/MFA, cancel/back, retries, expired session,
  switch CrewCheck account and provider account, changed roster during sync,
  refreshed/empty pickup, airplane mode and restoration. Synthetic fixtures do
  not prove provider behavior or real account isolation.
- Any later Wake port retains its own physical local-alarm/Acordei gate. This
  candidate does not port Wake, Infobip, mirror alarms, hotel/van contact details,
  server persistence or store publication.

## Validation

`node --test scripts/regression-mycrewcare-v2.mjs` exercises the actual Android
extraction asset via a synthetic DOM, the actual v2 protocol adapter, controller,
matcher, race cancellation, freshness, privacy and canonical ID boundaries.
Timezone-independent tests run under UTC, America/Sao_Paulo and Pacific/Auckland.
The dedicated CI runs these before and after the complete canonical materializer,
then TypeScript, Vite and Android compilation. Native source assertions are only
guard checks; they do not replace runtime/physical Android validation.

## Single-owner composition with #872

[#907](https://github.com/bmedeiros1987/crewcheck/pull/907) is the sole replacement
candidate for the **MyCrewCare portion** of
[#872](https://github.com/bmedeiros1987/crewcheck/pull/872). Mobile Core owns one
portal/session implementation. #872 retains its remaining Wake/briefing work and
history; it must consume the v2 entrypoint after its Wake-only reconciliation.
Do not replay the old portal, global snapshot runtime, parameterless native bridge
or `scripts/wake-v1/apply.mjs` onto this candidate. That old materializer would
reinstall v1 MainActivity/Home wiring even if the Java portal file were kept.

`scripts/assert-mycrewcare-v2-ownership.mjs` enforces this boundary in CI before
and after canonical preparation. Behavioral composition regressions inject the
old portal, old global key/event listener, old bridge/onResume sync and old
materializer import independently; each must fail. A Wake-only consumer importing
`client/src/lib/myCrewCare.ts` passes. Workflow path filters include all the old
writer surfaces so a future composition attempt cannot silently skip the gate.
A future deliberately reviewed activation must update this gate alongside its
provider/physical/UI evidence; do not remove it merely to turn CI green.

The current native `LinearLayout` is a **provisional validation container**, not
final/premium UI. Mobile Core must reconcile the actual approved app design,
accessibility, spacing, close/back/retry/error states, and return navigation before
activation. UI approval is an additional release gate, not implied by compilation.
Neither PR is ready for merge or activation on CI evidence alone.
