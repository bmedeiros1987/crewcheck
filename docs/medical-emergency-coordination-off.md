# Coordenação de emergência médica — protótipo OFF

Base observada: `397e42277fa7855a2ce257bee87465343cafd4fd`. Nenhum envio,
policy, secret, rota, migração, conta ou configuração do piloto WhatsApp é alterado.
Não há algoritmo médico, IA ou diagnóstico. O usuário escolhe a emergência médica
intencionalmente; somente essa finalidade pode usar a futura reserva separada.

## Reutilização e fronteira atual

O fluxo canônico continua em `server/v1391/emergency.mjs` e
`EmergencyCenterView.tsx`: configuração salva, seleção do tipo, localização
opcional, confirmação, resposta “Vou ajudar”, assistido/cancelado pelo titular.
Destinatários, perfil médico e localização devem vir dessas autoridades revisadas,
não de texto livre, de um modelo ou de identidade enviada pelo corpo HTTP.
O protótipo recebe apenas referências internas de uma seleção/preview já validada.
Não copia a seleção por hotel, o renderer médico ou o transporte Telegram.

Hoje o produtor legado reúne visitantes não revogados, conexões aceitas e, conforme
preferências, colegas que compartilham hotel/data. Isso não é automaticamente uma
lista de destinatários autorizados a receber WhatsApp médico. O primeiro “Vou
ajudar” legado registra o respondente e avisa o titular; não suspende chamadas
pendentes nem avisa os demais. `sendAlert` envia antes de persistir o alerta e a
confirmação do app é uma confirmação de interface. Não chamar esse endpoint ou
`sendAlert` por dentro do novo coordenador: duplicaria efeitos e não daria reserva
durável antes do envio. A extração/wiring canônica exige revisão do owner.

## Implementado, sem callsite

- `createMedicalEmergencyCoordinator()` é OFF por padrão e não toca admission,
  relógio ou repository nesse estado. Não há sender, HTTP, env ou leitura do banco.
- Quando explicitamente injetado em testes, exige admission confiável, sessão
  atual e repository transacional. Identidade, confirmação vinculada à revisão,
  consentimento WhatsApp, disponibilidade e destinatários efetivamente contatados
  vêm da admissão canônica. Request IDs devem ser derivados pelo host da identidade
  e evento originais, nunca aceitos como autorização do corpo HTTP.
- O primeiro aceite põe o alerta em `help_on_way`, suspende intenções de chamada
  ainda pendentes naquela rodada e prepara avisos ao titular e a quem já foi
  contatado. Tentativas aceitas/incertas não são desfeitas. Outros aceites são
  registrados, sem prometer exclusividade, chegada ou assistência efetiva.
- Somente o titular, com confirmação atual, pode marcar `assisted` ou `cancelled`.
  Cancelar um rascunho não prepara aviso algum. Resultado de transporte e resposta
  humana são estados diferentes; `reserved_not_sent` nunca significa entregue.
- “Pedir mais ajuda” exige confirmação atual, cooldown e limite de rodadas
  explicitamente configurados. Mantém o histórico de quem já ofereceu ajuda,
  não chama novamente essas pessoas e invalida os botões da rodada anterior.
- Efeitos têm chaves estáveis por alerta/rodada/evento/ator/destinatário. O repository
  deve persistir estado, chaves únicas, cancelamento de pendências e reserva médica
  em uma única transação durável. Exceções revertem tudo. Não há implementação SQL
  nem outbox/sender de produção nesta entrega: a suíte usa repository em memória.

## Disponibilidade e descanso

`emergencyAvailability` é uma política pura, não um cadastro ou autorização de
canal. Preferência habitual é por conta; override ON/OFF/inherit vincula-se à
ocorrência e revisão do pernoite e só vale dentro do intervalo canônico informado.
Ao expirar, volta à preferência habitual; não usa meia-noite, APZ ou horário da van
como fim presumido. Identidade, revisão ou horário inválidos bloqueiam a decisão.
Descanso e estado desconhecido são silenciosos por padrão. Receber durante descanso
exige opção explícita separada; override ON não concede essa opção. Não há mecanismo
para ultrapassar DND ou permissão do aparelho. Disponibilidade não concede WhatsApp,
dados médicos, quarto ou localização. Essa política é do destinatário; descanso do
titular não impede uma ação médica intencional. Contatos de confiança não dependem
de coincidência de hotel; não inferir a disponibilidade deles a partir da escala.

