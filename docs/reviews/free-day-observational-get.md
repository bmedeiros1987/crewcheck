# Leituras observacionais de fontes, fila e autorização pessoal

Problema confirmado em fixture sintética: durante ausência transitória do vínculo
reverso, GET automático da UI cancelava a reserva held e apagava metadata, incluindo
autorização pessoal. Restaurar o vínculo não recuperava um jobKey terminal. Isso
não apagava toda a revisão/preparação, e não há perda real observada ou chamada
de diagnóstico aos endpoints de produção nesta investigação.

Base: main dff5e211e94824ce566958c92fc090261788812c (PR980). Publicação anterior
confirmada pelo Render LIVE em 2026-10-10T14:59:18.644955Z, deploy
dep-db5550brjlhs73aefmhg. Nenhum rollback, alteração de flags/allowlist/secrets/grants
ou recuperação de dados reais é feito por este draft.

## Contrato corrigido

- GET de personalConsent, sourceQueue e voluntarySources executa somente SELECT
  e controle de transação/locks. Não faz INSERT/UPDATE/DELETE, incremento de CAS,
  cancelamento de jobs ou remoção de recibos/metadata/consentimento.
- Contexto expirado, destino inconsistente ou reserva não-held são inelegíveis
  para autorização/entrega. Preparação de fonte e autorização pessoal continuam
  separadas: a autorização de preparação pode permanecer vigente mesmo quando
  um destino está temporariamente indisponível. Nenhum direito/valor é presumido.
- Grant rejeitado por contexto inválido preserva os dados antes do 409. Uma
  revisão stale ou revogação com CAS antigo também não causa limpeza.
- Remoção/cancelamento de dados de fonte ficam na revisão/redefinição ou revogação
  explícitas, autenticadas e com CAS atual. Exclusão da conta mantém seu escopo.
  Nenhum tombstone anteriormente cancelado é automaticamente ressuscitado.
- Expiração torna o dado ineficaz; remoção física fica condicionada a essas ações
  explícitas. A UI informa isso e permite revogar/remover recibos expirados.
- Worker permanece fail-closed: contexto inválido não chega ao provedor nem apaga
  fonte/fila/consentimento; GET do worker também é observacional. Resultados de
  status calculados em memória não reativam tentativas persistidas. Cutoff e
  resultado incerto continuam sem replay. Auditoria de execução válida é separada
  das leituras e das rejeições de contexto.

## Evidências

Regressão de leitura compara integralmente rows/jobs e proíbe qualquer DML nos
GETs: TTL de fonte/pessoal, vínculo reverso ausente/rotacionado, pending/processing/
cancelled/uncertain/sent e flags OFF. Grant inválido e revogação stale preservam
estado. Restaurar vínculo transitório mantém job held e autorização pessoal;
revogação explícita é testada separadamente. Nenhum provider é invocado.

Browser reproduz montagem automática com oferta OFF e vínculo reverso ausente,
compara todo o estado, restaura o vínculo e verifica recuperação do mesmo held e
consentimento, sem reupload ou ressurreição de tombstone. MySQL isolado compara
todas as linhas/jobs antes/depois das leituras e grants rejeitados; cleanup ocorre
somente no revoke explícito. Retestar raw/preparado/build/TypeScript, worker P2,
browser/financeiro e isolamento antes da revisão independente e merge.

## O que falta para avisos pessoais reais

1. Código: integrar apenas trabalhos autorizados à fila/worker Telegram reais,
   com rechecagem de gates, cutoff, cancelamento em voo e reconciliação incerta
   sem retry cego; testar/revisar e publicar inicialmente inerte.
2. Configuração: verificar vínculo e canal já existentes, resolver o ID público
   da conta autenticada confirmada, usar allowlist restrita e oferecer consentimento
   mantendo transporte OFF. Não inferir destinatário ou introduzir grant/secret.
3. Titular: conferir o destino mascarado (e caráter coletivo, se aplicável) e
   realizar pessoalmente o consentimento específico na UI disponível.
4. Ativação: autorização separada para habilitar transporte só nessa conta e nos
   trabalhos selecionados, após gates/revisão/CI; sem liberar backlog ou outras contas.

Esta lista é futura; nenhuma destas ativações é executada nesta correção.
