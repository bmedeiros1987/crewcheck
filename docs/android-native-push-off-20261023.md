# Native Android FCM enrollment preparation — OFF

Base main c963094bd044a9e5a772eee890c04b65412dd84f. Android owner coordinated
with notification owner01a16917; that owner maintains Web Push/Telegram. This
draft adds no backend shared-file hunks, registry mount, schema or dispatch writer.
The proposed native registry contract below still needs backend implementation
and review. It does not reuse a browser PushSubscription as a native FCM token.

## Confirmed public identity and remaining configuration

Personal Chrome/Firebase contains API Project, ID api-project-627296893301,
number/sender627296893301, Android com.crewcheck.app,
Firebase app1:627296893301:android:5e12bb9377ceb7e4befb3c. HTTP v1 is enabled;
Spark plan unchanged. Historical sonic-charmer-399015 is a Calendar reference,
not the project containing this registered Android app. No provisioning needed
to establish that identity. Existing google-services.json is available in Console
but was not downloaded. Its public Android API key is not present in this draft;
NativePushPolicy.PUBLIC_API_KEY remains empty and configured() is false.

Service account crewcheck@api-project-627296893301.iam.gserviceaccount.com exists,
enabled, with existing key metadata. No key values were read/copied/generated.
The displayed project IAM principals, including Google-provided grants, did not
show this principal or a dedicated native FCM sender role. This is not proof of
effective cross-project authorization or of runtime credential presence.

Source/workflows/render.yaml have no FCM/FIREBASE/GOOGLE_APPLICATION_CREDENTIALS
configuration reference. GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and Calendar OAuth
exist for different purposes and are not reused. Render's connector exposes no
safe env-name/presence-only read; live FCM environment presence remains unobserved.
The next live audit must return variable names/presence and existing sender identity
only, never values. No Render environment changes are part of this draft.

## What the code actually does

Firebase Messaging SDK is pinned, compiled and a service is declared DISABLED.
NativePushPolicy.ENABLED and ANDROID_PUSH_REGISTRY_ENABLED are literal false,
not environment toggles. FirebaseInitProvider, its Google broadcast receiver and
default messaging service are removed from the merged app manifest. Automatic
messaging initialization, analytics and data collection metadata are false.
The SDK's new c2dm RECEIVE permission is removed; the existing permission set is
asserted against the actual signed AAB manifest in CI. No permission prompt,
token acquisition, installation write, registry I/O or message display occurs OFF.

The native session journal records an opaque installation/owner hint, token,
generation and token revision in private app preferences, never a login bearer.
scope change commits a tombstone and clears the prior token before asynchronous
work. Same-account JWT renewal preserves generation. getToken callbacks capture
generation; callbacks from a prior account/logout cannot update its replacement.
onNewToken marks a new revision pending enrollment. Request acceptance, registry
acceptance and external receipt are distinct. A failed local commit is unconfirmed.

The actual JS auth-will-change event invalidates pending operations and attempts
native cancellation synchronously before the old account token is replaced. A
future registry revoke uses the captured OLD authenticated session, not the new
account's bearer. Late registry results, native generations and token revisions
are checked before reporting registration. Enrollment requires explicit consent;
new accounts inherit none. There is no enrollment UI or backend route in this
draft. Native hints/registration ACKs authenticate neither owner nor delivery.

The receiver deliberately displays NOTHING, even after changing one gate. An
authenticated current-source/consent/authority lease, durable dedup claim and
revocation barrier shared through display/cancel are still absent. Do not insert
NotificationManager.notify here based on a raw server payload. The previous gate
contract's nine-field envelope and NotificationLedger cancellation ordering must
be composed and reviewed first. This avoids resurrecting a logged-out account or
using automatic Firebase notification payload display that bypasses those fences.

## Proposed backend contract (not mounted)

Authenticated /api/platform/notifications/android-installation must derive owner
from the existing server identity, enforce same-origin POST and validate native
project/package/installation. GET must report server consentRevision and registry
revision. Register/rotation needs explicit consent, expected registry revision,
installation, native generation, tokenRevision and bounded token. Client owner
hints are compared, never used as authentication. No token may be logged or sent
back from GET. Protect at rest with an existing authorized protection mechanism;
do not invent another key or silently borrow the Web Push encryption key.

Under existing owner/profile/state locks, CAS register/rotation/revoke and a
durable generation tombstone must reject stale enrollment after logout/account
replacement. Token uniqueness across owners requires atomic reassignment with
prior outbox invalidation, not parallel active owners. Duplicate register of the
same owner/generation/tokenRevision is idempotent. Lower revision never replaces
newer. Revocation and account deletion must invalidate pending native work before
acknowledgement; offline/uncertain revocation is not called confirmed. Admission
and dispatch must recheck current owner/consent/source/deadline/token revision.
Unknown transport or old native schema fails closed.

FCM sender must use an identified existing backend identity with proven
cloudmessaging.messages.create on this project. No new OAuth client, private key,
IAM grant, paid service or real token/send is authorized by this draft. Preserve
durable dispatching/uncertain state; provider acceptance is not device receipt.

## Validation and activation gates

Raw/prepared real TypeScript lifecycle fixtures use synthetic tokens and faked
registry. They cover OFF/no I/O, explicit consent, same-owner renewal, logout,
account switch, expiry, late ACK and cleanup. Java fixture executes the real
NativePushSession state machine under JDK17 CI. Local Java17 is unavailable;
no local Java pass is claimed. CI must compile the actual SDK/runtime/service,
run Java tests and inspect the actual merged signed manifest before review.

Remaining implementation: mounted durable backend registry/CAS and deletion,
UI consent in the existing notification controls, background token-renewal
authentication (a rotation while JS is closed currently waits for reopen),
authenticated admission/revocation/display integration, real provider and
existing sender authorization. Tests must include SQL races/restart, corrupted
journal, revoke failure, forged envelope, replay, stale source and token refresh.
Then a specifically authorized physical test must distinguish foreground,
background, ordinary process removal, locked screen, denied channel/permission,
Doze and force-stop. No physical remote receipt is claimed here.

Play draft37 remains empty. Version policy unchanged144158;144158/144159 already
occupied. This draft creates no release allocation and no replacement of #1183.
Do not upload its build-only AAB. Final source/reviews/tests, complete live writer
coordination/code inventory and isolated phone submission remain Store gates.

Official references:
- https://firebase.google.com/docs/cloud-messaging/android/get-started
- https://firebase.google.com/docs/cloud-messaging/android/receive-messages
- https://firebase.google.com/docs/cloud-messaging/manage-tokens
- https://firebase.google.com/support/release-notes/android
