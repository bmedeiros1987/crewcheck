# Preparação Infobip OFF — atualização v4

> Histórico: as lacunas de código desta etapa são fechadas pelo
> [candidato completo OFF](infobip-whatsapp-complete-off.md). Consulte o relatório
> externo para o HEAD exato validado em SQL; não confundir preparação com ativação.

Base desta etapa `b198acc9d507ff89b1ad75424ddcab72d3a10fd3`; base original
`2286c88ffed330246f1c39bed5ad7bb4d64e7851`. Este documento substitui as
pendências de implementação descritas na nota anterior; não anuncia ativação.

## Ownership e escopo

Inspeção read-only em2026-10-16: PR888 HEAD
`4a46197e2b19a39269010f08703088d27c57cf2b` e PR926 HEAD
`1ae387c3a9f8be9ed76e96761e8e9663967b635d` continuam draft. Menus/PDF/visitantes
e guards restritos continuam nesses PRs, gates OFF, sem duplicação. Nenhum outro
candidato Infobip aberto encontrado. Sender guard da890, Home e financeiro preservados.

## Implementado nesta etapa

- Composição de teste usa por padrão o handler existente configurado por
  `configureWhatsAppConcierge`, via `invokeConfiguredWhatsAppConcierge`.
  Email vem do vínculo revalidado; snapshot/reply builder são os canônicos.
  Teste executa o callback materializado com snapshot e builder sintéticos,
  atravessando invoker e request mock. Não prova consultas reais do motor.
- Reutiliza vínculo WhatsApp ativo: start exige sessão e consentConcierge=true,
  código no canal conclui prova de número. Mesmo serviço/escopo/destinatário não
  precisa novo opt-in apenas por fornecedor. Removido grant Infobip adicional.
  Locks/revisões/titular/consentimento continuam revalidados. Não cria vínculo
  pelo adaptador, nem transforma “oi” ou ordem de operador em consentimento.
- SQL usa pool existente e três tabelas, sem DDL. Prazo monotônico total8s,
  incluindo aquisição; begin/query/save/commit/rollback limitados individualmente
  a2s. Deadline aborta sinal e destrói somente conexão adquirida; aquisição
  atrasada é liberada; continuação tardia não consulta/commita. Erros fixos/redigidos.
- Motor tem deadline5s, resultado tardio descartado e sem retry. Abort não garante
  interrupção das dependências internas do motor. Proposta revalida vínculo.
- Marker dispatching é commitado antes da tentativa. Transação de envio revalida
  vínculo e exige tempo restante para send≤5s +2s de SQL antes de iniciar I/O.
  Sinal SQL é combinado com o de envio. Reserva2s não garante save E commit;
  resultado pode ser uncertain. Sem retry após ambiguidade. Abort de rede não
  prova ausência de aceitação externa; não existe transação distribuída.
- Receiver DLR offline autentica Basic antes do parse, limita corpo64KiB/batch20,
  reconhece apenas delivered estrito group3/id5/DELIVERED_TO_HANDSET. Exige
  cc-eventKey de tentativa prévia, HMAC de recipient/sender e timestamps da
  tentativa. Erro/contact divergente, SEEN, inbound ou pending não viram entrega.
  held/cancelled/ausente não aceitam DLR. dispatching/uncertain/accepted podem
  subir para delivered; duplicatas são idempotentes; nada agenda novo envio.
- Manutenção explícita em lotes≤20/cursor, somente namespace Infobip: payload
  expira15min, tombstone retido72h, inbound aceito até48h+30s futura. Após purga,
  replay antigo é recusado pelo parser. dispatching expirado vira uncertain.
  `forgetAccountId` apaga payload/correlação do titular por HMAC, conserva claim
  temporário. Deve ser chamado após revogar/remover vínculo, impedindo novos jobs.
  Estados legados sem retainUntil não são purgados automaticamente. Sem timer.

Rotas públicas inbound e `/api/infobip/whatsapp/delivery` permanecem503/OFF,
sem leitura de body/auth/env ou acesso a pool/motor/request. Alterar flag/env não
ativa composição. Métodos de teste não são APIs públicas. Sem serviço/worker novo.

