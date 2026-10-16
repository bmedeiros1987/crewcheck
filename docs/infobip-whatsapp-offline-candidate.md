# Infobip WhatsApp: integração offline, release bloqueada

> Registro histórico até b198. A etapa seguinte substitui os pontos sobre grant
> adicional, motor, DLR, limites SQL e retenção: consulte
> [preparação v4](infobip-whatsapp-preparation-v4.md). O PASS MySQL posterior a este
> registro foi executado em b198; não deve ser atribuído automaticamente ao delta v4.

Base original: `2286c88ffed330246f1c39bed5ad7bb4d64e7851`.
Primeiro candidato: `e7f542ce0054f64830550f8e760f3734d800f9f1`.
Etapa SQL/transporte: `89972c35704691c6c2127527b49043f5ea695e27`.
A composição seguinte acrescenta somente uma superfície de runtime OFF pela cadeia
canônica; não transforma preparação em ativação. O servidor preparado importa
`infobip-whatsapp-runtime.mjs` e cria seu objeto fechado, sem dependências reais.
Gate literal `INFOBIP_WHATSAPP_RELEASE_ENABLED=false`; entradas de
produção `dispatch`/`send` retornam disabled, sem consultar configuração/env.
Métodos `exercise`/`exerciseDispatch` são plumbing de testes com dependências
explicitamente injetadas, não APIs públicas ou autorização de envio.

## Composição de runtime OFF

`createHeldInfobipWhatsAppRuntime` não recebe nem lê configuração. O handler local
para `/api/infobip/whatsapp/webhook` devolve somente 503/INFOBIP_WHATSAPP_DISABLED,
com no-store, antes de ler request/body/auth/credenciais ou adquirir conexão. Não
é um webhook efetivo configurado; não houve deploy. Rotas Meta/Telegram e vínculos
existentes continuam no handler original. Dispatch e expire desse objeto também
são no-op disabled. Alterar apenas env ou a constante de release não habilita a
composição: ativação exige implementação e revisão posteriores.

O materializador `p1-infobip-whatsapp-off/apply.mjs` adiciona import/instância/hook
únicos após os writers de runtime e antes do finalizador canônico, que continua
último. Âncora ausente ou composição duplicada falham a preparação. A composição
é idempotente e não recria servidor, pool, timer ou worker.

`composeInfobipWhatsAppForOfflineTests` liga receiver + store + motor injetado +
transporte injetado. O teste atravessa o pipeline com SQL fixture e mock request,
preservando sender/destinatário/conta/grant/dedup e uma única tentativa. Essa função
não é exposta no objeto de produção ou registrada no servidor.

Validação MySQL efêmera real não foi executada: não há docker/podman/mysql/mysqld/
mariadbd no PATH ou nos locais de instalação consultados em /Applications,
/usr/local e /opt. Só sqlite3 está disponível; não é substituto para InnoDB.
Não se instalou ferramenta, iniciou serviço, criou banco ou acessou credenciais.
Para esse gate, é preciso disponibilizar um engine MySQL de testes autorizado;
qualquer instalação/recurso novo deve ser aprovado antes. O fixture continua
identificado como sintético, sem alegação de validação SQL em engine real.

## O que foi implementado

- Receiver em bytes com Basic estrito, limites de corpo/batch, sender permitido,
  telefone estrito, rejeição conservadora de BSUID, vínculo e consentimento.
- Adaptador mysql2 para o pool existente, sem criar pool/DB/tabela/migração.
  Reutiliza `crewcheck_whatsapp_links`, `crewcheck_platform_profiles` e a tabela
  `crewcheck_telegram_state` já usada por outboxes internos; namespace exclusivo
  `crewcheck-infobip-inbound-v1:`. Não usa notification_jobs nem worker Telegram.
- Claim único e enqueue na mesma conexão/transação. INSERT com upsert sem mudança
  seguido de SELECT FOR UPDATE serializa o claim existente. Divergência de digest
  falha fechado. Commit incerto retorna indisponível; retry encontra o claim se
  houve commit. Não há fallback em memória nem exclusão automática de claims.
- Vínculo original WhatsApp nunca é criado/alterado pelo adaptador. Busca usa o
  mesmo HMAC de telefone existente, com chave injetada pelo futuro composition
  root. Locks da linha de vínculo, perfil e autorização Infobip são mantidos nas
  fases críticas. Timestamp/revisão mudados, revogação e consentimento retirado
  invalidam a operação.
- Exige autorização adicional Infobip, cifrada no namespace
  `crewcheck-infobip-grant-v1:`. Sem ela, nenhum job é criado. Vínculo Meta não
  implica migração/consentimento de provedor. O grant exige provider, sender,
  phoneHash, email, public_id, revisão exata do vínculo, revisão própria,
  consentConcierge=true e active=true. Não existe endpoint ou writer que crie
  grants reais nesta entrega; o futuro fluxo deve exigir conta autenticada e
  consentimento específico. Nunca inserir grant manual como substituto de prova.
