# Telegram Concierge: isolated menu candidate

Base: `550b298b` (remote main fetched 2026-10-19). Original checkout `/Users/marinamoura/fabric-work/crewcheck` was read only. Local clone uses `--no-hardlinks`; no alternates. `git fsck --full --no-dangling` verifies object integrity. No AGENTS.md or `.agents/skills` exists in this revision or the original checkout; no local memories were edited.

## Existing work and ownership

- PR888 is a separate WhatsApp menu/PDF/visitor draft, head `4a46197e2b19a39269010f08703088d27c57cf2b`. No cherry-pick, WhatsApp runtime changes or activation.
- PR920 owns Telegram POI route entities (`server/concierge/telegram-place-links.mjs` and POI preparation); no overlapping edits.
- Main already contains `stay-menu.mjs`, privacy-bound hotel history, and canonical `journey-programs.mjs`. The menu reuses the existing hotel-history/handoff producers, not a second stay database.
- PR1093 salary remains draft, ownership supplied as 01a15140. No Home, salary, financial formula, phone or platform edits.
- Other open relevant drafts inventoried: 864 OpenClaw, 909/910 briefing, 937 Radar read-only, 938 company transport, 1086 hotel binding HOLD, 999/998/997 stay-alarm OFF, 656 regulatory engine. These were not imported.

## Menu-only implementation

Home: Hoje, Escala, Diárias, Hotéis, Mais. Additional pages: weather, wellness, hotels, with Voltar/Início. No advertised calling capability. Initial greeting rejects a numeric display name rather than presenting an employee/account number. It retains the existing preferred-name producer.

Every menu payload is opaque, under the Telegram 64-byte limit, and bound to chat plus current linked account/access-key binding. Per-callback private sender validation and linked-profile resolution precede any snapshot lookup. Tokens expire in 15 minutes, are one-use, bounded in memory and invalid after restart. Unlinked/group/other-sender callbacks do not load a roster. Old legacy `cc_nav` callbacks refresh a safe menu. Weather/emergency/call callbacks retain their existing owners; this candidate does not claim to harden those independent handlers.

Flight and ICAO questions are explicit, validated and cancelable, then call `buildTelegramConciergeReply` directly with the current profile/snapshot. No invisible slash insertion, fake incoming Telegram messages, callback IDs or personal data in display text. Existing producer permissions still apply. The existing Telegram profile resolver is reused; its local-versus-durable link cache/revocation behavior needs independent review before release. Tokens do not provide new authorization.