## Contratos documentados versus conta efetiva

[Referência DLR](https://www.infobip.com/docs/api/channels/whatsapp/receive-whatsapp-delivery-reports):
obtida OpenAPI pública usada pela página oficial. Confirma results[], to,
messageId, sentAt, doneAt, status entregue e ACK200. Recorte e schemas em
evidence/v4/dlr-openapi-contract.json, fora do repo. Contrato clássico não comprova
envelope da assinatura atual, SEEN, autenticação em notifyUrl ou routing da conta.

[Perfis](https://www.infobip.com/docs/subscriptions/manage/notification-profiles)
e [auth](https://www.infobip.com/docs/subscriptions/manage/authentication-settings):
Basic é suportado no perfil. Candidato exige HTTPS, senha exclusiva≥32chars e um
Authorization canônico; header único é política conservadora. Não adicionar
Authorization manual junto do Basic. API key App de saída é distinta. HMAC sem
encoding/prefixo comprovado não tem fallback. Nenhum segredo criado/lido.

[Retries gerais](https://www.infobip.com/docs/reporting/webhooks): até41h30,
depois pode perder eventos. Aplicação exata a este inbound/perfil continua não
comprovada; sem presunção de ordering, exactly once ou matriz4xx completa.
48h/15min/72h são políticas candidatas, não valores observados da conta.

Perfil CrewCheck informado com URL vazia e autenticação não selecionada. Não foi
configurado. Falta comprovar subscription/profileId, eventos/filtros de
sender/application/entity, URL/authId/tipo, response regex/body regex, batch,
window/timeouts/TLS e routing do sender atual. Read timeout deve comportar ACK
durável do batch, preferencialmente1. Basic no perfil não comprova notifyUrl
autenticado. Não migrar WABA nem reutilizar credencial Voice.

Reuso de consentimento pressupõe mesmo serviço CrewCheck e escopo já consentido.
Sender/conta/routing devem comprovar essa identidade. Marketing/alertas/visitantes/
PDF/chamadas não herdam permissão de conversa. Novos destinatários ainda dependem
do fluxo autenticado existente: conclusão por código via Infobip não implementada.
Cutover que retire a conclusão Meta precisa adaptar/revisar o consumo do código
existente; isso é lacuna de implementação, não motivo para novo consentimento.

## Validação e limites

Suítes sintéticas: candidate; persistence com motor canônico/consentimento/DLR/
retenção/esquecimento/deadlines/continuação tardia/reserva insuficiente; runtime
OFF nas duas rotas; ampla WhatsApp com preparo canônico; sender; status diagnostics.
Mocks bloqueiam rede real; nenhuma mensagem, Aiven ou credencial real.

MySQL8.4.11/InnoDB real passou no HEAD ANTERIOR b198: concorrência, rollback,
ACK perdido injetado, locks/revogação e reinício gracioso. Processos/datadir/
binários removidos; sql-ephemeral-plan/EXECUTION.md fora do repo conserva evidência.
Esse PASS não é atribuído ao delta novo, validado com fixture mysql2. Não houve
reinstalação. Crash/failover e ambiente real não comprovados.

## Ações restantes para conclusão operacional

Implementação: composição habilitada explícita e borda HTTPS/body com limites;
conectar manutenção e exclusão ao lifecycle; se necessário, conclusão do código
existente por Infobip; testes integrados do motor com dependências isoladas e
validação SQL do delta final. Não basta trocar flag/env. Manutenção não é automática.

Conta/contrato: provar sender do serviço, routing, formato, autenticação e ACK
efetivos, limites/retries; escolher DLR autenticado compatível com perfil;
confirmar engine/tabelas/permissões mínimas do pool sem acessar produção nesta tarefa.

Operação: aprovação específica de configuração/credenciais/env, custo, deploy e
teste real. Publicação de código OFF não autoriza ativação paga. Nada disso foi
executado nesta etapa; preparação continua reversível e sem provider habilitado.
