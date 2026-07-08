# CrewCheck v13.3.3 — Strict Published Range

Correção após teste real em que a escala de Julho mostrava dia `25/06` com texto técnico `msgsys`.

## Problema

Mesmo com o mês canônico corrigido, eventos técnicos fora do período publicado ainda podiam sobreviver no array da escala. Isso contaminava a lista e podia influenciar a próxima programação.

## Correção

- `normalizeRosterDays` filtra dias fora do período publicado no PDF.
- CrewRosterReport passa a usar leitura sequencial/text-first quando ela já encontra escala suficiente.
- Leitura visual/transposta fica como fallback, sem contaminar o caminho principal.
- Reforçada limpeza de `msgsys`, `Updated Date`, `Updated By`, `SCHEDULER`, `AIRCOM_SQS`, `JTA_SQS`, `SABREMM`.
- Adicionada regressão removendo `25/06` quando o relatório é `01-Jul-2026 to 31-Jul-2026`.
- Layout Premium/EFB preservado.
- Parser AIMS preservado.
