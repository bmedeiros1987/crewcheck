# Atlas — Oracles de QA

Registro de casos reais, candidatos a oracle/regressão. Schema e vocabulário de status em `PROVENANCE.md`. Nenhum destes casos foi (ou deve ser) usado como prova de si mesmo — cada um vem de fonte externa ao CrewCheck. `CONFIRMADO` significa fonte primária examinada e validada por Bruno; não significa que Claude ou ChatGPT já conseguem reproduzir a checagem sozinhos — isso só acontece quando `reproducible_by_agent: true` (fixture sanitizada equivalente, `#527`).

## Confirmados (fonte primária validada; fixture ainda pendente em #527)

### LA3730 — APZ 09:25 (17/08)

```yaml
claim: "LA3730 de 17/08: apresentação (APZ) real é 09:25; 08:29 pertence ao boundary da DR anterior e não pode contaminar a jornada seguinte."
status: CONFIRMADO
source: "CrewRoster Report + Escala AIMS convertida, revisão entregue em 18/08/2026"
primary_source_examined_by: [bruno, chatgpt]   # comparação feita numa sessão do ChatGPT; Claude não teve acesso aos PDFs
validated_by: "Bruno, comparação direta com os PDFs reais AIMS/CrewRoster"
reproducible_by_agent: false   # nenhuma fixture sanitizada existe ainda (#527) — Claude não consegue reproduzir isto sozinho hoje
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
```

### LA3246 — APZ 23:03, STD 23:50 (18/08)

```yaml
claim: "LA3246 de 18/08: apresentação (APZ) publicada é 23:03; STD é 23:50. Um consumidor que mostra 23:50 como apresentação está errado."
status: CONFIRMADO
source: "CrewRoster Report + Escala AIMS convertida, revisão entregue em 18/08/2026"
primary_source_examined_by: [bruno, chatgpt]   # comparação feita numa sessão do ChatGPT; Claude não teve acesso aos PDFs
validated_by: "Bruno, comparação direta com os PDFs reais AIMS/CrewRoster"
reproducible_by_agent: false   # nenhuma fixture sanitizada existe ainda (#527) — Claude não consegue reproduzir isto sozinho hoje
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
```

## A confirmar (relatados, ainda sem validação direta do Bruno contra a fonte original)

Estes vieram de um comentário relayado via GitHub (identidade não separável do autor do PR no momento em que chegou) e ainda não passaram pelo mesmo processo de comparação direta que os dois casos acima. Tratar como hipótese de investigação, não como oracle fechado, até confirmação.

```yaml
claim: "24/08 termina em BEL; jornada de 25/08 começa em BEL -> deveria existir pernoite em BEL entre as duas."
status: A_CONFIRMAR
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt]   # atribuído, não verificado por Claude nem re-confirmado diretamente pelo Bruno neste caso
validated_by: null
reproducible_by_agent: false
evidence_ref: "#525, #527"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "25/08 termina em FLN; jornada de 26/08 começa em FLN -> deveria existir pernoite em FLN entre as duas."
status: A_CONFIRMAR
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt]   # atribuído, não verificado por Claude nem re-confirmado diretamente pelo Bruno neste caso
validated_by: null
reproducible_by_agent: false
evidence_ref: "#525, #527"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Jornadas de 18->19 e 19->20/08 são distintas; o relatório atual as funde e gera durações artificiais de 19h-25h."
status: A_CONFIRMAR
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt]   # atribuído, não verificado por Claude nem re-confirmado diretamente pelo Bruno neste caso
validated_by: null
reproducible_by_agent: false
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
```

## Como promover A_CONFIRMAR -> CONFIRMADO

1. Comparar diretamente contra o CrewRoster Report / AIMS convertido originais (não contra a saída atual do CrewCheck).
2. Bruno confirma a leitura.
3. Atualizar `status`, preencher `primary_source_examined_by` e `validated_by`.

`CONFIRMADO` sozinho não autoriza virar fixture/regressão — isso exige adicionalmente `reproducible_by_agent: true`, que só passa a ser verdadeiro quando existir a fixture sanitizada equivalente gerada em `#527`. Até lá, um caso `CONFIRMADO` é uma afirmação confiável (fonte primária examinada e validada por Bruno) mas ainda não algo que Claude ou ChatGPT consigam reconferir sozinhos.
