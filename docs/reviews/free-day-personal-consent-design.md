# Consentimento pessoal e ativação restrita — desenho para revisão

Estado: draft com UI/API de autorização pessoal implementadas; oferta desligada por padrão, sem ativação de despacho, concessão em produção ou envios.
Base: main 2f6a0265ec927c62748c1615150526309d404ade. PR977 permanece inerte.

## Fluxo publicado confirmado

Alertas → Início de folga → Revisar duas publicações e consentimento para alertas
→ Fila simulada da revisão salva. Alternativa: Menu → Planejado x atual → mesma seção.
A sessão deve estar vinculada à escala da própria conta. A seção da fila exige
revisão salva e autorização de preparação vigente; o destino aparece somente
quando os dois registros existentes do vínculo Telegram são validados no servidor.
Sem vínculo válido aparece “Nenhum destino existente validado”.

`FreeDaySourceQueue.tsx` contém checkbox literal `disabled checked={false}`.
Não há ação/API publicada que registre consentimento real. Salvar revisão,
atualizar vínculo e simular transporte não concedem esse consentimento.
O rótulo atual pode incluir o username já vinculado e os últimos quatro dígitos;
a proposta abaixo reduz a apresentação a canal e destino mascarado.

## Etapas distintas e critério de avanço

1. Implementar e revisar a UI e API de consentimento separadas da preparação.
   Publicar inicialmente indisponíveis: nenhuma conta autorizada e entrega real
   desligada. Implementação publicada não equivale a consentimento pessoal.
2. Após revisão independente e CI terminal verde, identificar somente o ID público
   imutável da conta autenticada confirmada pelo titular. Nenhum nome, email ou
   chatId será usado para adivinhar a conta ou preencher a allowlist.
3. Configurar explicitamente uma allowlist contendo apenas esse ID confirmado,
   para oferecer o consentimento nessa conta. A entrega continua desligada.
4. O titular autentica-se, confere o destino mascarado e realiza pessoalmente a
   confirmação. Administrador/agente não pode confirmar pelo titular.
5. Somente após revisão e autorização específica da entrega, habilitar uma
   capacidade de despacho restrita à mesma conta. A chave global isoladamente
   jamais autoriza qualquer conta, nem libera o backlog.

Esta PR implementa UI/API da etapa 1. Não altera configuração Render,
não preenche allowlist, não identifica titular, não coleta novas credenciais.

## Contrato proposto da UI/API

Uma nova API autenticada de capacidade retorna `available:false` por padrão,
motivo e destino mascarado quando verificável. GET é estritamente leitura: nunca
cria consentimento, altera status da fila ou inicia transporte. A UI apresenta
“Envio real indisponível nesta conta” enquanto a capacidade estiver desabilitada.
Não instruir o usuário a clicar em um controle indisponível.

Quando explicitamente habilitada para a conta confirmada, apresentar checkbox
desmarcado e botão “Confirmar autorização de avisos neste destino”. Texto futuro:
“Conferi o destino Telegram da minha conta. Autorizo por 30 dias avisos de
postergação segundo estas duas publicações que enviei. Entendo que a origem
oficial e o direito à indenização não foram verificados.”

Destino pessoal: “Telegram da sua conta · chat ••••1234”. Destino coletivo:
“Telegram coletivo vinculado · chat ••••1234”, com confirmação específica do
caráter coletivo. Sem username, chatId completo ou dados dos PDFs na resposta
da API, logs, evidências e pacote de revisão.

POST de concessão deve exigir ação explícita e versão do texto, revisão corrente,
identificador opaco do contexto exibido e confirmação literal. O servidor resolve
o titular pelo JWT e perfil ativo; rejeita campos de destinatário, ownerId, valor,
consentimento administrativo ou autoridade fornecida pelo cliente.

Sob lock da própria conta, verificar ID imutável/geração do perfil, allowlist exata,
capacidade de oferta, par mínimo de recibos, confirmação de fonte, validade de
30 dias, revisão CAS e fingerprint dos dois registros existentes do vínculo.
Vincular consentimento a proprietário, geração, canal, fingerprint, par de versões,
sequência, revisão, finalidade, versão do texto e expiração. Nunca armazenar
PDF/texto integral, nome, destinatário completo ou valor presumido nesse registro.
Troca de publicação/vínculo, expiração, revogação ou recriação da conta invalidam
o consentimento e cancelam trabalhos correspondentes atomicamente.

POST de revogação deve ser idempotente, preservar isolamento da conta e impedir
que aba antiga revogue uma autorização nova. Respostas atrasadas após logout ou
troca de sessão não podem mostrar destino nem autorizar ações da próxima conta.

