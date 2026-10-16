# Infobip WhatsApp: candidato offline, release bloqueada

Base: `2286c88ffed330246f1c39bed5ad7bb4d64e7851` (main, 2026-10-16).

O módulo `server/infobip-whatsapp-candidate.mjs` não é importado pelo servidor.
`INFOBIP_WHATSAPP_RELEASE_ENABLED=false` é literal e a resposta de release é
sempre 503. Nenhuma variável de ambiente pode ativá-lo. Não contém transporte,
leitura de credenciais reais, SQL/DDL, logs ou código de configuração Infobip.
Não é um receptor de produção pronto para configurar.

## Ownership e escopo

Antes da implementação, a lista de tarefas indicou somente esta frente ativa
para o receptor; a tarefa de browser estava idle e seu browser não foi operado.
As buscas de PRs abertos por Infobip/WhatsApp não encontraram receptor equivalente.
#872 é Wake e #907 é MyCrewCare; #888/#926 permanecem drafts de menus/PDF com
gates OFF e não são portadas aqui. Nenhuma Home ou fórmula financeira é alterada.

`server/whatsapp.mjs` continua Meta Cloud API. O materializador
`scripts/p1-whatsapp-sender/apply.mjs` da #890 permanece intacto, incluindo guards
de sender, vínculo e consentimento. O candidato não converte eventos Infobip em
eventos Meta e não chama o transporte Meta como fallback. Voice/TTS Infobip não
é modificado. Nenhum número ou ID real é usado nas fixtures.

## Contratos oficiais consultados em 2026-10-16