Ainda faltam os switches habituais no Concierge e visíveis na inicial/pernoite,
persistência/revogação dessas escolhas e revisão de acessibilidade. Nenhuma nova
tela é anunciada como disponível.

## Orçamento e dados

Todos os planos, mesmo com quota pessoal zero, usam o mesmo contrato médico sem
debitar créditos comuns. `reserveMedicalEffects` é obrigatoriamente separado e
deve recusar novas intenções até tarifa, reserva global e política estarem
verificadas. O teto compartilhado permanece US$20/mês para WhatsApp E voz, não
US$20 por canal. Não há valor de tarifa, franquia médica ou reserva ativada aqui.
Avisos ao titular/demais/encerramento também custam e entram nessa reserva.
Sem reserva, um novo chamado ou nova rodada fica bloqueado. Um aceite ou fechamento
local ainda pode ser registrado com `blocked_budget`, sem fingir que os demais
foram avisados. Não há retry automático, replay de resultado incerto ou bypass do
orçamento/provedor. Os números da policy da suíte são fictícios, não comerciais.

Efeitos contêm somente referências ao preview e destinatários existentes. Dados
de saúde/localização exigem opt-in e preview por ação; o quarto nunca é acrescentado.
IDs e metadata de emergência ainda são dados sensíveis de contexto: autorização,
retenção e proteção do futuro ledger/outbox precisam de revisão. A persistência
legada do texto do alerta também precisa ser avaliada antes da expansão WhatsApp.

## Cenário na rua e pendências antes de ativar

O fluxo pode receber contatos de confiança sem hotel e usar a escolha de GPS atual
do app, somente com consentimento explícito e fonte/frescor verificados. Não usar
hotel antigo ou localização em cache como posição atual. A admissão/preview dessa
escolha ainda não está ligada ao coordenador. O atalho de discador local deve ser
uma ação do usuário com número/jurisdição verificados; não foi criado nem acionado
aqui. Não inferir número pela base da escala e não fazer chamadas automáticas.

Antes de ativar: revisar a seleção pré-autorizada por canal sem recadastrar contatos,
extrair o núcleo existente sem seus envios imediatos, implementar transação/outbox
e sender com revalidação final de consentimento/disponibilidade/rodada/orçamento,
rever payload/retention e UI de preview/estados/mais ajuda, validar tarifa e hard
stop do provedor e obter autorização específica de qualquer teste real. Nunca
prometer cobertura, recebimento, equipe a caminho ou substituição do serviço local.

## Evidência

`node --test scripts/regression-medical-coordination-off.mjs` usa apenas Node nativo,
credenciais inexistentes, IDs fictícios e fetch ambiente bloqueado antes do import.
Cobre concorrência de aceites/cancelamento, duplicatas, múltiplos ajudantes,
fechamento/mais ajuda, esgotamento global, conta/sessão/consentimento/expiração,
resultado incerto, ausência de hotel e override/descanso. Não comprova SQL
distribuído, crash/restart, transporte, aparelho físico ou entrega a terceiros.

## Revisão do primeiro HEAD

As contraprovas P2 verificam confirmação no TTL total do alerta mesmo quando o
prazo do rascunho é posterior, inclusive vencimento durante a reserva, e rejeitam
override ON sem identidade/revisão presentes. Revisão numérica zero é um valor
explícito válido; ausência, booleanos, NaN e strings vazias não são autoridade.
Também foi reproduzido override vencido mantendo influência depois de checkout
ou nova seleção: o registro válido expirado agora volta à preferência habitual
mesmo sem o pernoite anterior carregado. Cancelar um rascunho não depende de ledger
de entregas inexistentes e continua sem reserva/avisos. A suíte final tem 17 grupos,
com contraprovas RED antes e GREEN após as correções, sempre sem rede real.
