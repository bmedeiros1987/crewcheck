# Plano operacional de hotéis — HOLD

Este plano sanitizado acompanha a proposta de schema. Não autoriza merge,
deploy, migração ou exclusão de conta. Nenhuma operação de produção foi realizada.
Os ensaios usam exclusivamente registros fictícios no container MySQL já existente
no CI, sem porta publicada, segredo de produção ou novo serviço.

## O que muda

| Campo novo | Finalidade |
|---|---|
| `binding_id` | Vínculo explícito com um registro existente do titular |
| `binding_evidence` | Evidência e contexto da confirmação desse vínculo |
| `manual_hotel_override` | Alteração manual e sua proveniência |
| `hotel_source_snapshot` | Última origem comprovada, separada da alteração manual |
| `row_version` | Versão inteira monotônica para rejeitar gravações desatualizadas |

O índice único por titular/vínculo impede vínculos duplicados. Permanecem a chave
primária, a unicidade legada, quartos cifrados, permissões e dados de apresentação.
Não há preenchimento retroativo: NULL não comprova origem manual. JSONs legados
ficam nulos e a versão inicial é zero. Não se criam hotéis remotos implicitamente.

## Compatibilidade e sequência futura

1. Revisar código, DDL exato, motores, tipos, defaults, nulabilidade, colunas não
   geradas e índice integral. Medir volume, espaço livre, transações e janela no
   destino autorizado. O volume e a duração em produção ainda são desconhecidos.
2. Confirmar todos os writers e o executor de exclusão com seus responsáveis.
   Distribuir primeiro o código compatível com schema ausente: GET legado legível,
   PATCH v2 indisponível e reconciliação de hotéis pendente, sem mutações.
3. Preparar e testar uma versão de manutenção que bloqueie escritas de hotéis.
   Não misturar writers antigos com overrides v2. Se o schema já estiver presente
   ou parcial, interromper e revisar o estado; não apagar colunas para fechar readiness.
4. Após aprovação operacional, produzir backup consistente e protegido e provar a
   restauração isolada. Conferir hash do DDL aprovado e aplicar somente na janela
   autorizada. Não executar por startup, importação ou retry automático.
5. Comparar schema, contagens e invariantes; validar com conta sintética autorizada.
   A escrita abre quando readiness reconhece o schema: confirmar todos os writers
   antes desse ponto. CI verde não substitui essa confirmação.

## Backup e restauração

O ensaio `scripts/regression-hotel-binding-mysql.mjs`, raw e preparado, cria um
backup lógico **em memória** de três tabelas fictícias usando transação consistente
REPEATABLE READ somente leitura. Inclui DDL, linhas e checksum; uma gravação
concorrente demonstra estabilidade do snapshot. Restaura em outro schema novo,
compara DDL e todos os valores, incluindo JSONs, BIGINT acima de 2^53, IDs, campos
privados e dados de outro titular, e confirma readiness. Publica apenas checksum,
contagens e resultado; remove exclusivamente schemas que ele próprio criou.
O resultado só é aprovado quando o job passar no SHA correspondente.

Esse ensaio não certifica dump do banco inteiro, recuperação do provedor, retenção,
criptografia, volume real ou DDL concorrente. O DBA ainda deve confirmar o mecanismo
existente, backup privado protegido, checksum, instante e recuperação isolada
representativa, sem publicar dump ou payload no repositório ou em outros serviços.

## Exclusão de conta: limite explícito

Os testes atuais exercitam concorrência PATCH/exclusão por padrão SQL de fixture,
com o mesmo primeiro lock por perfil. Não certificam o endpoint completo.
`handleAccountDeletion` depende de `requireMain` e pode cancelar assinatura antes
da transação. A investigação de autenticação/JWT está bloqueada e fora deste
escopo; não foi retomada nem contornada. Não houve requisição a conta real ou
provedor. A certificação do endpoint com identidade fictícia e todas as suas
dependências permanece pendente do responsável autorizado por essa fronteira.
Não alterar autenticação ou billing para fazer esse teste passar.

## Rollback e risco

O rollback preserva colunas, índice, versões, vínculos e overrides: colocar hotéis
na versão de manutenção somente leitura previamente testada. Não retornar ao
writer antigo com sync ativo, remover colunas, zerar versões ou sobrepor dados
vivos com um dump antigo. Reparações exigem comparação por ID/versão e revisão
própria, preservando gravações posteriores.

Parar por espera inesperada, erro, falta de espaço ou divergência de schema.
Após falha, reler o estado antes de qualquer nova tentativa. A adição de índice
pode exigir espaço e locks; não garantir INSTANT, ausência de indisponibilidade ou
recuperação integral. Não usar fallback automático para COPY nem matar sessões.

Continuam exigindo revisão: contexto alterado sem rebind automático, hotel sem
registro remoto existente e parser sem referência estável. Ausência na origem não
é cancelamento. A migração permanece pendente até revisão operacional separada.
