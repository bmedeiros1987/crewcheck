# Proposta: revisão monotônica da escala por competência

> **Status: rascunho para revisão. Nada aqui roda em produção.** Não há migração, mudança de runtime nem dado real. O DDL (`schema-draft.sql`) fica fora de `migrations/` de propósito. O protocolo e a reconciliação são implementações de referência, exercitadas só contra MySQL descartável e em testes puros.
>
> **Continuam bloqueados, sem desenho aprovado nem implementação:**
> - a fonte autoritativa do vínculo conta→crewId; hoje o perfil não tem matrícula e o crewId vem do PDF;
> - o backfill, que é só desenho futuro: `legacy_backfill` não existe no ENUM e faltam testes de crash, retomada, concorrência e do invariante de nunca sobrescrever geração > 0;
> - a escrita dupla, composta com a #1086;
> - o outbox real e durável no app (reload, logout, várias abas) e o contrato de ACK de PDF com #1039/#825;
> - owners e coordenação;
> - backup e restore;
> - o rollback. Ele **não pode** reabrir escrita legada cega nem ressuscitar tombstones: precisa manter cerca/CAS de escrita ou modo só leitura, preservando revisões e pendentes até uma reconciliação explícita;
> - no contrato de cliente legado, a proposta já cobre só criação, `428` com envio pendente e confirmação explícita, testados em MySQL descartável. Ainda faltam versão mínima do app e interface da confirmação.

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
- **tripulante:** `crew_key = ID:<crewId>`;
- **competência:** `roster_key = AAAA-MM`;
- **tipo:** `planned | operated`.

**Pré-condição não implementada:** `crewKeyFor` só normaliza a sintaxe da matrícula e recusa placeholders; isso **não prova identidade**. A escrita exige um vínculo autoritativo, server-side, da conta a um único tripulante (`resolveVerifiedCrewKey(email)`, injetado). Sem esse vínculo, nenhuma escrita acontece (`403 CREW_IDENTITY_UNVERIFIED`). Ainda é preciso decidir a fonte: verificação pela empresa, documento conferido ou outra. Com o vínculo:
- se a chave pedida for de outro tripulante: `403 CREW_IDENTITY_NOT_BOUND`;
- se a matrícula impressa no PDF divergir: `422 CREW_IDENTITY_MISMATCH`.

O nome nunca serve como identidade. Os testes usam um vínculo sintético.

### Geração monotônica
`crewcheck_roster_competences.generation` só cresce, inclusive na exclusão (o estado vira `deleted`, um tombstone). Cada geração aceita vira uma linha imutável em `crewcheck_roster_revisions`, com:
- `content_hash`;
- `parser_version`;
- `schema_version`;
- `source_kind`;
- `client_operation_id`.

### Hash de conteúdo
O hash é calculado sobre o **roster canônico inteiro**, depois de uma sanitização determinística e versionada (`CONTENT_HASH_VERSION`, `schema_version`):
- chaves ordenadas;
- `undefined` removido;
- **só o ruído declarado (`rawText`, em qualquer nível) fica fora**.

Por isso mudar apenas `base`, `rank`, companhia, nome, totais, cobertura da fonte, um dia ou um trecho gera uma revisão nova. Limites (370 dias, 16 trechos por dia) são recusados (`422 ROSTER_LIMIT_EXCEEDED`), nunca truncados.

