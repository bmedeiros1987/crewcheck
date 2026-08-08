# P0 — separação de chaves Google no servidor

Contrato operacional:

- `GOOGLE_ROUTES_API_KEY`: somente Routes API / trânsito server-side.
- `GOOGLE_MAPS_SERVER_KEY`: Geocoding e demais chamadas Google server-side já existentes que não são Routes.
- `VITE_GOOGLE_MAPS_API_KEY`: somente cliente Web/PWA; nunca deve ser selecionada pelo servidor.

Motivo: chaves com restrições de navegador e servidor têm políticas incompatíveis. Misturá-las pode produzir rejeições de autorização mesmo quando a configuração aparente está presente.

O patch v14.3.88 é idempotente e falha de forma explícita se o contrato do `server.mjs` mudar, em vez de aplicar substituição silenciosa sobre código inesperado.
