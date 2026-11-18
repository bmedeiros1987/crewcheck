# Weather canary: final evidence and operational window validation

Base verified through GitHub API and remote refs: `bcfdcf8b90c48608f14ca24ed5bb85400319ea3b`.

## Scope and current ownership

The existing remote critical-weather monitor is the closest existing end-to-end path for an app-closed event: an official, recent METAR/SPECI with relevant severity in the imported flight's operational window. This patch adds no producer, queue, public enqueue namespace, trigger or transport. Telegram's durable weather state, account/private-chat binding, dedicated opt-in, recipient selector, MySQL named lease and pre-send intent remain authoritative. Web Push installation envelopes grant no Telegram authority.

Open PRs checked before editing: #1211 owns bootstrap/Infobip; #1212/#1213 finance and #1208 AI excluded. #1146 is diagnostic only. #1031 remains open at a8785781 and owns Home/Pulse observation/window changes; this patch touches only the existing server canary cycle, its integration fixture, and this document. #1195 is now merged (merge 8ed931d1, head fbdaa1e9), despite historical draft text in its body. No repository AGENTS.md, SKILL.md or CODEOWNERS was present in the checked-out tree; supplied conversation authorization applies. Existing local checkouts were read only; a no-hardlinks clone was made in task-5.

## Defect and correction

Collection validated observation age once. Subsequent airport fetches, state writes and consent checks could consume its remaining TTL or the flight's remaining operational window before Telegram submission. The bounded canary now retains the admitted report/assessment and immediately before the existing send rechecks all selected report ages/provenance/station/UTC through the existing evaluator and recomputes current candidates through the existing selector. There is no await between the last check and transport invocation. All existing lease/consent checks and durable reservations remain in their previous order. Legacy broad-audience behavior is unchanged and is not recommended for activation by this change.

An invalid batch is suppressed as a whole. A reservation already recorded remains terminal even if this last check suppresses transport. This deliberately prefers missed delivery over replay after an uncertain outcome. It is not an automatic retry queue and makes no exactly-once guarantee. Consent revoked after its last asynchronous check can still race transport; Telegram-accepted messages cannot be recalled. No new linearizable cross-process consent lock is claimed.

## Synthetic evidence

Four new regression cases fail against the exact base and pass with this patch: source expiration during durable intent persistence, window expiration during final consent read, the real origin candidate selector expiring at departure+30min+1ms, and a slow second airport fetch expiring the first report. Existing tests exercise opt-out/relink, account deletion, lease loss/successor preservation, concurrency, restart, ambiguous acceptance and final write failure.

- Tracked source: 178 tests passed, 0 skipped/failed.
- Canonically prepared source (`node scripts/v139/apply.mjs`): the same 178 passed.
- Server syntax and weather heartbeat regression passed.
- Existing MySQL helpers were not changed. Real isolated MySQL, full build/TypeScript and exact-head CI remain to be confirmed; previous PR CI does not validate this SHA.

Node executable: bundled ChatGPT Node. All provider, recipient, SQL and Telegram interactions in these tests are fixtures. No source query, real database operation, credential read, real send, configuration change, dependency install, merge or deploy occurred. Preparation-generated files were excluded from the patch. This does not prove physical device receipt or production recovery.

## Configuration inventory (names only; live values unobserved)

Existing settings: CREWCHECK_WEATHER_MONITOR_ENABLED (legacy broad mode), CREWCHECK_WEATHER_MONITOR_INTERVAL_MINUTES (5–30, default 10), CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED, CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256. Scheduler authorization uses CREWCHECK_SCHEDULER_SECRET / WEATHER_ALERT_SCHEDULER_SECRET. Canary requires existing Telegram configuration, TELEGRAM_WEBHOOK_SECRET and persistent crewcheck_telegram_state. Existing authenticated health exposes only boolean configuration readiness plus heartbeat, and keeps deliveryVerified false. No live readiness, linkage, lease ownership or opt-in was inferred from source or tested with a real account.

## Exact activation checklist (separate coordinated review)

1. Review this exact commit and its composition with #1211's independent server hunks; pass exact-head CI including tracked/prepared tests and isolated MySQL, full canonical checks and independent review. Do not merge/deploy under this task.
2. Through the existing authenticated health/readiness route, verify configured scheduler authorization, bot, verified webhook secret, persistence and timely successful heartbeat without exposing secret values or target identifiers. Verify existing provider access is authorized and does not add paid queries or costs. Missing authority/configuration blocks activation; this patch supplies none.
3. Verify the approved exact private account/chat's forward and reverse binding, current imported roster and canonical occurrence times. Keep legacy broad mode off. Separately authorize the precise recipient, event, content, time window and bounded message/query counts.
4. Under separately approved configuration/release, configure only the existing canary selector/flag; obtain a fresh verified `/alertameteo on` after linkage. Confirm the dedicated durable consent record belongs to that link revision, not a cached preference. Revoke with `/alertameteo off`.
5. Confirm existing scheduler process/trigger runs when the app is closed and can acquire/revalidate its MySQL lease. The real trigger, fresh authorized provider report and current roster are prerequisites; synthetic tests do not create them. NOTAM diagnostic and roster submissionAllowed:false adapters are not producers or polling authority.
6. Only with separate bounded send authority, observe the selected real event and provider acceptance using existing diagnostics. Record actual device receipt independently. Do not reset submitted/uncertain intent or auto-resend; review ambiguous outcomes explicitly. Disable the existing canary on failure and preserve state for diagnosis.