## Despacho futuro, separado da concessão

Conceder consentimento não transforma automaticamente `held` em `pending`.
Uma transição específica posterior deve exigir capacidade de despacho + allowlist
exata + consentimento vigente + contexto atual, sob lock, somente para o trabalho
selecionado daquela conta. Destinatário é resolvido novamente no servidor.
Antes do provider, repetir gates de conta, geração, consentimento, vínculo e fonte.
Nenhum envio em massa, liberação retroativa ou reativação de trabalho terminal.

O bloqueio atual `SOURCE_QUEUE_DISPATCH_ALLOWED=false` e o cancelamento incondicional
de `free-day:` no worker permanecem durante esta proposta. Uma implementação futura
precisa revisar ambos; mudar apenas flags/UI não cria uma entrega funcional.
Demais contas e trabalhos legados permanecem bloqueados. Aceitação do provider
não comprova entrega; usar estado `accepted_unconfirmed` até evidência distinta.
Fonte oficial continua não verificada; valor continua null até ACT/função e demais
condições financeiras verificadas separadamente.

## Validação exigida antes de publicar implementação

- Fixture sintética: conta A allowlisted, B bloqueada; defaults bloqueiam ambas;
  chave global sozinha não habilita nenhuma. Nenhum dado pessoal real nos testes.
- GET, preparação antiga, simulação e atos administrativos não concedem consentimento.
- Rejeitar destino/ownerId injetados, perfil recriado, vínculo inconsistente,
  troca de vínculo, versão antiga, fonte pendente, TTL e CAS vencidos.
- Duplicatas concorrentes e revogação/expiração mantêm atomicidade e idempotência;
  falha no registro de auditoria não deixa consentimento parcial.
- Browser: controle indisponível no estado publicado; habilitação somente para A
  em fixture; confirmação pessoal explícita; destino mascarado; logout e respostas
  tardias; nenhuma chamada externa ou pedido de Notification permission.
- MySQL isolado: transações/locks reais, conta B intacta, nenhum job liberado sem
  todos os gates; transporte exclusivamente mock até autorização específica.
- Retestar parser/raw/preparado, financeiro, isolamento e UI; revisão independente
  e CI terminal verde antes de qualquer merge de implementação.

## Referências de código publicado

`client/src/pages/Home.tsx`: navegação alerts/compare e componente compartilhado.
`client/src/components/FreeDayPostponementAlerts.tsx`: título Início de folga.
`client/src/components/FreeDaySourceConsent.tsx`: preparação e condição da fila.
`client/src/components/FreeDaySourceQueue.tsx`: controle real desabilitado.
`server/free-day-source-queue.mjs` e `server/notification-job-safety.mjs`: bloqueios.

Limite desta entrega: UI/API reviewable, ainda draft e sem despacho real. Nenhuma
instrução para consentir deve ser enviada ao titular até publicação, oferta restrita
explicitamente habilitada e disponibilidade confirmada para sua conta.

## Implementação deste draft

`/api/notifications/free-day-personal-consent` oferece GET e POST grant/revoke.
`CREWCHECK_FREE_DAY_PERSONAL_CONSENT_OFFER` exige literal `true` e
`CREWCHECK_FREE_DAY_PERSONAL_CONSENT_OWNER_IDS` exige ID público exato; defaults false/[];
nenhuma variável de produção foi alterada. Revogar continua possível quando a oferta
é desligada. O consentimento é persistido na metadata já existente do job held, com
contexto opaco ligado ao perfil/recibos/vínculo, revisão própria CAS, texto v1 e TTL
limitado pela preparação. Repetição da mesma operação é idempotente; concessão velha
não ressuscita autorização revogada. Substituição/expiração da preparação ou mudança
do vínculo cancelam jobs e removem sua metadata, incluindo autorização pessoal.
Revogação pessoal remove a autorização efetiva, preservando apenas a reserva held
para simulação e o registro mínimo de revogação; não libera/recria jobs.
Não há implementação de transição para pending ou dispatcher real neste draft.
A futura etapa de despacho deve revisar cancelamento de jobs ativos e rechecagem
imediata do consentimento antes do provider, conforme o desenho acima.

A UI está separada em `FreeDayPersonalConsent.tsx`, na seção da fila existente.
Só envia grant após checkbox e clique pessoal; sessão, revisão, bloqueio por troca
de arquivo e respostas atrasadas invalidam a confirmação local. Exibe destino
mascarado sem username. O rótulo da fila simulada legado permanece como publicado.
Testes unitários, browser e MySQL usam somente contas e vínculos sintéticos.
