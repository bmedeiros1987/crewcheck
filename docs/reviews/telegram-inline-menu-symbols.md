# Inline menu symbol labels

Base: 01e25b39073d0c25cdedad289eece6cd25377287, after reviewed #1120 and #1121 were merged and verified LIVE. Bruno requested inline buttons in the message, with a symbol and readable name; keep the existing short menu and clear Back/Home navigation.

Only visible label literals change in server/concierge/telegram-menu.mjs. The root remains three rows: 📅 Hoje / ✈️ Escala, 💰 Diárias / 🏨 Hotéis, ➕ Mais. Existing submenu, cancellation and pagination labels receive one symbol each. No persistent reply keyboard is introduced. Existing one-time legacy-keyboard removal remains intact. No handlers, callback IDs, ticket ownership/expiry/replay checks, flows, weather controls, financial response or app destinations change.

Open PR inventory found no equivalent inline-symbol draft. #888 is WhatsApp OFF; #806 is Home Assistant; #920 is POI route links. #1115 financial contract remains separate and HOLD. No Home/finance/phone/platform edits.

Validation uses synthetic offline fixtures only. The existing raw/prepared navigation suite includes an ordered action/layout/app-destination contract for every page and verifies visible readable labels without hidden commands. Existing replay, ownership, cancellation, prompt revision, navigation reuse and public weather regressions remain exercised. The existing Telegram menu CI runs the suite and preserves prepared-source evidence; no duplicate workflow is added. Local source comparison against the base confirms the only runtime differences are visible symbol prefixes in label literals.

No real Telegram messages, webhook, credentials, permissions, service/configuration changes, deployment, stores or financial activation. This separate draft requires independent review and exact-head CI before integration. Telegram rendering on a real device is not claimed.

Local result:74/74 raw and74/74 prepared navigation tests PASS; TypeScript, build, server syntax, menu, duty-facts, stay,23 Wellhub conversations, Wellhub links/readability and SOS regressions PASS. Runtime source comparison strips visible symbol prefixes and exactly matches the base.
