# Atlas — Oracles de QA

Registro de casos reais, candidatos a oracle/regressão. Schema e vocabulário de status em `PROVENANCE.md`. Nenhum destes casos foi (ou deve ser) usado como prova de si mesmo — cada um vem de fonte externa ao CrewCheck. `CONFIRMADO` significa fonte primária examinada e validada por Bruno; não significa que Claude ou ChatGPT já conseguem reproduzir a checagem sozinhos — isso só acontece quando `reproducible_by_agent: true` (fixture sanitizada equivalente, `#527`).

## Confirmados (fonte primária validada; fixture ainda pendente em #527)

### LA3730 — APZ 09:25 (17/08)

```yaml
claim: "LA3730 de 17/08: apresentação (APZ) real é 09:25; 08:29 pertence ao boundary da DR anterior e não pode contaminar a jornada seguinte."
status: CONFIRMADO
source: "CrewRoster Report + Escala AIMS convertida, revisão entregue em 18/08/2026"
primary_source_examined_by: [bruno, chatgpt, claude]   # Claude leu os PDFs originais diretamente em 19/08 (anexados no chat): CrewRosterReport12 + escala22 (par CrewRoster<->AIMS de uma mesma revisão) confirmam Duty Report 09:25 em 17-Aug, com 08:29 sendo o debrief da DR do dia anterior (16-Aug). ACHADO NOVO: em pelo menos 3 outras revisões do mesmo período de agosto examinadas por Claude, o 17-Aug deixa de ter o LA3730 e vira HSB — ou seja, esse voo parece ter sido removido/reprogramado numa republicação posterior. Ver nota em CORPUS.md.
validated_by: "Bruno, comparação direta com os PDFs reais AIMS/CrewRoster"
reproducible_by_agent: false   # nenhuma fixture sanitizada existe ainda (#527) — falta gerar o artefato compartilhável
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
```

### LA3246 — APZ 23:03, STD 23:50 (18/08)

```yaml
claim: "LA3246 de 18/08: apresentação (APZ) publicada é 23:03; STD é 23:50. Um consumidor que mostra 23:50 como apresentação está errado."
status: CONFIRMADO
source: "CrewRoster Report + Escala AIMS convertida, revisão entregue em 18/08/2026"
primary_source_examined_by: [bruno, chatgpt, claude]   # Claude confirmou em CrewRosterReport12 + escala22 (mesma revisão do caso LA3730 acima): Duty Report 23:03, LA3246 GRU 23:50. ACHADO NOVO: essa jornada inteira (LA3246/LA3347 GRU-BPS-GRU) some em pelo menos 3 outras revisões do mesmo período, substituída por um bloco diferente (LA3402/3463/3171, via REC/LDB em vez de BPS). Ver nota em CORPUS.md.
validated_by: "Bruno, comparação direta com os PDFs reais AIMS/CrewRoster"
reproducible_by_agent: false   # nenhuma fixture sanitizada existe ainda (#527) — falta gerar o artefato compartilhável
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
```

## A confirmar (relatados, ainda sem validação direta do Bruno contra a fonte original)

Estes vieram de um comentário relayado via GitHub (identidade não separável do autor do PR no momento em que chegou) e ainda não passaram pelo mesmo processo de comparação direta que os dois casos acima. Tratar como hipótese de investigação, não como oracle fechado, até confirmação.

```yaml
claim: "24/08 termina em BEL; jornada de 25/08 começa em BEL -> deveria existir pernoite em BEL entre as duas."
status: A_CONFIRMAR   # ainda falta Bruno validar esta leitura específica — ver nota abaixo
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt, claude]   # Claude confirmou diretamente em 19/08: jornada de 24-Aug termina LA3232 GRU->BEL, chegada 00:15(+1)/debrief 00:45(+1) (=25-Aug); próxima jornada de 25-Aug tem Duty Report 15:05 partindo de BEL. Idêntico nas 5 revisões distintas do período de agosto examinadas — não varia entre republicações.
validated_by: null   # não promovido a CONFIRMADO unilateralmente por Claude; aguarda o Bruno confirmar que esta leitura corresponde ao que ele validou como pernoite
reproducible_by_agent: false
evidence_ref: "#525, #527"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "25/08 termina em FLN; jornada de 26/08 começa em FLN -> deveria existir pernoite em FLN entre as duas."
status: A_CONFIRMAR   # ainda falta Bruno validar esta leitura específica — ver nota abaixo
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt, claude]   # Claude confirmou diretamente em 19/08: jornada de 25-Aug termina LA3308 GRU->FLN, chegada 23:55/debrief 00:25(+1) (=26-Aug); próxima jornada de 26-Aug tem Duty Report 13:10 partindo de FLN. Idêntico nas 5 revisões distintas do período de agosto examinadas — não varia entre republicações.
validated_by: null   # não promovido a CONFIRMADO unilateralmente por Claude; aguarda o Bruno confirmar que esta leitura corresponde ao que ele validou como pernoite
reproducible_by_agent: false
evidence_ref: "#525, #527"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Jornadas de 18->19 e 19->20/08 são distintas; o relatório atual as funde e gera durações artificiais de 19h-25h."
status: A_CONFIRMAR   # a parte "jornadas são distintas" está confirmada pela fonte primária; a parte "CrewCheck funde e gera duração artificial" ainda não foi checada contra a saída real do parser
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt, claude]   # Claude confirmou na fonte primária que 18-Aug (LA3246/LA3347, GRU-BPS-GRU) e 19-Aug (LA3382/LA3123, GRU-REC-BSB) são duas jornadas fisicamente distintas na Revisão A — mas essa jornada de 18-Aug some em revisões posteriores (ver nota LA3246 acima), o que por si só já é uma fonte de fusão/duração artificial se o parser não tratar republicação corretamente. A alegação específica sobre o comportamento do CrewCheck ainda não foi testada rodando o parser real.
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
