# Próxima programação, hotel/van e saída: texto e limites

Base4d73f7d2045c2bc7b4787af0c813a67d9d7d71df. Independent workstream; no TTS changes or restricted content, audio generation, real account data, provider calls or messages. Original checkout preserved; complete isolated clone, no alternates. Hospitals are a separate later audit and unchanged.

## Reuse and ownership

- `server/concierge/journey-programs.mjs` already projects canonical journey identities. Add display-only civil dates using the canonical engine's existing published UTC−03 clock. Do not change boundaries, selection chronology, roster clocks, APZ, financial data or stored records. This clock is not a claim about destination-local time.
- `server/v1404/telegram-language.mjs` already renders operational summaries. Only next-program flight summaries become direct: flight count, dated APZ, each departure and airport arrival, qualified end and clock basis. Missing dates/clocks remain unknown. Other operational summaries retain their existing renderer.
- `server/concierge/stay-menu.mjs` already intercepts exact hotel questions before generic nearby lookup. Extend only narrowly recognized natural logistics questions. There is no new provider/history lookup: hotel arrival, pickup, wait deadline and shared operational contact remain unconfirmed. Explicit direction is retained; otherwise ask airport→hotel or hotel→airport. Do not infer current position from time.
- `scripts/v14335/departure-reply.snippet` is the existing departure producer. Reuse canonical records; do not create another planner. Capture current time once. A recommended leave time in the past with future APZ remains on that program, explicitly labelled overdue. Dates/tomorrow use the same published clock. Past APZ, outside-base/stay context, missing base, cancellation and missing/incomplete coverage return qualified text without route lookup. No event is marked arrived from the clock.

## Available sources and exact missing dependency

MyCrewCare UI remains disabled (`shared/myCrewCareController.mjs`) and has no authenticated server/Telegram reader connected to its existing client/native facts. #907/#1027/#1035 remain isolated/OFF/debug; no session, bridge or fact transmission is introduced. #1086 hotel binding remains HOLD; unbound `day.hotel` and history rows cannot identify a current stay. #938 already owns corporate transport reference requests, with its catalogue reader absent; #935 owns the parallel departure UI reference. No equivalent implementation is duplicated.

Future provider answers must reuse those domain-owned facts and validate account, roster revision, exact persisted stay, reservation situation (planned/changed/cancelled), source/observation revision and age, local date/timezone and explicit travel endpoints. Planned is not confirmed; cancellation must never supply active pickup. A server-authorized, owner-scoped read capability is still missing. This draft does not invent that capability or a new transport model.

Airport arrival is not hotel arrival, check-in, presentation at hotel or van pickup. Airport→hotel versus hotel→airport may only be selected from explicit question or a unique source-bound temporal itinerary; ambiguity requires a question. Time alone never proves physical position. Waiting limits need a published applicable operational rule; no default minutes are supplied. A contact requires a proven operational sharing scope, not merely a personal number contributed by another user. No WhatsApp link is built without that proof. No source revision is fabricated from a cache timestamp or printed technical ID.

## Synthetic verification

Existing journey/wording/stay suites cover real canonical selection, multiple unbound/planned/cancelled hotel rows, published midnight/year transitions, missing metadata and non-mutating rendering. Departure fixtures execute the actual tracked snippet and fully prepared function with a controlled clock and simulated route response only: before/after leave, future/past APZ, tomorrow, outside base, stay, cancelled, home standby and missing/incomplete coverage. Explicit direction and generic nearby/corporate-transport/emergency negatives retain their routes. No hospital behavior is changed.

No claim of physical Telegram rendering, actual provider reservation freshness, shared-contact rights or real itinerary correctness. Integration requires independent review and exact-head CI. Source fixture assertions do not prove an authenticated external reader; no such reader is connected in this change.

## Follow-up menu and financial ownership (separate changes)

Bruno requested direct chat access to Regulamentação, Pernoite, Financeiro and Diárias. The current menu exposes Diárias, Hotéis/history and Revisar escala/basis. A later menu-only patch should reuse these handlers and make the module names clear, without advertising results that are unavailable. Regulation facts/basis must retain their existing provenance and missing-data gates. Pernoite can reuse existing history and exact logistics questions; it cannot treat history as the current reservation. A label or app link is not completion of a chat financial query.

#1115 remains contract-only. Financial integration belongs to the financial owner: a consistent authorized server read, owner/month/revision, original minor-unit values and currencies, work competence versus expected payment, presence/status/source and invalidation are still prerequisites. No finance amount, eligibility, month completeness or payment date may be derived from stays or guessed from a browser-local store. No endpoint/grant/sync activation is part of this draft. Menu, operational queries and financial delivery should remain separate reviewed scopes.
