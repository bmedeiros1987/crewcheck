# CrewCierge Telegram categories

The existing message-bound inline menu now groups queries in two columns:

| | |
| --- | --- |
| Programação | Pernoite |
| Transporte | Financeiro |
| Diárias | Regulamentação |
| Mais | Emergência |
| Atualizar | |

Programação opens Hoje, Amanhã, Próxima, Escala, Radar and Portão. Pernoite reuses the existing saved-history reader and the existing app instructions for hotel/room registration; buttons explicitly say “no app”. Transporte opens the existing Saída handler. Regulamentação opens the existing factual review and its Fundamento pages. Mais opens weather and wellness. Every submenu has Voltar and Início. Legacy typed settings remain with their existing handler; this menu does not introduce its persistent reply keyboard. The greeting omits numeric identifiers and no longer puts a financial disclaimer ahead of the choices.

Queries call the existing reply producer directly with the validated profile and current conversation snapshot. No synthetic incoming update, invisible slash text, new financial calculator, new hotel selector or new transport catalogue is introduced. Flight/airport prompts retain their delivered-message correlation and Cancelar. Useful query results are retained when navigating away; only consumed controls are cleared.

Atualizar rereads the existing conversation snapshot and revalidates the owner before rotating the menu. It does not import a roster, sync IndexedDB, start a financial job, contact a provider or schedule notifications. Financeiro and Diárias show short unavailable states, with the reason under Detalhes and the existing authenticated web destination as a fallback. Neither claims that financial data are integrated into Telegram.

Existing opaque, bounded, single-use tickets remain tied to owner, chat, allowed actions and expiry. Each callback revalidates private-chat identity; account changes around snapshot/producer awaits suppress former-owner output. Navigation edits retain the existing uncertainty fallback and retire superseded tickets. Callback values contain no account/roster identifiers and remain below Telegram's 64-byte limit. See the official [InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton) and [answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery) contracts.

## Ownership and source limits

Inventory on 2026-10-19, base e8e89d5fc4dfe75659fb300adee73179c9ba10e1: #888 is a WhatsApp draft; #938 transport reference has no installed production catalogue reader; #1086 explicit hotel binding remains HOLD; #1113 and #1115 do not activate a server financial source. None is imported. No competing Telegram menu implementation was found in the open-PR inventory. The overlaps with #938's listed files are navigation fixtures only: the stay regression's root label (Hotéis → Pernoite) and Wellhub's guided Radar/Portão path (Programação). Its transport work is unchanged.

The legacy current-stay helpers infer intervals with default clocks or select persisted stays by date proximity. They are not proof of the active canonical stay. The menu therefore exposes actual saved history without labelling a saved record as the current hotel. No claim is made that a future approved, explicitly bound source would be unavailable. No room is read or exposed by the history reader.

No changes to financial/Home/phone/platform/auth domains, ASB measurement, the Vite hook, webhooks, credentials, services, operational flags or real data. No live Telegram or paid-provider tests. This is a draft for independent review; no merge/deploy is authorized by these tests.

## Offline validation

The same 81 navigation cases run raw and after full source materialization, with synthetic transport, identity and snapshots. They cover layout, real action selection, Voltar/Início, prompt correlation/cancel, one-use/concurrent replay, expiry/restart, private sender/chat checks, revocation, account replacement during reads, uncertain edits, short financial details and refresh isolation. Existing integration regressions exercise the actual materialized webhook/runtime/sender and factual handler. CI preserves raw/prepared logs, exact HEAD/base and source hashes for independent review.
