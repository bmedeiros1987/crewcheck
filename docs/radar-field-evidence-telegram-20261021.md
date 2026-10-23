# Radar: evidência por campo e Telegram (portão/status)

Base: main 161a66b1. Escopo restrito ao contrato de evidência do Radar e às superfícies Telegram/Concierge que o reutilizam. Sem envio real, dado real, consulta paga, credencial, configuração ou ativação. Cirium permanece hard OFF.

## Falha comprovada

- `publicRadarPayload` exportava `gate`/`status`/`registration` sem `operationalEvidence`; o consumidor do app (`nextFlightGate.ts`) exige prova por campo (`sourceObservedAt` da fonte ≤ recebimento, ≤ 30 min, sem conflito) e descartava o campo sem explicar.
- O Telegram não aplicava essa regra: `/radar` imprimia `radar.gate`/`radar.status` crus, `/saida` usava `radar.gate` cru e `conciergeApplyRadar` gravava portão/status/matrícula sem prova no trecho publicado do Concierge, que reaparecia depois em `/proximo` como se fosse escala.

## Correção

`shared/radar-field-evidence.mjs`:

- `radarFieldEvidenceGaps(item, now)` anexa ao payload público `operationalEvidenceGaps[campo]` com código fixo para portão/status/matrícula com valor e sem prova: `source-observation-missing`, `source-conflict`, `source-observation-stale`, `source-observation-invalid`, `source-value-mismatch`. Nenhum objeto de evidência novo é emitido: a única prova contratual existente (`crewcheck.departure-gate-update.v1` da fonte custom, portão) já trafega como `gateUpdate`, então a decisão do app não muda. Relógio HTTP, cache, recebimento, `updated`/`lastUpdatedUtc` genéricos ou sinal de aeronave nunca viram prova.
- `verifiedRadarFields(payload, identidade, now)` repete no servidor a regra do app (mesmo vocabulário de portão: prefixo removido; posição/estande, TBD/N/A e mais de 12 caracteres recusados; observação ≤ recebimento ≤ agora, até 30 min, sem conflito) e confere voo, rota e instante UTC da ocorrência publicada, inclusive na prova. Status e matrícula não têm contrato de prova em nenhuma fonte ativa e nunca são aceitos; um objeto de evidência vindo no payload não é confiado.

Uso: `/radar` mostra só campos comprovados ou `indisponível (motivo)`; `/saida` recebe só portão comprovado; `conciergeApplyRadar` não sobrescreve mais portão/status/matrícula publicados e guarda o portão comprovado à parte (`leg.radarEvidence` com instante da fonte e validade de 30 min).

## Matriz de fontes (código atual, sem chamada real)

| Fonte | Portão | Status | Matrícula | Instante de observação por campo |
|---|---|---|---|---|
| custom (`CREWCHECK_FLIGHT_STATUS_URL`) | com `departureGateUpdate` v1 | não | não | sim, só portão (contrato opt-in) |
| FlightAware | valor simples | valor simples | valor simples | não identificado |
| Aviationstack | valor simples | valor simples | valor simples | não identificado |
| AirLabs | valor simples | valor simples | valor simples | `updated` não definido na doc obtida; pode ser sinal de aeronave → não usado |
| AeroDataBox | valor simples | valor simples | valor simples | `lastUpdatedUtc` não confirmado por doc oficial obtida; é do registro, não do campo → não usado |
| Cirium | — | — | — | possui `flightStatusUpdates[].updatedDateFields`, mas hard OFF; não ativado |

Não houve acesso às referências oficiais de AeroDataBox/AirLabs a partir deste ambiente; nenhuma suposição sobre esses campos foi codificada.

## Testes

`scripts/regression-radar-field-evidence.mjs` (no workflow `next-flight-gate`, bruto e preparado, UTC/São Paulo/Auckland): contrato (conflito, 30 min, futuro, recebimento, divergência, placeholder, ocorrência/rota/offset); adaptadores reais (AeroDataBox `lastUpdatedUtc` e AirLabs `updated` permanecem sem prova; prova custom aceita; obsoleta/conflito/outro dia); paridade servidor×app com o `resolveNextFlightGate` real; `/radar` e `/saida` reais. As regressões existentes que extraem essas funções receberam o módulo no escopo; `gate-query-binding`/`gate-query-proof` passaram a usar a projeção real e provam também o caso sem evidência.

## Lacunas