### Escrita (`server-protocol.mjs`)
1. **Validação.** O servidor confere o vínculo de identidade, a competência, os limites e a completude do mês: todos os dias civis exatamente uma vez. Uma escala incompleta é recusada (`422`) antes de qualquer escrita, e a versão válida continua.
2. **Trava.** A linha da competência é travada com `FOR UPDATE`.
3. **Recibo de operação e replay.** Toda decisão tomada sob a trava da competência grava **um recibo** do `client_operation_id`, na **mesma transação** da revisão e da competência. Vale para aplicada, sem mudança (no-op), conflito e recusa de conteúdo.
   - O recibo guarda o `requestHash`, o resultado e a **resposta original**.
   - O reenvio do mesmo id (ACK incerto) devolve essa resposta original marcada como replay, **nunca o estado atual como ACK antigo**.
   - O mesmo id com qualquer diferença no pedido recebe `422 OPERATION_ID_REUSED`. O pedido inclui competência, operação, base, conteúdo, parser, schema e origem.
   - Pedidos não autenticados, sem vínculo ou malformados são recusados antes da trava e não gravam recibo, porque não dá para associá-los a uma competência com segurança.
   - O mesmo id disputado em competências distintas colide na chave do recibo. A transação perdedora é refeita, e o recibo do vencedor decide.
   - Revisões guardam só mudança real, ou seja, quando a geração avança.
   - **Retenção fail-closed:** não existe expurgo de recibos. Um expurgo futuro exige um fencing no servidor, por exemplo uma época monotônica com recusa de épocas antigas. Sem isso, apagar um recibo permitiria reaplicar um id antigo como novo.
4. **Conflito.** Se `baseGeneration` for diferente da geração atual, o servidor responde **409** com o estado atual. Isso vale inclusive para hash igual: hash nunca autoriza escrita.
5. **No-op.** Base correta com conteúdo igual ao atual não gera nova geração.
6. **Gravação.** Caso contrário, `generation+1`, uma nova linha de histórico e a atualização condicionada a `generation = base`.
7. **Cliente legado** (sem base e sem `operationId`) nunca escreve às cegas:
   - **competência ausente:** pode ser criada, com id de operação determinístico derivado de tudo o que o pedido vincula (conteúdo e versão do parser). O mesmo pedido reenviado é replay da resposta original, mesmo depois de uma exclusão, e nada é ressuscitado;
   - **conteúdo idêntico ao atual:** no-op, sem escrita;
   - **competência existente ou excluída:** `428 REVISION_PRECONDITION_REQUIRED`. O conteúdo fica como **envio pendente** (`crewcheck_roster_legacy_submissions`), gravado na mesma transação do recibo;
   - **o pendente só vira revisão por confirmação explícita** de um cliente com revisão. A confirmação usa a geração que o usuário viu e um `operationId` novo, sob o mesmo CAS de qualquer escrita. O conteúdo aplicado é o armazenado, nunca o do pedido; com base velha recebe 409 e continua pendente; cada envio é aplicado no máximo uma vez, inclusive com confirmações simultâneas;
   - **descartar** também é escolha explícita, e a linha é mantida com status `dismissed`;
   - o dado do cliente antigo continua no aparelho (`saveRosterAnalysis` cai no catch e devolve o local).

### Leitura
A listagem é completa e inclui tombstones. Assim o aparelho distingue "excluída na conta" de "nunca enviada" sem depender de ausência ou de `LIMIT`.

### Aparelho (`client-reconcile.mjs`, puro e sem relógio)
Estados de cada competência no aparelho:
- `synced`: a revisão confirmada pelo banco;
- `inflight`: o **snapshot imutável** do que foi enviado, com `operationId`, base e conteúdo. Todo snapshot (mudança registrada, envio, revisão adotada) é uma **cópia profunda congelada até as folhas**, então alterar o objeto original depois não muda o que foi registrado, enviado ou adotado;
- `pending`: a mudança local mais nova, ainda não enviada;
- `conflict`;
- `seen`: a maior geração já observada.

**Correlação de envio.** Uma resposta só vale para o envio com o mesmo `operationId`, e o resultado se aplica **a esse snapshot**. Se uma mudança B surgir enquanto A está em voo, B fica encadeada atrás de A e recebe a base quando o ACK de A chega. B nunca é marcada como sincronizada nem descartada pelo ACK de A. ACKs duplicados, atrasados ou fora de ordem são ignorados. Sem resposta, o mesmo snapshot é reenviado com o mesmo `operationId`.

