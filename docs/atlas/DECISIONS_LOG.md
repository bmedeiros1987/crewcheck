# Atlas — Log de decisões

Decisões do Bruno e mudanças de prioridade, com procedência. Schema em `PROVENANCE.md`. Este log registra a decisão em si, não a discussão inteira — para o raciocínio completo, ver a conversa/PR referenciada em `evidence_ref`.

```yaml
claim: "PR #513 (identidade de jornada) aprovado para merge."
status: CONFIRMADO
source: "Merge direto no GitHub"
validated_by: Bruno
evidence_ref: "commit b26a05c"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "Após smoke test pós-merge do #513 dar verde, iniciar PR B (#512) imediatamente, sem esperar nova autorização."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat"
validated_by: Bruno
evidence_ref: "PR #524"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "Comentário no PR #524 pedindo trabalho em #510 contradizia a restrição anterior de não tocar #510; Claude corretamente parou e escalou em vez de agir."
status: CONFIRMADO
source: "Confirmação direta do Bruno no chat, após escalação do Claude"
validated_by: Bruno
evidence_ref: "PR #524, comentário id 5335699431"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "Restrição de não tocar #510 é revogada a partir de agora, escopo limitado a auditoria/correção de apresentação/APZ — não pode virar refatoração ampla sem necessidade."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat, revogação explícita da restrição anterior"
validated_by: Bruno
evidence_ref: "#510"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "Sequência de prioridade: concluir veredito técnico do #524 -> #527 (corpus AIMS/Crewtopia) -> #510 (APZ/apresentação) -> #525 (pernoite/tempo em solo) -> #526 (horas de voo NB/WB) -> FlightDeck/Pulse/UI."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat"
validated_by: Bruno
evidence_ref: "#524, #527, #510, #525, #526"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "Claude pode emitir veredito técnico MERGE/NÃO MERGE do #524 sem esperar nova confirmação; a execução do merge em si continua exigindo confirmação direta do Bruno ao vivo, independente de aprovação relayada via GitHub."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat"
validated_by: Bruno
evidence_ref: "PR #524, comentário id 5336270252 (veredito)"
recorded_by: claude
date: 2026-08-18
```

```yaml
claim: "PR #524 mesclado pelo próprio Bruno diretamente no GitHub — Claude não executou o merge."
status: CONFIRMADO
source: "Evento pull_request.closed do GitHub + campo merged_by da API"
validated_by: "Estado objetivo do GitHub"
evidence_ref: "commit 2755145"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Criação do Atlas como camada operacional persistente (docs/atlas/) autorizada a começar imediatamente, mesmo com #527 ainda bloqueado por falta dos PDFs."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat"
validated_by: Bruno
evidence_ref: "docs/atlas/"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Bruno anexou os 16 PDFs reais AIMS/CrewRoster diretamente no chat (canal de anexo funcionando), desbloqueando o corpus real do #527."
status: CONFIRMADO
source: "Anexo direto no chat"
validated_by: Bruno
evidence_ref: "#527, docs/atlas/CORPUS.md"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Achado de diferença de fuso (UTC vs. local) entre duas exportações do CrewRoster Report de julho/2026 registrado no Atlas e desmembrado como issue própria (#531), separada do #527."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat: 'Registre no Atlas e abra como item separado'"
validated_by: Bruno
evidence_ref: "#527, #531, docs/atlas/CORPUS.md"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Bruno decidiu não promover as duas exportações de julho deslocadas em ~3h a revisões reais/republicações; classificação rebaixada para REVIEW/A_CONFIRMAR até confirmação, sem 'corrigir' o deslocamento por hipótese. Autorizado prosseguir direto com #527 (fixtures de agosto) sem esperar revisão final do PR #529."
status: CONFIRMADO
source: "Instrução direta do Bruno no chat, refletindo comentário próprio no PR #529 (2026-08-19T21:05:43Z)"
validated_by: Bruno
evidence_ref: "#527, #531, PR #529, docs/atlas/CORPUS.md"
recorded_by: claude
date: 2026-08-19
```

```yaml
claim: "Rodando o parser real de produção (server/rosterParser.mjs::parsePdfOnServer) contra os bytes reais dos PDFs das Revisões A e B, confirmado bug real e reproduzível na apresentação (dutyReport) do formato Escala AIMS/Crewtopia — o formato nativo CrewRosterReport passa nos mesmos casos. Achado feito autonomamente por Claude durante a continuação do #527, sem instrução específica do Bruno para essa checagem — decisão de trabalho dentro do escopo já autorizado."
status: CONFIRMADO
source: "Execução direta do pipeline de produção contra bytes reais, nesta sessão"
validated_by: "Saída determinística do próprio pipeline"
evidence_ref: "#510, #527, docs/atlas/QA_ORACLES.md, docs/atlas/CORPUS.md"
recorded_by: claude
date: 2026-08-19
```
