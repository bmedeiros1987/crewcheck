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

- **Período julho/2026** (29/06 a 01/08): 2 pares CrewRoster Report + Escala, mais 1 CrewRoster Report avulso — **3 revisões distintas** do mesmo mês. Duas dessas exportações do CrewRoster Report nativo **não são uma republicação real** — ver achado UTC abaixo.

### Achado: possível diferença de fuso horário (UTC vs. local) entre duas exportações do mesmo mês — REVIEW, não promovido a republicação nem a fato fechado

**Decisão do Bruno (PR #529, comentário 2026-08-19T21:05:43Z):** não tratar ainda as duas exportações deslocadas como revisões operacionais reais nem "corrigir" o deslocamento por hipótese. Ficam como `A_CONFIRMAR` (estado de trabalho: REVIEW) até confirmação, preservadas como evidência separada, fora do conjunto de revisões operacionais confirmadas e sem contar como cobertura independente.

```yaml
claim: "As duas exportações do CrewRoster Report nativo de julho/2026 têm todos os horários do mês deslocados em exatamente +3h00, mantendo os mesmos voos/estações/pernas — o mesmo delta de America/Sao_Paulo (UTC-3, sem horário de verão) em relação a UTC. Hipótese de trabalho: mesma escala exportada em duas referências de fuso, não republicação operacional real."
status: A_CONFIRMAR   # rebaixado de CONFIRMADO por decisão explícita do Bruno — ver acima
source: "Comparação direta e mecânica entre as duas exportações do CrewRoster Report nativo de julho/2026"
primary_source_examined_by: [claude]
validated_by: null   # aguardando confirmação do Bruno; a checagem abaixo é evidência de apoio, não substitui a validação
reproducible_by_agent: true   # qualquer agente com os dois PDFs originais recalcula o mesmo delta a partir da fonte primária, sem precisar de fixture
evidence_ref: "#527, #531"
recorded_by: claude
date: 2026-08-19
```

**Verificação adicional feita a pedido do Bruno** (deslocamento uniforme por atividade, viradas de meia-noite, duração preservada) — evidência de apoio à hipótese, sem promovê-la:

1. **Delta uniforme por atividade**, não só por dia: conferido ponto a ponto em várias linhas (Duty Report, Dep/Arr, ACY Deb) — sempre exatamente +3h00, sem exceção nas amostras checadas.
2. **Duração preservada**: as colunas `Flying Hrs`/`Duty Hrs` são idênticas entre as duas exportações para a mesma atividade (ex.: LA3804 de 29/06 — `Duty Hrs 02:49` nas duas; LA3730 de 05/07 — `Flying Hrs 02:26` / `Duty Hrs 03:34` nas duas). Consistente com deslocamento de referência (não muda duração), inconsistente com reprogramação real (que tende a mudar duração).
3. **Metadado de sistema idêntico**: as colunas `Updated By`/`Updated Date` (quando o registro foi tocado pela última vez no AIMS) são as mesmas nas duas exportações para as mesmas atividades — sugere que ambas vêm do mesmo estado de banco, só renderizado em referências de horário diferentes.
4. **Virada de meia-noite confirmada**: a jornada de 06/07 (LA3394, Duty Report 22:48 na primeira exportação) desloca +3h00 para 01:48 e **muda de coluna de data** na segunda exportação — passa a ser listada em 07/07 em vez de 06/07, porque o deslocamento empurrou o início para depois da meia-noite. O horário de chegada (PMW) também desloca +3h00 mantendo a mesma duração. Isso é o comportamento esperado de uma diferença de fuso na exportação, não de uma mudança operacional pontual.

Motivo para a hipótese (ainda não fato confirmado): uma republicação real muda pernas/voos/atividades pontualmente (é o que se vê nas ~5 revisões reais de agosto); aqui **cada atividade do mês inteiro** está deslocada pelo mesmo valor exato, com duração e metadado de sistema preservados. As páginas convertidas para o padrão AIMS/Crewtopia ("Escala") sempre trazem o rodapé `Timezone -3 : Brasília`; o formato nativo "Roster Report" **não traz essa marcação explícita**, então o parser não tem como saber o fuso a partir de um único arquivo isolado — só cruzando com outra fonte, como aconteceu aqui.

Item de investigação/produto separado aberto para tratar isso na importação: **#531**.
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

1. Formar o mapa revisão -> pares CrewRoster Report <-> Escala, com um identificador de revisão estável (não o nome do arquivo, que é só um upload id) — a exportação UTC de julho não entra como revisão própria, é a mesma revisão que a exportação local equivalente.
2. Sanitizar (identificador sintético de tripulante, remover nomes de terceiros) e gerar fixture pré-parser por revisão.
3. Produzir oracle explícito por fixture (atividades, APZ, STD/STA, boundaries, tempo em solo, pernoite, RES/HSB/ASB/DO/DR, continuidade física) — ver schema em `QA_ORACLES.md`.
4. Rodar o pipeline real de importação AIMS (não funções intermediárias) contra cada fixture.
5. Gerar matriz PASS/FAIL/REVIEW comparando artifact canônico x oracle, com foco em como o parser atual se comporta com o bloco 11-21/08 quando revisões diferentes coexistem.
6. Nunca ajustar a fixture/oracle para o teste passar — divergência vira causa-raiz investigada no parser/derivação.
