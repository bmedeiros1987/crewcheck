# Atlas — Estado de engenharia

**GitHub é a verdade para código/PR/CI.** Este arquivo é um ponteiro/resumo, não uma cópia — atualizado a cada marco relevante, não a cada evento.

## Linha do tempo (#440 / #512 — jornadas duplicadas / teletransporte)

| Item | Estado | Referência |
|---|---|---|
| PR #513 — P-1 Integridade da Escala: identidade de jornada (`journeyId`/`journeyBoundary` em `canonicalRoster.ts`) | **Mesclado** em `b26a05c` | #440, #512 |
| PR #524 — P-1 Regulamentação: madrugadas por jornada qualificável, não por `dateKey` | **Mesclado** em `2755145` (merge feito pelo Bruno diretamente no GitHub, após veredito técnico MERGE do Claude) | #512, #513 |
| #527 — corpus AIMS/Crewtopia real + auditoria diferencial | **Desbloqueado** — 16 PDFs reais recebidos e auditados em 19/08 (ver `CORPUS.md`); fixtures sanitizadas ainda não geradas | #510, #512, #513, #519, #525, #526, #233 |
| #531 — detectar horário UTC vs. local na importação | **Aberto**, não iniciado. Achado durante a auditoria do #527 (ver `CORPUS.md`); escopo próprio, não misturar com #527 | #527, #531 |
| #510 — APZ/apresentação canônica em todos os consumidores | Autorizado, não iniciado. Escopo: auditoria/correção de apresentação/APZ; não pode virar refatoração ampla | #510 |
| #525 — boundaries, tempo em solo, pernoite/stays | Não iniciado | #525 |
| #526 — horas de voo 90h NB / 100h WB, separado de 176h de trabalho | Não iniciado | #526 |
| FlightDeck/Pulse/UI sobre dados canônicos | Não iniciado, depende dos itens acima | — |

## Dívida técnica conhecida

- Duas falhas pré-existentes e não comportamentais no estado preparado, já documentadas nos handoffs de #513/#524: `regression-v14-3-84-smart-departure-eligibility`, `regression-v14-3-50-p0-activity-classification`.
- Cadeia de preparação (`scripts/vNNNNN/apply.mjs`) casa código por string exata — qualquer mudança de assinatura em função tocada por um patch histórico exige realinhamento manual da âncora. Já aconteceu em #513 e duas vezes em #524.

## Próximo trabalho recomendado

Ordem definida pelo Bruno (ver `DECISIONS_LOG.md`): #527 (corpus, atualmente bloqueado por material) -> #510 -> #525 -> #526 -> FlightDeck/Pulse/UI. Como #527 está bloqueado por dependência externa (arquivos), trabalho paralelo em #510 é aceitável assim que o material do #527 permitir os primeiros oracles, ou imediatamente se o Bruno priorizar explicitamente.
