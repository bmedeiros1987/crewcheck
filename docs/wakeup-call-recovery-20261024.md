# Wakeup call transport recovery

This slice changes code only. No provider profile, credentials, flags, deployment,
phone binding or real call was changed. Phone scheduling remains unavailable
until the server can prove a verified recipient and the relevant consent.

The source-prepared bootstrap already supports combined Telegram text/call
channels through v1414. This change preserves that implementation and the
existing scheduler, cancellation cutoff, CAS and durable uncertain/partial states.

CallMeBot now has one bounded HTTP attempt, including the response body, with
redirects disabled. Its HTTP response is an acceptance signal only; neither text
carbon copy nor success confirms an answered call or spoken audio. The recipient
must independently authorize CallMeBot and have a Telegram username. Existing
`CALLMEBOT_TELEGRAM_CALL_ENABLED` and voice configuration remain effective.

Infobip TTS validates the sole response receipt against the requested destination
and an accepted status group. HTTP 200 alone is insufficient. Unknown responses,
timeouts and lost ACKs remain uncertain, without automatic retries. The prepared
private ElevenLabs audio path remains selected by the existing configuration;
after a configured attempt fails, it no longer falls through into another call.
Fallback to TTS is possible only when the private-audio path reports unconfigured.
The admin/manual test endpoint is separate and unchanged.

## Remaining requested work

This is not a claim that the alarm has been restored in production. In particular:

- Infobip scheduled calls remain blocked by `phone_binding_unavailable`. A client
  number, configured sender or WhatsApp consent is not voice-call binding proof.
- A shared welcoming script, account language and roster/hotel narration still
  need composition with canonical sources and explicit external-content consent.
  Current generated wakeup requests deliberately use neutral text. Do not recover
  old client roster strings or infer hotel presentation from departure/APZ.
- The existing operational briefing source can verify next-duty presentation and
  flights. It does not establish the requested alarm's event correspondence or a
  confirmed hotel lobby presentation. Those must be bound before narration.
- CallMeBot requires Standard voices; do not select Wavenet or promise support for
  every app language. Infobip's default Standard voice differs from Neural and
  Generative voice billing. No new voice or cost is selected here.

Official references checked October 24, 2026:

- [CallMeBot Telegram calls](https://www.callmebot.com/telegram-call-api/)
- [CallMeBot voice selection](https://www.callmebot.com/blog/telegram-phone-calls-from-openhab/)
- [Infobip speech languages](https://www.infobip.com/docs/voice-and-video/reference)
- [Infobip advanced Voice messages](https://www.infobip.com/docs/api/channels/voice/voice-message/send-advanced-voice-tts)

## WhatsApp linking finding, separate from voice

The published test caller accepts only `Teste CrewCierge`, so it ignores six-digit
canonical linking codes. With no existing canonical link, neither the OFF receiver
nor the single-test mode completes enrollment. Do not create a link by SQL or route
the provider into a differently authenticated webhook to bypass this boundary.

The intended authenticated UI is
`https://crewcheck.online/app?view=notifications` → Vínculos de canais → Vincular
WhatsApp. Clicking creates a ten-minute challenge and is a write, not a diagnostic
read. Its destination comes from `CREWCHECK_WHATSAPP_NUMBER` or
`WHATSAPP_BUSINESS_NUMBER`, separately from the Infobip sender configuration.
The minimum next code change is a narrowly authorized canonical handshake without
consuming the one neutral test response or enabling general Concierge replies.
API-key presence/format is not proof of WhatsApp send scope or current service window.

## Verification

`scripts/regression-wakeup-call-delivery.mjs` runs offline in raw and prepared
forms. It covers one request, disabled/invalid recipients, deadline, response limit,
provider rejection/mismatch, partial/uncertain durable state, concurrent claims and
restart. The prepared wrapper is evaluated directly to verify no fallback after a
configured private-audio attempt. Existing queue, date/timezone, selection and
v14404/v14405 regressions remain required. No real database or external call is used.
