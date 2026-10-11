# Cirium FlightStats Evaluation diagnostic

This diagnostic is intentionally separate from the canonical Radar parser and provider consensus.

## Render secrets

Add a newly generated, uncompromised credential pair to the backend service only:

- `CIRIUM_APP_ID`
- `CIRIUM_APP_KEY`

Do not prefix either variable with `VITE_`, put values in GitHub, or paste values into logs or support messages.

## Opt-in

The diagnostic is disabled unless `CIRIUM_DIAGNOSTIC_ENABLED` is exactly `true`; otherwise it reports `disabled` before reading any credential. The legacy FlightStats probe also requires `CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX` to be exactly `true`; Flex credentials are never an automatic fallback for the Sky probe.

## Admin-only check

While signed in as an email listed in `CREWCHECK_ADMIN_EMAILS`, request:

`GET /api/platform/admin/diagnostics/cirium`

The response never includes credentials or the upstream response body. It reports only `not_configured`, `authenticated`, `plan_pending`, `forbidden`, `quota`, `available`, `unverified`, `invalid_payload`, `error`, plus a sanitized HTTP status or transport reason where applicable.

`unverified` means the response cannot prove authentication or available data: a `404`/`405`, or a `2xx` whose body is unusable. A `404` or `405` is never reported as `authenticated`. A `2xx` carrying a body that is not the expected JSON shape reports `invalid_payload` instead of `available`, and the elements are validated too: an array of nulls, strings or non-objects is not a usable answer, so `flightStatuses: [null, 'garbage']` is never `available`.

The probe requests the single LATAM (`LA`) airline reference record. This keeps the response small and tests an API included in the Evaluation Plan without invoking flight-status, airport, FIDS, or alert quotas.

When the result is `available`, the next separate step is a real-flight evaluation of status, gate, terminal, scheduled/estimated/actual times, and freshness. Cirium must not enter the provider consensus until that mapping is measured against the existing canonical contract.

For that isolated evaluation, an Admin can request:

`GET /api/platform/admin/diagnostics/cirium/flight?carrier=LA&flight=3377&date=2026-08-09`

The date is the local departure date and must be within the Flight Status API's current-data window. The response contains only normalized operational fields and presence/freshness measurements; it never returns the upstream body or credentials. An omitted parameter uses the documented default (LA3377, today in `America/Sao_Paulo`). A parameter that is **present** but blank or malformed is explicit invalid input: the route answers HTTP 400 before any diagnostic runs, so a blank value is never silently replaced by the default. A date outside the provisional ±2 day window reports `date_out_of_window`.

A returned row is displayed only when it is a usable record of the requested occurrence: the same carrier and flight number, a coherent leg (a valid departure and a different arrival, with the scheduled arrival after the departure and within a day), and a departure day that matches the requested day. When the row carries a local departure date it must equal the requested date; UTC-only evidence is accepted only within one day of it. A row whose date cannot be verified is rejected rather than displayed. Rows for another occurrence and malformed rows both report `invalid_payload` and are counted in `rejectedRows`; a valid response with no rows at all reports `no_data`.

## Request limits

Every upstream call must pass a session budget, a minimum interval, and a provider cooldown before the request is made. Identical requests are deduplicated while in flight and served from a result cache afterwards. A `429` records a cooldown from `Retry-After` (60 s fallback when the header is absent) and is never retried automatically: there is no polling, no scheduling and no provider fallback. When a limit blocks the call, the diagnostic reports `budget_exhausted`, `rate_limited_local` or `provider_cooldown` and no upstream request happens.

This state lives in one Node process: it resets on restart or deploy and is not shared between instances, so it reduces accidental spend but does not replace a provider-side quota.

## Roadmap gate

The laboratory adapter maps a Flight Status fixture to the existing Radar shape and measures field coverage. It deliberately uses departure gate and terminal only; arrival resources can never fill the boarding fields. The adapter is not imported by `server.mjs`, is absent from the provider race/order, and has no production enable flag.

A numeric value the provider did not report stays `null` in the adapter and in the diagnostic summary. Only a real number or a plain numeric string (`^-?\d+(\.\d+)?$`) is accepted, so `null`, an empty string, a boolean, an array (`[]`, `[null]`, `[1]`) or an object never become a displayed `0` or a fabricated value; `Number([])` and `Number([null])` are `0`, which is exactly why they are rejected. `ciriumCoverage` counts delays as coverage only when a real delay value was reported.

