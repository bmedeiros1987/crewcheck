# Telegram navigation reuse — independent review packet

Base: main `5f64d0379a75b5a770fc06c218f45d29b54d9732`. Separate branch `fix/telegram-navigation-reuse`; no changes from/to draft #1115. Main and open PR ownership were checked before branch creation. #1086 owns hotel reconciliation/writes (HOLD), #997–999 the native OFF stack, #920 POI routes, #888 WhatsApp. This patch changes the owned Telegram menu/materializer, adds its edit transport, and updates synthetic harnesses/CI for that new runtime dependency. No Home, financial, native, hotel writer or shared stay producer edits.

## Result

The five root choices remain. A callback consumes its ticket before asynchronous work. An issued navigation-only message can be edited in place only when its recorded message ID and exact text match the callback message, with a valid same-owner ticket. The first transition from an externally issued root uses a new navigation message, because the module cannot prove that root contains only replaceable content. Results/history/factual foundations are retained; their consumed keyboard alone is removed. Factual snapshot/page/owner guards are unchanged.

For edit failure (HTTP, exception, malformed JSON, or uncertain delivery), the newly minted edit token is retired, the old keyboard is cleared best-effort, identity is checked again, and at most one new navigation message is sent. If clearing fails, old buttons can remain visible but have no valid ticket. The edit/clear requests time out after eight seconds; they never delete messages or alter configuration.

Callbacks from consumed/expired/previous-process tickets give concise callback feedback without appending another root or executing a producer. They do not cancel a newer parameter question. A per-message in-flight guard retains a newly issued ticket if it is clicked while its edit is completing; the user can retry after the clear busy notice. Existing valid navigation cancels its prior pending input as before.

Hotéis offers `Abrir Hotéis no app` → `https://crewcheck.online/?view=hotels`, Histórico and Início. The reply explicitly says it opens the web version. Home's existing initial-view normalizer accepts hotels and renders HotelsView. There are no account/room/event identifiers in that URL, guessed editor context, APK promise, auth bypass or new Android route. Existing hotel history and typed hotel/room producers remain available; history's slash-based next page is a separate follow-up and is not changed here.

## Evidence and limits

New tests run in raw module mode and materialized production-runtime mode. The latter extracts actual processTelegramUpdate, runtime initialization and sendTelegramMessage into a VM, uses the real edit transport adapter, and replaces fetch with synthetic responses. A clock is injected for TTL. Cases cover navigation/back/root/history retention, hotel URL/labels, HTTP/exception/uncertain edit, failed clear, replay, concurrent callbacks during/before delivery, revoked/private identity, in-flight revocation, expiration, restart and malformed provider JSON. No actual Telegram calls or DB access.

Existing menu, factual handler, hotel-history privacy, Wellhub routing/payload, SOS and weather canary regressions are rerun. Wellhub's producer VM receives the new real transport factory with an empty URL; edit delivery itself is tested in the dedicated suite. Stale-facts assertions now inspect callback feedback and assert no additional send. No domain expectations or factual calculations are relaxed.

Run order: raw suite → full production preparation + TypeScript check → production build → prepared suite and integration regressions. This avoids treating unprepared source as production or invalidating preparation cache after artifact-producing tests. CI uploads exact prepared server, menu/transport/materializer/test sources, HEAD and hashes.

Independent review and exact-head CI remain required before integration. No live-client accessibility/scroll/focus or Android app-link behavior is claimed by VM tests. No real messages, webhooks, credentials, permissions, financial activation, paid messaging, merge, deployment or store publication are part of this draft.

Official API references: [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton), [editMessageText](https://core.telegram.org/bots/api#editmessagetext), [editMessageReplyMarkup](https://core.telegram.org/bots/api#editmessagereplymarkup).
