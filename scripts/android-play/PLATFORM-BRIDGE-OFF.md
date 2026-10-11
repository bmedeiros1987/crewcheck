# Existing platform adapter bridge — OFF

Base: merged PR1003/main4554429a490028e185d1db2349e9dc03c682a490.

Repository-confirmed candidates, not deployed authorization:
- render.yaml declares crewcheck-premium, Node/main, external DATABASE_URL
  (sync:false) and MYSQL_SSL_MODE=REQUIRED. It declares no dedicated release worker.
- server/platform.mjs creates a native mysql2 pool, then returns mysqlAdapter
  with query/connect and normalized rows/rowCount. It does not export that instance.
- Existing crewcheck_telegram_state migration declares JSON payload, one state_key
  primary key and InnoDB. Deployment, current schema, grants, retention and primary
  durability are not proved by the migration.
- Existing GitHub Actions Android and Wear writers use ubuntu-latest, existing
  Play service-account/signing secret references and shared concurrency group
  crewcheck-play-release. The reference name proves neither current validity nor
  actual account principal/access. Their permissions are contents/actions read,
  with no OIDC id-token grant declared. No database access is evidenced there.
- Mobile-only preparation is separately serialized and refuses publishing before
  checkout/secrets. The QA MySQL socket/database remains the sole proved DB test
  connection; no production pool is configured in release workflows.
- Existing application user/admin and scheduler identities do not establish a
  release-executor principal. No scheduler secret is reused or release grant added.

The new inactive bridge resolves the API mismatch: createPlatformJournal takes an
injected existing platform adapter, converts journal ? binds to platform $n binds,
converts normalized rows/rowCount into journal result shapes and maps BEGIN,
COMMIT, ROLLBACK onto the owned connection. Direct ? calls through the old platform
adapter would lose parameters, so the translation is checked against bind count.
The existing pure platform factory is extracted without changing SQL normalization
or pool setup. Its borrowed connections additionally expose discard() only when
native destroy exists. The bridge rejects connect fallback/same adapter or missing
release/discard capabilities. Unknown commit response discards rather than returning
that connection to the pool. Neither factory creates a connection from credentials.

No connection URL/environment access, import of live platform state, new endpoint,
release authentication, production injection or publisher invocation is introduced.
Application code imports the same pure factory; no application handler imports the
journal bridge. Constructor calls do no query/connect. Tests use injected fixtures
and the existing disposable MySQL QA only, including a real bridge pending write
whose SQL acknowledgement is lost before the external callback (callback zero).

Next small OFF increment: serialized Python-to-Node executor protocol with an
allowlisted package/owner/source/controller/run/version/artifact binding and explicit
capability injection; reject absent transport and policy-only artifacts before any
reserve/edit. Add producer contract gates for publish.py, allocate_versions.py and
crewwatch_internal.py before session/edit creation, with tests proving absent,
foreign/stale/uncertain coordination never opens an edit. The shared reservation
must include Wear even when a mobile task uploads only phone bytes. Companion is
separate. No automatic trigger, Play calls, coordinator deployment or grant follows
from this transport patch. Legacy CLI activation and external Console writers need
an independently reviewed adoption plan.

Minimal product decision, after configuration evidence is available: should release
coordination reuse the existing app server/database through a restricted internal
interface, or an already-existing authorized release executor? The first is a code
candidate that avoids copying DB credentials to CI; an authorized machine caller
for it is not proved. The user need not identify pool names. The remaining access
questions are for the existing environment administrator: authorized caller,
connectivity and grants for this namespace, primary durability/retention/backup,
Console writer coordination, unresolved edits and read-only Play eligibility.
Render metadata lookup remains paused until workspace selection is confirmed.