Activation remains blocked until a real response demonstrates the correct segment identity and acceptable coverage for status, departure gate/terminal, scheduled/estimated/actual times, and freshness. After that evidence, integration must be a separate PR with rollback flag, health isolation, cache, and existing-provider preservation.

### Revisão offline de 11/10/2026: datas contraditórias

`acceptRow` confronta todas as evidências de partida planejada, em vez de aceitar
apenas a primeira `dateLocal`. Também valida cada horário operacional fornecido
(partida/chegada publicada, programada, estimada e real), inclusive a coerência de
`dateLocal` com `dateUtc`. Uma data atual em `departureDate` não legitima horários
de 2020. Linhas rejeitadas não produzem resumo e são contadas em `rejectedRows`;
o probe usa a mesma regra. As janelas são conservadoras: partida local planejada
no dia solicitado, UTC e partidas operacionais em até um dia, chegada em até dois
dias. Isso pode rejeitar atrasos extremos e não valida o contrato real do provedor.

Regressões negativas em `scripts/regression-cirium-guard.mjs`: nove combinações
contraditórias nos caminhos de voo e probe, mistura de linha válida/inválida e
controle positivo de cruzamento de meia-noite UTC/local. O novo contrato falha
no HEAD anterior `2266060b61190a71382d08136d76b10c42a1462d` (`available` em vez de
`invalid_payload`) e passa após o reparo. A fixture positiva do diagnóstico agora
usa o dia da consulta também nos horários operacionais, removendo a contradição
que ela própria continha.

Verificação local (Node 24.19.0): `node scripts/check-cirium-offline.mjs`,
`node scripts/regression-radar-occurrence-identity.mjs` e sintaxe do módulo passam.
A preparação canônica `scripts/v139/apply.mjs` foi executada em cópia descartável,
com ambiente vazio e fetch real proibido; o contrato offline passa também nessa
cópia. Não foi identificado gerador que reescreva este módulo. Integração OFF;
sem chamada real, rota publicada, alteração de configuração, merge ou deploy.

### Revisão independente: instantes e cronologia

Além do dia, UTC/local precisam representar instantes coerentes: com offset
local explícito, devem ser o mesmo instante; sem offset local, a diferença dos
relógios deve caber em até 14 horas, sem escolher um fuso de aeroporto. Isto é
uma verificação de plausibilidade, não prova do fuso real. `dateUtc` sem `Z` é
interpretado explicitamente como UTC por semântica do campo; nunca usa o fuso do
processo. Calendários inválidos e offsets acima de 14 horas são rejeitados.

`arrivalDate` de topo também é validada. Pares fornecidos de partida/chegada
publicada, programada, estimada e real, inclusive gate/runway, precisam de
instantes comparáveis e duração positiva de até 24 horas. Um par de relógios
locais sem UTC/offset não demonstra duração e é rejeitado conservadoramente.
Campos omitidos não são inventados; campos de categorias diferentes não provam
cronologia entre si. Os limites seguem provisórios até validação do contrato.

Regressões negativas/positivas incluem diferença impossível de 47 h, offset
explícito contraditório (também no mesmo dia), limite de 14 h e um segundo além,
meia-noite, UTC sem Z, arrivalDate antigo/invertido, real/estimado invertido e
pares locais ambíguos. Voo e probe usam a mesma validação. Os novos casos falham
no HEAD `0f2d9f8` e passam no código corrigido em UTC, Brasília e Auckland. O
worker offline preserva somente TZ e usa exclusivamente dados/mocks sintéticos;
a CI focada executa os três fusos. OFF e gates de contrato real permanecem intactos.

### Revisão: par efetivamente exibido pelo fallback

A verificação por categoria não substitui a validação do par escolhido pelo
resumo: partida `scheduledGateDeparture || publishedDeparture` e chegada
`scheduledGateArrival || publishedArrival`. Esse par cruzado também exige
instantes comparáveis e duração positiva até 24 h. Dois negativos reproduzem
partida programada/chegada publicada invertidas e o inverso; dois controles
válidos confirmam os horários efetivamente exibidos. Voo/probe passam nos três
fusos mantendo os contratos UTC/local; os negativos falham no HEAD 79a2a177.
