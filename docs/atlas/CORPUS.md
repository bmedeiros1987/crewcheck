# Atlas — Corpus de escalas

Dois corpora distintos, não misturáveis (ver `#527`).

## Corpus iFlight (#233) — existente

- 68 escalas históricas já usadas pelo projeto.
- Não usar como prova da importação AIMS/Crewtopia — formatos e caminho de parser são diferentes.

## Corpus AIMS/Crewtopia (#527) — **recebido em 19/08/2026, auditoria inicial concluída, fixtures ainda não geradas**

```yaml
claim: "16 PDFs reais (6 CrewRoster Report + 10 Escala AIMS convertida/Crewtopia) foram anexados por Bruno diretamente no chat em 19/08/2026, cobrindo dois períodos de escala (julho e agosto de 2026) em múltiplas revisões."
status: CONFIRMADO
source: "Anexo direto no chat"
primary_source_examined_by: [claude]
validated_by: "Bruno, ao enviar os arquivos com a instrução explícita de iniciar a auditoria"
reproducible_by_agent: false   # os originais em si nunca viram fixture; ver regra de privacidade abaixo
evidence_ref: "#527"
recorded_by: claude
date: 2026-08-19
```

**Nunca escrever nome completo, matrícula (BP) ou nomes de outros tripulantes em nenhum arquivo deste repositório — nem nas notas de auditoria.** Este documento e `QA_ORACLES.md` descrevem apenas estrutura, voos, horários e estações, nunca identidade de pessoa.

### Inventário (canal de anexo confirmado funcional — o teste pendente da nota anterior está resolvido)

- **Período julho/2026** (29/06 a 01/08): 2 pares CrewRoster Report + Escala, mais 1 CrewRoster Report avulso — **3 revisões distintas** do mesmo mês. Duas delas têm todos os horários do mês inteiro deslocados por um valor quase constante (~3h) mantendo os mesmos voos/estações — mais provável ser diferença de referência de exportação do que republicação real; **precisa ser confirmado com o Bruno antes de virar 2 fixtures separadas**, para não fabricar uma "revisão" que não existiu operacionalmente.
- **Período agosto/2026** (30/07 a 01/09): 4 pares CrewRoster Report + Escala, mais 2 Escala avulsas — **pelo menos 5 revisões distintas** do mesmo mês, todas cobrindo o mesmo intervalo de datas.

### Achado principal: o bloco 09–21/08 é o que mais varia entre revisões

Numa revisão (chamando de Revisão A — é onde estão os casos `LA3730` e `LA3246` já confirmados em `QA_ORACLES.md`), o período 11–21/08 tem uma programação. Em pelo menos 3 outras revisões do mesmo mês, esse bloco inteiro é substituído por outra programação (outros voos, inclusive um HSB de 2 dias onde antes havia voo). Isso significa:

- `LA3730` (17/08) e `LA3246`/`LA3347` (18–19/08) **só existem na Revisão A** — nas revisões seguintes, essas jornadas não aparecem mais, substituídas por outra sequência.
- Isso é evidência direta e observável do problema estrutural citado no #527: **se o parser/versionador não tratar corretamente qual publicação está vigente em cada revisão, ele pode misturar pernas de revisões diferentes da mesma janela de datas** — exatamente a "fusão de jornadas com duração artificial" citada no comentário relayado (ver entrada `A_CONFIRMAR` em `QA_ORACLES.md`).
- O bloco 24–31/08 (onde estão os casos de pernoite BEL e FLN) é **idêntico em todas as revisões examinadas** — não há ambiguidade de revisão ali, só a questão de pernoite/apresentação em si.

### Regra de privacidade (vale independente de onde os originais acabarem ficando)

- Os PDFs originais são material privado/local, únicos nesta sessão de chat. **Nunca commitar sem sanitização — nem os arquivos, nem nomes de tripulantes, nem matrícula.**
- O repositório público (`crewcheck`) só recebe **fixtures sanitizadas pré-parser** — voos/horários/estações reais, identidade substituída por identificador sintético (ex.: `TRIP-001`), sem nomes de nenhum tripulante (nem do titular da escala, nem de terceiros que aparecem na lista de tripulação de cada voo).
- Referenciar os originais por revisão/hash no Atlas, nunca pelo conteúdo.

### Próximos passos (aguardando confirmação de escopo antes de gerar fixtures permanentes)

1. Confirmar com o Bruno se as 2 revisões de julho com horário deslocado são de fato republicações reais ou artefato de exportação (evita fixture espúria).
2. Formar o mapa revisão -> pares CrewRoster Report <-> Escala, com um identificador de revisão estável (não o nome do arquivo, que é só um upload id).
3. Sanitizar (identificador sintético de tripulante, remover nomes de terceiros) e gerar fixture pré-parser por revisão.
4. Produzir oracle explícito por fixture (atividades, APZ, STD/STA, boundaries, tempo em solo, pernoite, RES/HSB/ASB/DO/DR, continuidade física) — ver schema em `QA_ORACLES.md`.
5. Rodar o pipeline real de importação AIMS (não funções intermediárias) contra cada fixture.
6. Gerar matriz PASS/FAIL/REVIEW comparando artifact canônico x oracle, com foco em como o parser atual se comporta com o bloco 11-21/08 quando revisões diferentes coexistem.
7. Nunca ajustar a fixture/oracle para o teste passar — divergência vira causa-raiz investigada no parser/derivação.