- [Subscription components](https://www.infobip.com/docs/subscriptions/subscription-components):
  Basic, HMAC e OAuth são autenticações possíveis do perfil. HMAC usa o corpo
  bruto integral, o algoritmo configurado e, por padrão, `X-Hub-Signature`.
- [Authentication settings](https://www.infobip.com/docs/subscriptions/manage/authentication-settings):
  Basic usa username/password por request. A API key de envio não é autenticação
  de webhook. O teste implementa somente Basic estrito com credenciais fictícias;
  nenhum segredo foi criado ou configurado. Isso comprova o verificador offline,
  não a identidade de uma request real da assinatura atual.
- [Inbound, DLR e BSUID](https://www.infobip.com/docs/whatsapp/manage-integration/usernames-and-user-ids):
  `results[]`, `from`, `to`, `integrationType=WHATSAPP`, `receivedAt`, `messageId`,
  `message.type=TEXT`, `message.text`. `from` pode ser BSUID. O candidato aceita
  apenas telefone estrito e recusa BSUID; nunca remove caracteres para fabricar
  telefone nem resolve identidade por nome/username. Suporte a BSUID exige vínculo
  próprio autenticado. Campos opcionais desconhecidos não são persistidos.
- [Reports](https://www.infobip.com/docs/whatsapp/reports): entrega significa
  chegada ao dispositivo; seen significa visualização. Aceitação HTTP/API não
  significa entrega. O classificador só reconhece o exemplo oficial completo
  `3/DELIVERED/5/DELIVERED_TO_HANDSET`; qualquer outro status fica unconfirmed.

O classificador é uma função pura, não atualiza recibos nem aceita callbacks de
status. Requests de status/mistos são rejeitados pelo receiver de inbound.
Falta a correlação durável de status com outbound conhecido, sender e destinatário,
além de transições monotônicas. Não há promessa de rastreamento de entrega.

## Comportamento do candidato

`createOfflineInfobipReceiver` recebe bytes, headers e dependências injetadas.
Rejeita auth ausente, duplicada ou diferente, corpo acima de 64 KiB, batch acima
de 20, sender empresarial errado, telefone inválido, conteúdo não textual,
conflito com telefone de contato e eventos antigos/futuros. Valida o batch inteiro
antes de efeitos. Basic requer HTTPS no futuro deployment; esse módulo não abre
listener nem valida TLS. HMAC não é adivinhado ou aceito como fallback.

Sender Infobip é o telefone empresarial em `to`, não o Meta Phone Number ID.
O vínculo exigido é específico de provider/sender/destinatário, conta e revisão,
com consentimento booleano explícito e revogação falsa. O candidato não cria
vínculos automaticamente nem manda instruções a desconhecidos.

O contrato injetado de store exige transação serializável para lookup, claim único
e enqueue atômicos. O claim usa namespace estável e SHA-256 de
provider/sender/messageId, independente de rotação de credenciais; esse hash não
é uma alegação de anonimização. Digest divergente para o mesmo ID falha fechado. Não existe fallback em
memória em produção: nenhum store de produção foi implementado. O ACK só ocorre
depois da resolução das transações. Em batch parcialmente commitado, retry deve
encontrar claims anteriores e completar o restante sem repetição.

O teste fornece exclusivamente um store sintético serializado com rollback e
simulação de commit incerto. Ele demonstra a interface, concorrência e retries
nesse modelo, não durabilidade MySQL, isolamento real ou recuperação após crash.
A fila sintética contém texto em memória; um futuro store deve proteger dados,
limitar retenção e não guardar telefone/texto em auditoria ou logs.

A janela de freshness de 15 minutos e tolerância futura de 30 segundos são
políticas conservadoras do candidato, não garantias Infobip. Freshness é reavaliada
antes de preparar proposta de resposta. Dedup precisa sobreviver a reinício e ao
horizonte de retry; a retenção real ainda precisa ser definida/comprovada.

`prepareOfflineInfobipReply` chama apenas o motor injetado, usando a conta derivada
do vínculo; recusa mudança de conta/revisão/sender/destinatário/consentimento durante
o await. Retorna proposta em memória, nunca envia. A proposta não é autorização:
o futuro sender deverá revalidar tudo sob lock até sua tentativa limitada de envio
e impedir reenvio quando o resultado da tentativa for incerto. Esta função não
implementa exatamente-uma-vez para efeitos externos.

## Gates pendentes para ativação

1. Revisão independente do delta final e implementação de persistência/queue real,
   testes de transação, concorrência, reinício, commit incerto, TTL e revogação
   durante processamento/envio. Não usar o store sintético no runtime.
2. Contrato de eventos/versionamento e retries/timeout/ACK do perfil efetivo.
   Para HMAC, comprovar codificação/prefixo exatos do header; as páginas consultadas
   não os definem claramente. Não reutilizar `sha256=hex` da Meta por suposição.
3. Evidência autorizada do sender Infobip e seu vínculo ao número/WABA/serviço
   esperado. A conexão Meta informada não prova registro/routing pelo Infobip e
   não autoriza migração de WABA. A assinatura atual sem URL/auth não foi alterada.
4. Implementar transporte específico com guard de sender, binding, destinatário,
   consentimento e janela da conversa, além de status correlacionado e monotônico.
   Nenhum custo pode ser inferido como zero a partir de testes offline.
5. Aprovação específica antes de criar/configurar credenciais, perfil, URL/auth,
   env, permissões ou despesas; configuração segura só após revisão. Para Basic,
   TLS obrigatório e segredo exclusivo forte; avaliar HMAC após contrato comprovado.
6. Wiring de produção e remoção do gate em alteração posterior revisada; testes
   reais/deploy/envios somente mediante escopo e custos explicitamente autorizados.

## Validação offline

`node scripts/regression-infobip-whatsapp-candidate.mjs`

Sem dependências npm e sem browser, API externa, DB ou mensagens reais. Cobre
Basic estrito, shape/limites, sender, vínculo/consentimento, concorrência, rollback,
commit incerto, replay/freshness, revogação durante await, proposta de destinatário
correto e distinção aceitação/entrega. Essas evidências não comprovam configuração
ou autenticação do provedor real. Não houve configuração/env/deploy/PR/envio aqui.

Revisão independente inicial encontrou um bloqueador: a chave de dedup não pode
depender de segredo rotacionável. Corrigido para namespace estável independente
de credenciais e coberto por teste de rotação/recriação do receiver. A revisão
final não encontrou novos achados críticos, altos ou médios no escopo offline.
Preparação completa `scripts/v139/apply.mjs` passou tanto na base limpa quanto
no candidato. Regressões de sender e diagnóstico WhatsApp passaram na fonte
preparada. A regressão ampla `regression-whatsapp-business-webhook.mjs` falhou
em ambos no mesmo passo legado `v14383`: botão de vínculo Telegram não localizado.
Uma execução inicial da preparação após aplicar somente o guard #890 falhou em
`v14410`; repetir a preparação completa a partir da fonte limpa resolveu isso.
Não atribuir essa falha inicial ao candidato nem reportar a suíte ampla verde.
Arquivos gerados pela preparação foram removidos/restaurados no checkout isolado;
o delta final contém apenas este documento, o módulo e sua regressão sintética.