- Reutiliza helper AES-256-GCM existente de installationRegistry, com AAD contendo
  versão e chave da linha. Texto, destinatário, conta e bindingStamp ficam cifrados
  no job. Chave de cifra é cópia de Buffer injetado; não se lê/envia/cria segredo.
  Claims usam namespace estável independente de rotação de credenciais. Hashes e
  digest não são alegação de anonimização; não são logados.
- Worker offline prepara resposta com conta derivada do vínculo, revalida após
  await e commita dispatching ANTES de I/O. Segunda transação revalida tudo e
  mantém locks durante uma tentativa limitada a 5s. Crash, timeout, falha de save
  ou commit depois da tentativa nunca devolvem o job para held. Sem retry
  automático para resultado incerto; perda de resposta é preferível a duplicação.
- Expiração explícita por chave limpa conteúdo cifrado sem apagar tombstone.
  Resultados finalizados/cancelados também removem conteúdo. Não há timer/scan
  registrado. Um agendador real de expiração e política de retenção ainda precisam
  de composição e revisão; payload dispatching expirado vira uncertain, sem retry.
- Builder de saída usa somente HTTPS no domínio personalizado *.api.infobip.com,
  endpoint fixo /whatsapp/1/message/text, Authorization: App e JSON com sender,
  destinatário e messageId determinístico próprios. Recusa drift no binding,
  origem/path/query/credenciais na URL, redirects e texto excessivo. Não inclui
  callback URL arbitrária, dados de conta ou fallback Meta.
- Transporte com request injetado, AbortController, deadline até 5s e resposta
  limitada a 16 KiB. Somente resposta correlacionada com PENDING_ACCEPTED é
  accepted_unconfirmed. Erros HTTP, redirecionamento, JSON inválido, ID/destinatário
  divergentes e timeout retornam código fixo uncertain; nunca ecoa erro bruto.
  Não existe default fetch/agente/rede. O teste injeta mocks, não credencial real.
- Classificador de DLR é puro: reconhece somente o exemplo entregue estrito;
  aceitação/pending não significa entrega. Atualização durável e monotônica de
  recibos ainda não está implementada; status/mistos não entram como inbound.

## Contratos oficiais consultados em 2026-10-16

