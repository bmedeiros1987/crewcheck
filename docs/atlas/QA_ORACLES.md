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

## Resultado CrewCheck contra o pipeline real (#527, 19/08/2026)

Diferente das entradas acima (que documentam a fonte primária), esta seção documenta o **comportamento real do parser de produção** (`server/rosterParser.mjs::parsePdfOnServer`) rodado diretamente contra os bytes reais dos PDFs desta sessão — não uma fixture, não uma hipótese. Formato: fonte original -> esperado -> resultado CrewCheck.

```yaml
claim: "O formato nativo CrewRosterReport importa corretamente a apresentação (dutyReport) para LA3730 (09:25) e LA3246 (23:03) na Revisão A, batendo com o oracle confirmado acima."
status: CONFIRMADO
source: "Execução direta de server/rosterParser.mjs::parsePdfOnServer contra os bytes reais do PDF CrewRosterReport12 (Revisão A) nesta sessão"
primary_source_examined_by: [claude]
validated_by: "Saída determinística do próprio pipeline de produção — não depende de leitura humana"
reproducible_by_agent: false   # rodado contra os bytes reais efêmeros desta sessão, não uma fixture persistida no repo ainda
evidence_ref: "#527"
recorded_by: claude
date: 2026-08-19
resultado_crewcheck: "PASS — CrewRosterReport nativo"
```

```yaml
claim: "O formato Escala AIMS/Crewtopia (o mesmo Bruno recebe convertido) tem bug real na apresentação, confirmado em duas revisões diferentes de duas formas diferentes: (1) Revisão A — LA4712 e LA3246 são fundidos no mesmo dia/pairing, com dutyReport 08:29 herdado da DR anterior em vez de 09:25 para o LA3730 seguinte, e a apresentação real do LA3246 (23:03) desaparece; (2) Revisão B — sem fusão de dia, mas dutyReport errado do mesmo jeito: 20/08 mostra 00:15 (chegada em LDB, não a apresentação real 18:50 do LA3463) e 21/08 mostra 02:30 (chegada em REC, não a apresentação real 15:40 do LA3171)."
status: CONFIRMADO
source: "Execução direta de server/rosterParser.mjs::parsePdfOnServer contra os bytes reais dos PDFs escala22 (Revisão A) e escala12 (Revisão B) nesta sessão"
primary_source_examined_by: [claude]
validated_by: "Saída determinística do próprio pipeline de produção — não depende de leitura humana; comparado diretamente contra os oracles CONFIRMADO acima e contra a leitura da fonte primária para a Revisão B"
reproducible_by_agent: false   # rodado contra os bytes reais efêmeros desta sessão, não uma fixture persistida no repo ainda
evidence_ref: "#510, #527"
recorded_by: claude
date: 2026-08-19
resultado_crewcheck: "FAIL — Escala AIMS/Crewtopia, em 2/2 revisões testadas até agora"
```

**Implicação para #510:** isso não é mais hipótese relayada — é o comportamento real e reproduzível do parser de produção no caminho de importação do formato que o Bruno mais usa no dia a dia (escala convertida). O bug é estrutural na extração de apresentação desse formato específico, não um caso isolado — apareceu de duas formas diferentes em duas revisões diferentes. Isso deveria pesar na priorização/escopo do #510.

**Próximo passo para tornar isso `reproducible_by_agent: true` de forma permanente:** gerar a partir desta saída real uma fixture sanitizada (RosterDay[] com nome/matrícula substituídos, sem PII) e commitar como regressão — assim qualquer agente reconfirma sem precisar dos PDFs originais.

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
status: A_CONFIRMAR   # a parte geral do relato bate com evidência real; mantido A_CONFIRMAR porque o par exato de datas citado (18->19, 19->20) não é o mesmo par onde a fusão foi observada rodando o parser (ver achado abaixo)
source: "Comentário relayado via GitHub (#524, id 5335699431), atribuído a análise do ChatGPT sobre os PDFs do Bruno"
primary_source_examined_by: [chatgpt, claude]   # ACHADO CONFIRMADO RODANDO O PARSER REAL (não mais hipótese): na Revisão A, formato Escala, LA4712 (18/08) e LA3246 (18/08, GRU-BPS) são fundidos pelo pipeline de produção num único dia/pairing, dutyReport 06:40 -> dutyDebrief 01:40(+1) = ~19h de duração de dia, exatamente a ordem de grandeza citada no comentário. Ver entrada CONFIRMADO em "Resultado CrewCheck" acima para o detalhe completo. O par de datas exato citado no comentário (18->19, 19->20) é aproximado, não idêntico ao par observado (a fusão real é 18/08 LA4712+LA3246; 19/08 e 20/08 também aparecem fundidos de forma distinta na Revisão A pura leitura de fonte, mas isso ainda não foi re-testado rodando o parser).
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