- Dados já persistidos: portões/status sem prova gravados no trecho do Concierge antes desta mudança permanecem até nova importação da escala; não há limpeza automática (os trechos afetados têm `radarUpdatedAt`).
- `lastRadar` continua guardando a resposta com os valores crus (agora acompanhados das lacunas); nenhum leitor atual o usa como prova.
- `terminal`, `aircraft`, partida/chegada estimadas seguem sem modelo de evidência e continuam exibidos/gravados como antes.
- Mudança de comportamento: portões do radar (inclusive comprovados, e também os vindos da consulta do app) deixam de chegar a `/proximo` e ao fallback de `/saida` pelo trecho; ambos mostram só o portão publicado. O portão comprovado aparece no `/radar`/`/saida` da mesma consulta; `leg.radarEvidence` ainda não tem leitor.

- Fonte: nenhuma fonte legada ativa entrega instante de observação por campo; status não tem contrato em nenhuma fonte ativa; portão só via custom com contrato.
- Cobertura: quais provedores estão configurados em produção não foi consultado (sem acesso a secrets/health real).
- Última observação: nenhuma resposta real capturada nesta auditoria.
- Gatilho: hoje só o app com página aberta (polling de 5 min) e `/radar` sob demanda; não há produtor servidor de portão/status.

## Proposta: produtor servidor portão/status → Telegram (OFF)

Reutiliza o desenho do monitor meteorológico (agendador autenticado, snapshots do Concierge com `chatId`, estado persistido, deduplicação, canário com lease e heartbeat), sem novo transporte:

1. Constante de código `false` (sem ativação por env), canário por hash de destinatário antes de qualquer ampliação.
2. Inscrição explícita por conta (`preferences.gateStatusTelegram === true`, padrão desligado), dona verificada a cada ciclo.
3. Candidatos: voos canônicos publicados na janela de consulta permitida (`gateQueryDay`), ligados por `findPublishedGateLeg`.
4. Consulta somente a fonte com prova por campo e orçamento aprovado (cota por voo/ciclo; nunca polling pago sem aprovação; Cirium continua OFF).
5. Decisão por `verifiedRadarFields`; primeiro valor comprovado é linha de base (não é mudança); mudança exige valor diferente e instante de observação mais novo; chave de evento `sha256(dono|ocorrência|campo|valor|observação)`.
6. Revalidação imediatamente antes do envio (dono, inscrição, ocorrência, frescor ≤ 30 min); estado `submitted` gravado antes do envio para no máximo uma tentativa; histórico sanitizado; aceitação do Telegram não é confirmação de leitura.

Mínimo para entrega real: fonte com instante de observação por campo para portão e status (contrato custom ampliado ou provedor aprovado), orçamento/entitlement, implementação do produtor acima com testes, canário autorizado e validação física com conta e voo autorizados.

## P2 independent review follow-up — 2026-10-23

The exact8a17dd06 review found a valid proof could be lost when a richer
AeroDataBox response won the whole-response score after an agreeing custom
response had already settled. The new actual-adapter regression failed RED:
`agreeing custom field proof survives a richer winner`, empty versus12, with
T1 proving the richer response won and alternatives2 proving both had settled.

The race now retains an agreeing gate proof independently of the selected
response's other fields. Both the donor and combined response must pass the
existing exact-occurrence field validator; differing gate/flight/route/UTC,
conflict/suppression, invalid/future/stale source observations and invalid
receipts do not donate proof. Among admitted agreeing proofs the latest source
observation is selected. No status/registration/terminal/aircraft is blended.

The existing `gateEvidenceReceivedAt` field carries the ORIGINAL donor receipt;
the winner's `sourceReceivedAt` and other response fields remain untouched.
Server admission uses this field when present, matching the app's existing
receipt-anchor support, without a new app consumer or altered proof schema.
Neither race completion nor client cache receipt renews the source observation.
Proof provenance stays custom; no Cirium or other provider is relabeled custom.
The provider's original source observation remains in gateUpdate unchanged.

Fixtures include richer-winner `/radar`, `/saida` and separate Concierge evidence,
app/server parity, split winner/donor receipts, freshness expiry, proof order,
nonmutation and cross-provider negatives, raw/prepared in three timezones.
The gate-query-day harness only receives the new imported dependency; existing
assertions remain intact. The race's existing completion window is unchanged:
only responses already available to that race can donate proof.

This corrects evidence composition, not provider availability, physical gate
accuracy or closed-app delivery. No real lookup, message, credential, activation,
merge or deployment. The review thread remains unresolved until re-review.
