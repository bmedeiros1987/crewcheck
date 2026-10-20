# Telegram Concierge: isolated menu candidate

Base: `550b298b` (remote main fetched 2026-10-19). Original checkout `/Users/marinamoura/fabric-work/crewcheck` was read only. Local clone uses `--no-hardlinks`; no alternates. `git fsck --full --no-dangling` verifies object integrity. No AGENTS.md or `.agents/skills` exists in this revision or the original checkout; no local memories were edited.

## Existing work and ownership

- PR888 is a separate WhatsApp menu/PDF/visitor draft, head `4a46197e2b19a39269010f08703088d27c57cf2b`. No cherry-pick, WhatsApp runtime changes or activation.
- PR920 owns Telegram POI route entities (`server/concierge/telegram-place-links.mjs` and POI preparation); no overlapping edits.
- Main already contains `stay-menu.mjs`, privacy-bound hotel history, and canonical `journey-programs.mjs`. The menu reuses the existing hotel-history/handoff producers, not a second stay database.
- The stay-menu materializer/test now recognize the explicit new inline-menu integration instead of requiring the old reply-keyboard literal. Stay data queries and permissions remain unchanged.
- PR1093 salary remains draft, ownership supplied as 01a15140. No Home, salary, financial formula, phone or platform edits.
- Other open relevant drafts inventoried: 864 OpenClaw, 909/910 briefing, 937 Radar read-only, 938 company transport, 1086 hotel binding HOLD, 999/998/997 stay-alarm OFF, 656 regulatory engine. These were not imported.

## Menu-only implementation

Home: Hoje, Escala, Diárias, Hotéis, Mais. Additional pages: weather, wellness, hotels, with Voltar/Início. No advertised calling capability. Initial greeting rejects a numeric display name rather than presenting an employee/account number. It retains the existing preferred-name producer.

Every menu payload is opaque, under the Telegram 64-byte limit, and bound to chat plus current linked account/access-key binding. Per-callback private sender validation and linked-profile resolution precede any snapshot lookup. Tokens expire in 15 minutes, are one-use, bounded in memory and invalid after restart. Unlinked/group/other-sender callbacks do not load a roster. Old legacy `cc_nav` callbacks refresh a safe menu. Weather/emergency/call callbacks retain their existing owners; this candidate does not claim to harden those independent handlers.

Flight and ICAO questions are explicit, validated and cancelable, then call `buildTelegramConciergeReply` directly with the current profile/snapshot. No invisible slash insertion, fake incoming Telegram messages, callback IDs or personal data in display text. Existing producer permissions still apply. The existing Telegram profile resolver is reused; its local-versus-durable link cache/revocation behavior needs independent review before release. Tokens do not provide new authorization.