[Subscription components](https://www.infobip.com/docs/subscriptions/subscription-components)
e [Authentication settings](https://www.infobip.com/docs/subscriptions/manage/authentication-settings)
confirmam Basic, HMAC e OAuth no perfil. HMAC cobre bytes brutos integrais e usa
por padrão X-Hub-Signature. As páginas consultadas não definem claramente
codificação/prefixo do valor; não se assume sha256=hex da Meta. O candidato aceita
somente Basic estrito e isso NÃO significa que Basic esteja habilitado na conta.
Nenhum método efetivo foi verificado na inspeção adicional bloqueada por CUA.
Último estado informado: perfil CrewCheck sem URL e autenticação Nenhum.

[API authentication](https://www.infobip.com/docs/essentials/api-essentials/api-authentication)
confirma Authorization: App para API key de saída. Essa chave não autentica o
webhook. Nenhuma API key foi criada, consultada ou configurada.

[Payloads WhatsApp/BSUID](https://www.infobip.com/docs/whatsapp/manage-integration/usernames-and-user-ids)
documenta results[], from/to, receivedAt, messageId e message.type/text. from pode
ser BSUID: rejeitado até haver vínculo próprio seguro. O builder segue o exemplo
oficial /whatsapp/1/message/text com from/to/content.text e messageId de correlação.
[Referência de envio](https://www.infobip.com/docs/api/channels/whatsapp/send-whatsapp-text-message)
e [status oficiais](https://www.infobip.com/docs/essentials/api-essentials/response-status-and-error-codes)
são referências de contrato; a página API dinâmica não expôs a especificação
completa na ferramenta. O parser é conservador: formatos não reconhecidos são
uncertain, nunca autorizam novo envio. Não se presume idempotência do provedor
pelo messageId escolhido.

[Reporting webhooks](https://www.infobip.com/docs/reporting/webhooks) informa
POST, retorno HTTP 200 e retry com atraso 1 min + 1 min × retryNumber², até 20
retries, último em 41h30. Depois desse período os eventos podem ser perdidos.
Esse horizonte é da documentação geral; sua aplicação exata ao inbound deste
perfil permanece não comprovada e é bloqueio de ativação. Como política candidata,
o receiver agora aceita eventos até 48h (mais 30s de tolerância futura). Respostas
continuam limitadas a 15min: evento antigo cria apenas tombstone expired, sem
reter texto ou gerar resposta. Retry autenticado antigo encontra o claim;
reenvio fora de 48h é recusado. Claims não são purgados nesta entrega.
O comportamento efetivo da assinatura, event format e response validation deve
ser confrontado com a conta antes da ativação; documentação geral não é inspeção.

[Notification profiles](https://www.infobip.com/docs/subscriptions/manage/notification-profiles)
expõe validação por regex do corpo/status, batch e timeouts configuráveis.
Não há configuração realizada. Basic exige HTTPS/TLS validado na futura borda.
A fronteira HTTP, timeout total das operações SQL e validação em engine real
continuam gates: fixture mysql2 não comprova locks, InnoDB, restart ou timeouts.

## Inspeção exata para a tarefa de navegador / Bruno

Somente visualizar; não salvar nem revelar valores de segredos:

1. Developer Tools > Subscriptions Management > Subscriptions > CrewCheck > View:
   categoria/canal WhatsApp; eventos INBOUND_MESSAGE/DELIVERY/SEEN; filtros de
   sender/resource, applicationId/entityId; grupo/prioridade; profileId associado.
2. Notification profiles > perfil associado > View: nome/profileId; Webhook URL
   (vazio ou preenchido); referência Security settings/authId e tipo; certificado
   mTLS se houver; Response body regex e Response regex; Max bucket size, Window
   size, Connect timeout, Read timeout, TLS protocols, Rate limit. Em Headers,
   mostrar só nomes e se há valores, nunca o conteúdo de Authorization/segredos.
3. Authentication settings > authId associado > View: método e nome; para HMAC,
   algoritmo, nome do header e documentação do encoding/prefixo; para Basic,
   somente se username/password existem; para OAuth, tipo/grant e presença da
   configuração, sem token/client secret. Não criar configuração nesta inspeção.
4. Channels and Numbers > WhatsApp sender > View: número vinculado, estado,
   WABA/Phone Number ID quando exibidos, inbound routing e aplicativo/entidade.
   Confirmar vínculo à WABA atual, sem migrar/criar outro cadastro.
5. Se retry/horizonte/ACK não aparecerem no perfil, obter o contrato documentado
   do suporte para esse perfil/event format. Não inventar um campo de UI de retry.

Para compatibilidade com os limites atuais do receiver, a futura configuração
revisada deverá usar batch pequeno (preferencialmente 1; limite absoluto20 e64KiB)
e response validation compatível com ACK durável. Não alterar nada agora.

## Falha legada da suíte ampla delimitada e corrigida

O teste regression-whatsapp-business-webhook reimportava v14382/v14383 depois de
writers mais novos. v14383 exige botão literal com Send, mas bids-default já moveu
os vínculos para Notificações. Além de falhar em Home, esse writer podia reinserir
um segundo binding antigo do Concierge; v14410 usa email/text/location.
A causa foi reproduzida na base2286, com arquivos idênticos ao primeiro candidato.
Correção restrita ao teste: bootstrap canônico v139; assertion exige a assinatura
atual email/text/location e exatamente um handler. Todas as outras assertions
foram preservadas. Não muda Home, Telegram runtime, guards, gates ou materializadores.
A suíte corrigida passou com requests mock e sem DB; não enfraquece proteção para
acomodar a implementação. Preparações geradas são restauradas antes do commit.

## Validação e limites

- node scripts/regression-infobip-whatsapp-candidate.mjs
- node scripts/regression-infobip-whatsapp-persistence.mjs
- node scripts/regression-whatsapp-business-webhook.mjs (faz preparo canônico)
- node scripts/regression-infobip-whatsapp-runtime.mjs (após preparo canônico)
- Regressões sender e status diagnostics na fonte preparada.

SQL adapter, criptografia e pipeline de tentativa são código real, mas as queries
foram exercitadas somente com fixture mysql2 serializável. Nenhum banco/serviço foi
criado ou consultado; nenhuma migração executada. Fixture não substitui MySQL real.
Sem listener iniciado, polling, worker real, engine real Concierge, envio, push,
PR ou deploy. O único hook acrescentado à fonte preparada permanece OFF/503.

Preservados sender/vínculo/consentimento da #890, menus/PDF #888/#926 OFF, Voice/TTS,
Home e financeiro. Grants reais, configuração/env e transportes permanecem ausentes.

## Bloqueio mínimo para ativação

1. Visualizar campos acima para comprovar sender/routing/profile/auth/format/ACK.
   Perfil sem URL/auth é bloqueio conhecido; nada foi configurado para contorná-lo.
2. Autorizar configuração específica de autenticação/URL e disponibilidade das
   chaves existentes em composition root seguro, sem reutilização indevida de
   credenciais Voice e sem presumir custo zero. Segredos nunca passam pela conversa.
3. Implementar fluxo autenticado de consentimento/grant Infobip e futura composição
   habilitada com motor canônico; validar SQL real, deadlocks, restart, commit incerto, revogação,
   account deletion, timeouts totais e limpeza de payload. Nenhuma mudança de schema
   é necessária para este desenho, mas presença/engine/permissões devem ser provadas.
4. Correlacionar DLR autenticado com outbound/sender/destinatário e estados
   monotônicos; revisar delta final antes de remover gate. Desbloquear wiring,
   deploy ou teste real somente após autorização específica de escopo/custo.