**Monotonicidade.** Listagem, leitura ou ACK com geração menor que `seen` são obsoletos e ignorados. Nada rebaixa nem recria uma competência excluída numa geração posterior.

Comportamento:
- **Offline:** mostra o pendente, o que está em voo ou o cache.
- **Online:** mostra o banco. Todo pendente é enviado e o servidor julga.
  - **409 com o mesmo conteúdo:** o aparelho adota o banco sem escrever.
  - **Demais 409:** viram conflito explícito, guardando a mudança mais nova e as substituídas.
  - **Conflito** só fecha por escolha do usuário, e a escolha vale só para a **visão do banco que ele viu**. Se uma geração mais nova chegar com a tela aberta (por exemplo, uma exclusão), a tela é atualizada e a escolha feita sobre a visão antiga é recusada (`CONFLICT_VIEW_STALE`) sem alterar nada; o usuário precisa confirmar de novo:
    - "manter a do banco" adota essa visão (com o roster), então um cache offline antigo nunca reaparece; as mudanças locais são arquivadas e continuam recuperáveis;
    - "manter a minha" usa como base **exatamente** a geração vista, nunca uma maior que o usuário não viu.
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
- reuso de `operationId` e envio duplicado;
- revisão só de metadados (`base`, `rank`);
- `operationId` com outro parser ou outra origem.

`scripts/regression-roster-revision-receipts.mjs` (MySQL descartável) cobre:
- reuso do id após no-op, exclusão sem efeito, conflito e recusa;
- replay da resposta original depois que a competência avançou;
- cópias simultâneas do mesmo id na mesma competência e em competências distintas;
- falha injetada antes do `COMMIT` e dentro da transação, sem persistir nada;
- ids determinísticos de cliente legado;
- ausência de caminho de expurgo.

Cinco mutantes, cada um reintroduzindo um defeito, morrem por asserção, inclusive o no-op com `ROLLBACK` e 200.

Complemento puro, sem banco: `scripts/regression-roster-revision-reconcile-interleavings.mjs` cobre:
- A enviado → B nova → ACK(A);
- ACKs duplicados ou invertidos;
- leituras invertidas;
- tombstone em geração posterior;
- logout, troca de conta e envio abortado;
- 409 preservando a mudança mais nova;
- `keep_server` adotando o banco;
- tela de conflito obsoleta (exclusão chegando com a tela aberta) recusada nos dois sentidos;
- snapshots profundos e imutáveis após registro, envio e adoção;
- hash canônico.

Cada defeito revisado é reintroduzido como mutante, e a suíte precisa falhar com cada um.

## O que falta decidir (dot e Bruno), antes de qualquer implementação real
1. **Identidade sem crewId (PDF formato ticket).** A proposta recusa (`CREW_IDENTITY_REQUIRED`). A alternativa segura é a conta ter uma matrícula verificada única à qual o servidor vincula o PDF; o nome nunca serve.
2. **Planejada vs operada.** É preciso definir o que o PDF importado representa em cada caso. Hoje a planejada existe só no aparelho.
3. **Transição.** Tudo aqui está bloqueado; ver o status no topo.
   - backfill é desenho futuro: só criar onde não há competência, nunca sobrescrever geração > 0, quarentena das linhas sem vínculo verificado, e testes de crash, retomada e concorrência;
   - escrita dupla na mesma transação e trava, composta com a #1086, para os leitores antigos (Telegram, compartilhamento, relógio);
   - cliente legado: só criação ou `428`, ou pendente com confirmação; nunca escrita cega;
   - rollback com cerca/CAS ou modo só leitura, sem reabrir escrita legada cega nem ressuscitar tombstones.
4. **Interface do conflito.** Texto curto que mostre "do dia X ao dia Y" de diferença, em linha com o pedido de não encher de texto.
5. **Banco real.** Backup, revisão independente, aprovação específica e janela. Nada disso foi feito nem solicitado.
