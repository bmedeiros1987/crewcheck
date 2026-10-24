# Shared wakeup script and account language

Stacked on the reviewed call-transport correction #1225. Code/test draft only:
no real calls, provider profile changes, secrets, migrations or activation.
The existing `phone_binding_unavailable` guard stays in place; WhatsApp linking
is not voice-call consent. Telegram text and CallMeBot calls remain distinct.
The existing app selector also holds `telegram-call` pending canonical binding,
franchise and recipient authorization. This draft does not remove that readiness
hold or treat a Telegram text message as a call. A separate capability must prove
those conditions before the selector can honestly enable scheduled calls; a
configured transport alone is insufficient.

The actual scheduler/delivery bootstrap uses the same formatter for Telegram
text, CallMeBot speech and Infobip speech. The existing dispatch CAS, cancellation
cutoff, recipient revalidation and partial/uncertain terminal outcomes remain
unchanged. No new scheduler or queue is introduced.

Neutral wakeups use the canonical account locale and a welcoming opening, including
the requested reminder to drink water. Supported script locales match the current
system profile contract: `pt-BR`, `en-US`, `es-ES`. An unsupported profile locale
gets an English neutral fallback, without schedule details or an implied translation.
Custom legacy wakeup messages remain custom; they are not silently translated.
Account/password-reset callers without a wakeup locale keep their prior behavior.

## Explicit program choice

The existing wakeup editor adds an unchecked, per-alarm choice to share the
confirmed program in that alert. Consent is scoped to account, canonical event,
automatic mode and the selected instant. Account/event/time/manual/hotel-context
changes invalidate it synchronously. Saving a preference or opening a page does
not enroll or send anything.

`safeScheduleJob` accepts that choice only for an authenticated `wakeup:` job.
It reads the canonical profile and active-roster briefing, verifies the requested
event belongs to the next duty and stores only owner/event hashes and a source
digest in the existing message column. Client roster fields, hotel names and
times are not narration sources. Forged reserved message envelopes without the
explicit choice are rejected. No extra table or real migration is needed.

After the existing dispatch checks, delivery rereads profile/language and the
canonical source. A different/restricted owner blocks the attempt. A changed,
missing or unavailable roster produces a neutral wakeup instead of stale details.
The source means the current imported active roster; a DB read does not establish
a fresh airline publication. Effects already started cannot be recalled.

The short script labels presentation and flight departure separately, includes
the profile timezone's explicit GMT offset and local date, and never substitutes
departure for a missing presentation. The first verified flight fits within the
shared 240-character bound; whole sentences are kept, with remaining sectors
referred to the app when space permits. Text acceptance is not answered-call proof.

## Hotel limitation

No server-verified hotel/lobby presentation is currently supplied by the canonical
briefing source. The local stay editor's APZ/signature does not establish that
server authority. Therefore hotel-context narration is disabled and no lobby time
is invented. Adding it requires the existing confirmed stay binding to be made
available on the server with owner/event/revision checks. It must remain separate
from duty presentation, APZ and departure. This draft does not claim hotel speech
or physical alarm restoration is complete.

## Provider language behavior

- CallMeBot receives current Standard voice names for the selected profile locale:
  pt-BR-Standard-C, en-US-Standard-C, es-ES-Standard-F. Its own documentation requires
  recipient authorization and Standard voices. No Wavenet/premium voice is selected.
- Infobip native TTS receives the locale's language and its default voice, without
  carrying a potentially incompatible globally configured voice into another locale.
- The existing private ElevenLabs path is retained for its documented default
  multilingual-v2 model. An unknown model is not assumed to support a wakeup locale;
  the single native-TTS attempt is selected before any private-audio I/O. Existing
  non-wakeup callers are unchanged. No model/voice setting is saved or provisioned.
- Provider/account-specific support and billing still need operational validation.
  No successful HTTP response proves that the recipient heard the script, and no
  automatic second call is made after a configured attempt becomes uncertain.

Primary references checked October 24, 2026:

- [CallMeBot Telegram speech contract](https://www.callmebot.com/telegram-call-api/)
- [Google supported Standard voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types)
- [Infobip languages/default voices](https://www.infobip.com/docs/voice-and-video/reference)
- [ElevenLabs model/language support](https://elevenlabs.io/docs/overview/models)

## Synthetic validation

`regression-wakeup-spoken-program.mjs` verifies the three locales, missing clocks,
timezone/day rollover, whole-sentence bounds, no injected markup/hotel/APZ,
canonical event/owner/source changes, neutral fallback, explicit-consent rejection,
actual scheduling handler and real prepared canonical source/engine. The real
transport builders are inspected through fake fetch only. Existing queue/CAS,
phone-binding, date/DST and raw/prepared transport suites remain required.
