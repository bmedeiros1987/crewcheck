# Proposta: revisão monotônica da escala por competência

> **Status: rascunho para revisão. Nada aqui roda em produção.** Não há migração, mudança de runtime nem dado real. O DDL (`schema-draft.sql`) fica fora de `migrations/` de propósito. O protocolo e a reconciliação são implementações de referência, exercitadas só contra MySQL descartável pelo teste `scripts/regression-roster-revision-sync-proposal.mjs`.

## Requisito (Bruno, 30/10 00:40)

> "Tem que sempre abrir do banco, mas se o dispositivo estiver offline puxa do celular até conectar de novo e o sistema comparar qual mais atual para saber qual deve atualizar."

O comportamento esperado:
- **Online:** o banco é a autoridade.
- **Offline:** vale o cache do aparelho.
- **Na reconexão:** o aparelho compara revisões confiáveis e reconcilia.
- **O que é proibido:**
  - "o banco sempre vence" apagar uma importação pendente que ainda não foi enviada;
  - relógio do aparelho, `createdAt` ou `updated_at` decidirem qual versão é a mais nova;
  - conflito resolvido em silêncio.

## Por que parar a correção sem schema

`scripts/regression-roster-sync-current-path-counterexamples.mjs` roda o caminho real de hoje. Ele usa:
- o cliente preparado, em dois aparelhos sintéticos isolados;
- o handler preparado de `/api/rosters`;
- SQL real num MySQL descartável.

O teste demonstra:

1. **Revisão velha vence a janela de exibição.** Uma cópia local antiga em outro aparelho ganha da revisão do banco. Quem decide é o relógio do aparelho, porque a janela compara `createdAt`. A linha do banco mantém o `created_at` da primeira importação, e os formatos de data são diferentes dos dois lados.
2. **Sobrescrita cega.** Um re-salvamento de uma revisão velha substitui a mais nova, sem pré-condição nem conflito.
3. **Ressurreição.** Uma competência excluída volta quando um aparelho que nunca viu a exclusão salva de novo. A exclusão é física e não deixa tombstone.
4. **Escrita perdida em silêncio.** Duas importações simultâneas sobre a mesma base recebem confirmação; uma delas some sem aviso.
5. **Importação offline nunca reenviada.** Ela fica só no aparelho: não há fila nem marca de pendente.
6. **Checksums sem correspondência.** Há três famílias:
   - `offlineSync.checksumRoster` (preparado pela v14.3.72): conteúdo antes de sanitizar, e sem chamador no app;
   - histórico local: FNV-1a;
   - `rosterFingerprint` do servidor: depois de `sanitizeRoster`.

   Nenhuma pareia a cópia local com a linha do banco. **Não existe colisão funcional:** nenhum caminho vivo faz duas revisões compartilharem checksum.

Um CAS só por fingerprint de conteúdo, sem schema novo, também não basta, porque o hash não é uma geração:
- **ABA:** depois de A→B→A, uma edição feita sobre o primeiro A é aceita.
- **Exclusão e recriação com o mesmo conteúdo:** uma base de antes da exclusão volta a valer.
- **Replay após ACK incerto:** o servidor não distingue o reenvio de uma revisão nova com o mesmo hash.

Pela orientação da revisão, a correção foi interrompida aqui em vez de enfraquecer as invariantes.

## Desenho proposto

### Identidade
A chave é **conta + tripulante + competência + tipo**:
- **conta:** o e-mail autenticado;
- **tripulante:** `crew_key = ID:<crewId>` verificado. Nunca o nome, e IDs placeholder são recusados;
- **competência:** `roster_key = AAAA-MM`;
- **tipo:** `planned | operated`.

### Geração monotônica
`crewcheck_roster_competences.generation` só cresce, inclusive na exclusão (o estado vira `deleted`, um tombstone). Cada geração aceita vira uma linha imutável em `crewcheck_roster_revisions`, com:
- `content_hash`;
- `parser_version`;
- `schema_version`;
- `source_kind`;
- `client_operation_id`.