Documentation consulted: [InlineKeyboardMarkup](https://core.telegram.org/bots/api#inlinekeyboardmarkup), [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton), [CallbackQuery](https://core.telegram.org/bots/api#callbackquery), [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery). Callbacks are acknowledged, data is treated as untrusted, inaccessible/group messages are rejected. This is an inline keyboard, not a reply keyboard pretending to type commands.

## Financial data availability and consistent commands

The old `/diarias` handler `conciergePerDiemReply` counted final destinations outside base, without financial amounts or payment dates. The materializer now replaces that response and the Diárias button uses the same `missingFinanceReply`: values, currencies, expected payment dates and calculation status are unavailable in the Telegram payload. No pernoite count is presented as financial data. The response includes the existing authenticated web route `https://crewcheck.online/?view=perdiem`; the button offers the same URL. This does not claim APK deep-link support or fabricate a financial calculation.

The existing Android/web Concierge financial card consumes `client/src/lib/financialLocalUpcoming.ts`, `nextFinancialPayment.ts` and the account-bound browser calculation snapshot. That snapshot is not present in the Telegram roster payload. Persisted `/api/platform/finance/upcoming` uses `server/financial-ledger-route.mjs`, SQL store and `shared/financialUpcoming.mjs`; its gate is OFF by default and its identity is JWT owner, not a Telegram profile. No gate was inspected in production or activated. A bridge must establish an authorized owner/role and availability contract; do not fabricate `authenticated:true`, serialize browser local storage, use a visitor identity, infer APZ or start a second calculator. Coordinate this separately with 01a15140.

Exact files for a separately reviewed financial integration (read only in this patch):

- Identity entry point/gate: `server/platform.mjs` (`financialLedgerRoute`), `server/v139/common.mjs` (`verifyJwt`, `requestToken`, `safeEmail`).
- Financial ownership/reader/store: `server/financial-ledger-route.mjs`, `server/financial-ledger.mjs` (`ledgerOwner`), `server/financial-ledger-sql.mjs`, `shared/financialUpcoming.mjs`, `shared/financialReadModel.mjs`.
- Capture/provenance: `server/financial-canonical-capture.mjs`, `client/src/components/finance/CanonicalForecastCapture.tsx`.
- Current browser producer/presentation: `client/src/components/finance/HomeFinancialEstimate.tsx`, `ConciergeFinancialPreview.tsx`, `client/src/lib/financialLocalUpcoming.ts`, `nextFinancialPayment.ts`.
- Existing Telegram binding/profile/snapshot functions are materialized in `server.mjs`; link persistence is separate from the ledger JWT owner contract. No JWT/auth file, access token, ledger permission, migration or gate is changed here. Callback nonces are ephemeral UI references, not auth tokens.

## Unfinished regulatory requirement

The old `conciergeComplianceReply` was independent of the canonical engine. It took `conciergeProgramRecords`, one record per eligible `roster.days` row (not necessarily one civil day), `dutyHours >= 11`, and the gap between consecutive record end/start `<12h`. Both numbers were hardcoded. Duplicate rows or two blocks in a day can create false short gaps; ASB without clocks can become 24 hours. Record timestamps use fixed `-03:00`; missing clocks can become midnight and next-day end. Splitting actual journeys across days or merging them within a day is not proved by this producer. There is no occurrence ID, legal source, article/clause, validity, applicable ACT/RBAC binding, calculation version, source document or dedicated alert deduplication in its returned string. Webhook update deduplication is a separate 30-minute in-memory update-ID map.

Available preformatted facts: day/date/year/month, pairing/type, `dutyHours`, dutyReport/dutyDebrief, legs with flight/origin/destination/departure/arrival, computed start/end; computed times can include fallback, so they cannot be labeled published facts indiscriminately. Canonical journey projection already has journey/event IDs, start/end and `endKind`, but importing it alone does not establish an applicable legal basis or published clock provenance. The independent audit also flags potential required-rest issues; do not blindly replace with `analyzeCompliance`. Review `publishedDutyEndpoints`/`measureCanonicalDuty` or equivalent strict provenance gates before connecting any normative result; journey IDs alone are insufficient.

The materializer now replaces `conciergeComplianceReply`; typed `/conformidade` and the new Revisar escala button use the exact same `missingComplianceReply`. They report unavailable provenance/foundation and do not emit generic counts or thresholds as applicable limits. No clock is presented as published without source proof. Required next contract: each occurrence with verified source events/date/clocks/timezone, duration and provenance, applicable rule version/document/article/clause, missing inputs, and account-bound opaque detail tokens. No new formulas were introduced. `/regulamentacao` is a separate existing handler outside this patch; this change does not validate its legal regime.

## Hotels, Android links and Play Store

`Home.tsx` accepts `?view=hotels` and renders HotelsView. `stayEditorNavigation.ts` requires authenticated account/token and an explicit selected stay in transient context; no guessed event URL is valid. Current Android manifest exposes PDF/share and Wear handlers but no verified HTTPS App Link for this route. A web `?view=hotels` URL is therefore not proof that the APK opens the hotel screen. No custom URI, hotel/room parameter, app-link permission or MainActivity edit was added. Validate deployment origin and coordinate with phone owner 01a14cd3 before adding an APK promise.

Proposed truthful listing paragraph, subject to actual release verification: “Conheça o CrewCierge, o assistente do CrewCheck. Consulte sua programação, radar e meteorologia, acompanhe informações da escala e encontre os recursos do app em uma conversa simples. O Telegram pode ser vinculado nas configurações do CrewCheck.” Do not advertise financial Telegram answers, legal conclusions, calls or WhatsApp paid delivery from this candidate.

Suggested contextual app access for the Home owner: a visible “Conheça o CrewCierge” entry pointing to existing `?view=concierge`, with Telegram linking in the existing settings flow. No Home edits here. Actual screenshot must come from the running existing screen under a synthetic/demo account and verified release, not a mock. No real screenshot or Library upload/ID has been produced in this checkpoint; no Play submission or publication occurred.

## Validation and release limits

- Clean canonical preparation succeeded and prepared `server.mjs` passed syntax validation.
- Offline fixture regression covers identity lookup on every callback, same-user dispatch, cross-sender/group denial, unlink/relink, TTL, replay/concurrency, guided input and cancellation, and missing financial/legal support.
- Replaying the historical whole preparation chain onto an already materialized tree failed at preexisting v1396 source-marker checks. A clean restore followed by canonical preparation succeeded. Own menu materializer is checked for idempotence separately.
- Node 22/npm were found under `/Users/marinamoura/.local/node/node-v22.23.3-darwin-arm64/bin`; exact `package-lock.json` dependencies were installed with `npm ci` in this isolated clone. Full `npm run check` and `npm run build` passed (existing Vite chunk-size warning). CI includes these checks plus canonical preparation, syntax and offline fixtures.
- Prepared command-dispatch fixtures cover overlap, duplicate rows, same-day blocks, missing ASB clocks, +2 marker, estimated clocks and different-timezone/canonical-ID-without-provenance inputs. They verify the insufficient-data response without deriving legal conclusions or financial amounts. Stay-menu privacy/history/idempotence regression passed. Human-voice and natural-language regressions passed.
- Optional historical `regression-v14-0-3-telegram-human-concierge.mjs` fails its obsolete release assertion (`14.0.5` expected, current `14.4.11`) before reaching menu assertions. This is not reported as a passing check; no unrelated release expectation was changed.
- No real Telegram request/message, webhook, credentials, permissions, paid messaging, deployment, production records or browser tabs were used or changed.

This candidate is a menu checkpoint, not completion of full Telegram financial/regulatory/hotel parity or Play assets. Independent review and CI are required before merge/deployment.

Before push, remote main was reconfirmed as `550b298b`; there was no existing remote `feat/telegram-concierge-menu` branch or competing Telegram-menu PR. Newly inventoried PR1094 is a separate foreign-allowance partiality fix, not imported.

## Consolidated independent-review fixes

The original review SHA remains available as CI artifact `wellhub-compiled-routing`, artifact ID `12162766334`, run `39197568844`, head `7624d2f61811be8a77efa47b662188482034a457`. Its prepared `server.mjs` SHA-256 is `be34b16e8d2929982da9397cd24a270bd242c5457c963bc323028772c50ee5ed`; a clean archive/reproduction on the Mac generated exactly the same hash. No environment, credentials, private roster or Library transfer is involved.

That SHA's CI reached terminal with two failures: Wellhub conversation and deep-link VM fixtures lacked the new menu runtime. Tests now instantiate the real menu module, preserving assertions. The menu-specific workflow itself passed. The historical version assertion was independently reproduced on clean base `550b298b` (actual 14.4.11, expected 14.0.5); its gate remains unchanged.

Review corrections:

- Expired/consumed/legacy callbacks clear only the validated current chat/account's pending question before showing a new root. Another sender cannot cancel the owner's flow.
- Prompt state is correlated with the actual sendMessage result's message ID/date. Missing transport evidence fails closed. Parameter messages must be newer, with matching reply-to when supplied and within TTL. Old/reordered input cannot execute the pending question.
- Emergency, help and navigation escape/cancel pending parameter questions. Configurações and Emergência are under Mais. An explicit internal `openEmergencyTelegramMenu` entry preserves the original callback, and the existing linked sender guard plus explicit emergency confirmation flow remain responsible for authorization. No fake slash user message is inserted. The routing-only helper is in `server/v1391/emergency.mjs`; tests confirm opening the menu sends no contact alerts and rejects another sender.
- Slash arguments bypass legacy label normalization. Only exact Radar/ATIS legacy labels are mapped; the wrapper preserves explicit operations and extracts a natural Radar flight through the existing interpreter. Weather station selection reuses that interpreter, avoiding TAF/ATIS being misread as airport codes.
- Guided METAR/TAF use the same existing weather keyboard; ATIS uses the same text-to-voice adapter as slash. These effects are mocked offline. Legacy persistent reply keyboards are explicitly removed in a separate message before inline UI; returning from settings removes its reply keyboard too. There is no advertised call action.
- Full prepared `buildTelegramConciergeReply` and `processTelegramUpdate`, real semantic/normalizer functions, Radar/METAR/TAF/ATIS producers and actual menu dependency composition are exercised with only DB/provider/transport boundaries mocked. The old exact artifact fails the new Radar case with LA9999 instead of LA1234 and ATIS with SBBR instead of requested SBGR; corrected prepared sources pass, including natural phrasing, follow-up keyboard and voice-effect parity. These prepared tests are mandatory in CI; the separate raw phase keeps its original coverage.

The revised menu workflow retains prepared-source hashes, exact HEAD and preparation.log as artifact `telegram-menu-prepared-source` for further review. Financial and normative integrations remain out of scope; this is not a complete CrewCierge.
