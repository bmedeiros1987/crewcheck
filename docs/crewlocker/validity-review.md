# CrewLocker validity review

Base confirmed: main 33c39cde4b54edf1add199dcb10343a9dec20d3a (#971).
No implementation from the offline Mac proposal was assumed. No AGENTS.md or
.agents skills were present in the repository or selected workspace directories.
README instructions preserve the current UI. Scope excludes Home, Telegram,
Cirium, Watch, Calendar and PR #969.

A file contains independent license/rating/CMA-class records. Expiry is exact,
month-only, permanent (license only) or unknown. Transcription confirmation,
source verification, signature verification and fitness remain separate from
civil-calendar temporal state. Manual editing cannot promote source/signature
verification. Fitness is always not_assessed; no operational authorization.
The ANAC service confirms a permanent cabin-crew license and separate validity
of ratings, CMA and other requirements:
https://www.gov.br/pt-br/servicos/obter-autorizacao-para-trabalhar-como-comissario-de-voo
(accessed 2026-10-10). No regulatory automatic expiry formula is implemented.

Month-only expiry displays MM/YYYY with no official day. Before that month,
alert planning uses its first day; within that month the UI asks to confirm the
day, and only after the month ends says the informed period ended. All planning
milestones are explicitly conservative; neither the first nor last day is
represented as an official expiry. Exact expiry remains within the informed
period through its civil date in the device's current timezone. Timezone changes
re-evaluate civil today, without inventing UTC expiry instants.

Review workflow is manual, with confirmed transcription per record. No PDF/OCR
extraction claim or automatic source check. Imported proposals remain unconfirmed.
Renewal adds a replacement and keeps the old record as superseded. Each edit has
an optimistic document revision; concurrent stale edits fail for review. Local
notice reservation is an IndexedDB read/write transaction, deduped across tabs
by document/record revision/milestone. Unchanged records retain their ledger when
another record is renewed. Only the current milestone is shown after reopening;
old crossed thresholds do not flood the user. All active due notices remain
visible even after the generic toast has been deduped.

Each account has a separate IndexedDB namespace, salt and PIN. CryptoKeys are
bound in memory to the token and auth-event generation. Logout, expiry, account
switch or token rotation requires unlocking again. Async reads and mutations
check their captured session before returning or committing data. Anonymous,
guest and visitor sessions are refused. Existing global-vault records have no
provable owner and are left untouched, with no automatic assignment. Reimport
original files after unlocking the account vault. This is an app-level account
boundary, not protection against a compromised origin or a person with device
access. As in the existing design, files are AES-GCM encrypted; metadata remains
local IndexedDB plaintext. No server sync or metadata encryption is added.
Creating a PIN cannot overwrite an existing PIN; no recovery/reset mechanism is
introduced. Forgotten-PIN recovery and explicit legacy-vault migration are
separate follow-ups requiring a safe user-reviewed flow.

## Shared channel handoff to parent

Current delivery: generic local toast + detailed CrewLocker UI, only while the
view is open and unlocked. No browser permission request, system notification,
transport, scheduler, service-worker background job, backend write or real send.
No new credential, provider or paid capability. The preparation function
prepareValidityExternalNotice returns enabled:false and only a generic message;
it accepts no medical/document data. It is a privacy contract, not an outbox or
an idempotent delivery job.

For app-closed delivery, coordinate with the parallel shared-channel owner:
choose an authorized account-scoped channel and scheduler, consent and linking
gates, hashed opaque job keys (account/document/record/revision/milestone),
renewal/deletion invalidation, logout/session cancellation and cross-device
idempotency. The generic external text must not include medical classes, dates,
file labels, IDs or source documents. Provider acceptance is not delivered.
Because vault metadata is local and app may be closed, scheduling must be an
explicit approved design with minimal sync or native scheduling; this draft does
not promise app-closed or cross-device alerts. No Telegram queue was modified.

## Independent review gates

Run engine and compiled browser regressions both raw and after v139 preparation,
then TypeScript and production build. Dedicated CI uploads only synthetic
reports/screenshots. Tests cover leap/invalid dates, four timezone boundaries,
month-only/permanent/unknown, multiple classes, proposal confirmation, renewals,
transactional reservation/concurrent edits, PIN create races, session/logout and
owner isolation; compiled manual UI at 320/390/1440, light/dark, focus and labels.
Synthetic files use different dates/classes and no real document or identifiers.
Independent review and CI verdict remain mandatory before merge/deploy.

## Local validation outcome

Raw and prepared production-module regressions passed. The compiled CrewLocker
component passed six browser combinations per state (320/390/1440, light/dark),
including visible keyboard focus, manual confirmation, renewal, reload, logout
and account switching. No external request or notification permission prompt.
TypeScript passed raw and prepared. Standard npm run build passed in the prepared
application (Vite reports the existing large-chunk size warning). Synthetic
reports and screenshots are saved under artifacts/crewlocker-validity and in the
Library review package; they are not committed as user data. CI and independent
review verdicts are still required; no merge or deployment performed.