### Escrita (`server-protocol.mjs`)
1. **Validação.** O servidor confere o crewId, a competência e a completude do mês: todos os dias civis exatamente uma vez. Uma escala incompleta é recusada (`422`) antes de qualquer escrita, e a versão válida continua.
2. **Trava.** A linha da competência é travada com `FOR UPDATE`.
3. **Replay.** Se o `client_operation_id` já existe, o servidor devolve o resultado gravado (replay) e não escreve de novo. O mesmo id com outro conteúdo recebe `422`.
4. **Conflito.** Se `baseGeneration` for diferente da geração atual, o servidor responde **409** com o estado atual. Isso vale inclusive para hash igual: hash nunca autoriza escrita.
5. **No-op.** Base correta com conteúdo igual ao atual não gera nova geração.
6. **Gravação.** Caso contrário, `generation+1`, uma nova linha de histórico e a atualização condicionada a `generation = base`.
7. **Cliente legado** (sem base e sem `operationId`):
   - pode apenas **criar** uma competência inexistente, com id de operação determinístico, então o reenvio é idempotente;
   - recebe `428` se a competência já existir ou tiver sido excluída: nunca sobrescreve nem ressuscita;
   - o dado dele continua no próprio aparelho.

### Leitura
A listagem é completa e inclui tombstones. Assim o aparelho distingue "excluída na conta" de "nunca enviada" sem depender de ausência ou de `LIMIT`.

### Aparelho (`client-reconcile.mjs`, puro e sem relógio)
Estados de cada competência no aparelho:
- `synced`: a geração confirmada pelo banco;
- `pending`: a mudança gravada **antes** do envio, com `baseGeneration` e `operationId`;
- `conflict`: o banco mudou desde a base do pendente.

Comportamento:
- **Offline:** mostra o pendente ou o cache.
- **Online:**
  - mostra o banco;
  - todo pendente é enviado com o mesmo `operationId`, e quem julga é o servidor (replay, 409 ou aceite);
  - 409 com conteúdo igual ao atual: o aparelho adota o banco sem escrever;
  - os demais 409 viram conflito explícito, que só fecha por escolha do usuário. "Manter a do banco" arquiva o pendente, que continua recuperável; "manter a minha" refaz a base na geração vista;
  - cache com geração menor que a do banco adota o banco; tombstone esconde a competência.
- **Troca de conta:** as entradas são por conta, e uma mudança nunca é enviada por outra conta.

### Cenários cobertos (MySQL descartável)
- offline → online, com meses distintos;
- dois aparelhos importando ao mesmo tempo sobre a mesma base;
- latência e ACK perdido com corrida;
- reimportação com o mesmo hash;
- ABA;
- tombstone sem ressurreição;
- cliente legado;
- identidade (crewId, isolamento entre contas, logout e troca de conta);
- PDF incompleto;
- planejada vs operada;
- relógios em 1999 e 2099 dando o mesmo resultado;
- reuso de `operationId` e envio duplicado.

## O que falta decidir (dot e Bruno), antes de qualquer implementação real
1. **Identidade sem crewId (PDF formato ticket).** A proposta recusa (`CREW_IDENTITY_REQUIRED`). A alternativa segura é a conta ter uma matrícula verificada única à qual o servidor vincula o PDF; o nome nunca serve.
2. **Planejada vs operada.** É preciso definir o que o PDF importado representa em cada caso. Hoje a planejada existe só no aparelho.
3. **Transição.**
   - backfill de `crewcheck_platform_rosters` para geração 1, colocando em quarentena as linhas sem crewId;
   - escrita dupla na tabela atual durante a migração, para os leitores antigos (Telegram, compartilhamento, relógio);
   - prazo para clientes legados;
   - política de `428` para eles.
4. **Interface do conflito.** Texto curto que mostre "do dia X ao dia Y" de diferença, em linha com o pedido de não encher de texto.
5. **Banco real.** Backup, revisão independente, aprovação específica e janela. Nada disso foi feito nem solicitado.