Documentation consulted: [InlineKeyboardMarkup](https://core.telegram.org/bots/api#inlinekeyboardmarkup), [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton), [CallbackQuery](https://core.telegram.org/bots/api#callbackquery), [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery). Callbacks are acknowledged, data is treated as untrusted, inaccessible/group messages are rejected. This is an inline keyboard, not a reply keyboard pretending to type commands.

## Unfinished financial requirement: do not claim completion

The existing `/diarias` handler is `conciergePerDiemReply`, which counts final destinations outside base. It has no financial amounts or payment dates. The candidate Diárias button explicitly reports missing chat financial support rather than showing pernoites. **Typed `/diarias` still reaches the legacy producer; the actual financial bug is not fixed in this menu-only checkpoint.**

The existing Android/web Concierge financial card consumes `client/src/lib/financialLocalUpcoming.ts`, `nextFinancialPayment.ts` and the account-bound browser calculation snapshot. That snapshot is not present in the Telegram roster payload. Persisted `/api/platform/finance/upcoming` uses `server/financial-ledger-route.mjs`, SQL store and `shared/financialUpcoming.mjs`; its gate is OFF by default and its identity is JWT owner, not a Telegram profile. No gate was inspected in production or activated. A bridge must establish an authorized owner/role and availability contract; do not fabricate `authenticated:true`, serialize browser local storage, use a visitor identity, infer APZ or start a second calculator. Coordinate this separately with 01a15140.

## Unfinished regulatory requirement

`conciergeComplianceReply` is independent of the canonical engine. It takes `conciergeProgramRecords`, one record per eligible `roster.days` row (not necessarily one civil day), `dutyHours >= 11`, and the gap between consecutive record end/start `<12h`. Both numbers are hardcoded. Duplicate rows or two blocks in a day can create false short gaps; ASB without clocks can become 24 hours. Record timestamps use fixed `-03:00`; missing clocks can become midnight and next-day end. Splitting actual journeys across days or merging them within a day is not proved by this producer. There is no occurrence ID, legal source, article/clause, validity, applicable ACT/RBAC binding, calculation version, source document or dedicated alert deduplication in its returned string. Webhook update deduplication is a separate 30-minute in-memory update-ID map.

Available preformatted facts: day/date/year/month, pairing/type, `dutyHours`, dutyReport/dutyDebrief, legs with flight/origin/destination/departure/arrival, computed start/end; computed times can include fallback, so they cannot be labeled published facts indiscriminately. Canonical journey projection already has journey/event IDs, start/end and `endKind`, but importing it alone does not establish an applicable legal basis or published clock provenance. The independent audit also flags potential required-rest issues; do not blindly replace with `analyzeCompliance`. Review `publishedDutyEndpoints`/`measureCanonicalDuty` or equivalent strict provenance gates before connecting any normative result; journey IDs alone are insufficient.

The new menu's Revisar escala action reports incompleteness and does not emit the generic limit counts. **Typed `/conformidade` and other legacy semantic paths are unchanged and still need correction.** Required next contract: each occurrence with verified source events/date/clocks/timezone, duration and provenance, applicable rule version/document/article/clause, missing inputs, and account-bound opaque detail tokens. No new formulas were introduced.

## Hotels, Android links and Play Store

`Home.tsx` accepts `?view=hotels` and renders HotelsView. `stayEditorNavigation.ts` requires authenticated account/token and an explicit selected stay in transient context; no guessed event URL is valid. Current Android manifest exposes PDF/share and Wear handlers but no verified HTTPS App Link for this route. A web `?view=hotels` URL is therefore not proof that the APK opens the hotel screen. No custom URI, hotel/room parameter, app-link permission or MainActivity edit was added. Validate deployment origin and coordinate with phone owner 01a14cd3 before adding an APK promise.

Proposed truthful listing paragraph, subject to actual release verification: “Conheça o CrewCierge, o assistente do CrewCheck. Consulte sua programação, radar e meteorologia, acompanhe informações da escala e encontre os recursos do app em uma conversa simples. O Telegram pode ser vinculado nas configurações do CrewCheck.” Do not advertise financial Telegram answers, legal conclusions, calls or WhatsApp paid delivery from this candidate.

Suggested contextual app access for the Home owner: a visible “Conheça o CrewCierge” entry pointing to existing `?view=concierge`, with Telegram linking in the existing settings flow. No Home edits here. Actual screenshot must come from the running existing screen under a synthetic/demo account and verified release, not a mock. No real screenshot or Library upload/ID has been produced in this checkpoint; no Play submission or publication occurred.

## Validation and release limits

- Clean canonical preparation succeeded and prepared `server.mjs` passed syntax validation.
- Offline fixture regression covers identity lookup on every callback, same-user dispatch, cross-sender/group denial, unlink/relink, TTL, replay/concurrency, guided input and cancellation, and missing financial/legal support.
- Replaying the historical whole preparation chain onto an already materialized tree failed at preexisting v1396 source-marker checks. A clean restore followed by canonical preparation succeeded. Own menu materializer is checked for idempotence separately.
- No full npm build: npm/dependencies are absent from this isolated Mac shell. Added CI runs canonical preparation, syntax and offline fixture regression.
- No real Telegram request/message, webhook, credentials, permissions, paid messaging, deployment, production records or browser tabs were used or changed.

This candidate is a menu checkpoint, not completion of full Telegram financial/regulatory/hotel parity or Play assets. Independent review and CI are required before merge/deployment.
