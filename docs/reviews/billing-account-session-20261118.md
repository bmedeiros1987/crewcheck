# Identidade da conta na cobrança

Os endpoints `/api/platform/billing/status`, `/api/platform/profile` e `/api/auth/me` exigem um JWT verificado de conta principal com o identificador do perfil atual. Um perfil ausente ou substituído encerra a leitura com `401`. Credenciais antigas cujo identificador deriva do e-mail precisam passar pelo login canônico. Indisponibilidade do banco continua retornando `503`.

Perfil, assinatura e franquia são lidos no mesmo snapshot. Uma leitura com lock compartilhado confirma a geração atual antes de liberar a resposta. O `PATCH` de perfil exige a mesma identidade e mantém o lock do perfil durante a alteração. `me` reutiliza o perfil confirmado para compor o usuário e a vigência da sessão, sem criar perfil, tabela ou token. Sessões legítimas da mesma conta continuam independentes de aparelho.

O teste em MySQL descartável cobre autorizações simultâneas, exclusão e recriação durante consultas, credenciais antigas, perfis distintos, atualização do perfil atual, expiração e indisponibilidade. Foram usados somente perfis e tokens fictícios. A composição ainda precisa ser conciliada com o trabalho de sessão do relógio na #1150.

## Escritas e efeitos

| Entrada | Proteção nesta candidata |
| --- | --- |
| Confirmação ou restauração Google Play | Perfil correspondente ao JWT antes da consulta ao Google. Escritas locais vinculadas ao perfil e ao hash da compra. Nova leitura do mesmo vínculo antes de devolver a confirmação. |
| Checkout web Asaas | Perfil correspondente ao JWT. Cliente Asaas identificado por referência própria. Cliente legado sem vínculo verificável fica pendente de conciliação. A gravação local usa o perfil sob lock, e a entrega do link exige a mesma assinatura pendente. |
| Cancelamento | Sessão da geração atual, contrato exato e checagem dentro da gravação do resultado. Google Play continua enviando ao gerenciamento da Play. |
| Exclusão de conta com assinatura | Sessão da geração atual e estado da assinatura conferidos antes da limpeza. Uma reativação observada invalida a decisão anterior de dispensar cancelamento. A limpeza não é repetida automaticamente após deadlock. |
| Concessão administrativa Unlimited | Sessão administrativa da geração atual. Autor e perfil de destino ficam protegidos pela transação. |
| Franquia de ligação via HTTP | Reserva sob o lock do perfil. Uma devolução usa a reserva do mesmo pedido, com a conta original e a competência original. O marcador é local ao processo. |

As notificações de cobrança iniciadas pelos provedores continuam com autenticação própria. RTDN Google e webhook Asaas validam evidência e reconciliação do provedor de forma independente da sessão do navegador. Nenhum código de recepção de eventos foi alterado neste recorte. O callback do Telegram ainda precisa da composição de vínculo da #1348. As rotas gerais de criação de perfil e a remoção definitiva de outros dados mantêm seus escopos de revisão separados.

HOLD permanece. A verificação de sessão e as transações locais não tornam atômicos o banco e o Asaas. Os handlers montados de criação e cancelamento ainda precisam usar admissão durável e conciliação para evitar nova solicitação do mesmo efeito em caso de timeout, concorrência ou confirmação tardia. Exclusão exige a mesma proteção e revisão dos consumidores de dados e da retenção. Sessões antigas sem identificador da geração precisam fazer login novamente se esta candidata chegar à produção. Sessões válidas da conta atual, inclusive em aparelhos diferentes, seguem válidas. O controle verifica expiração e geração do perfil. Revogação geral após logout ou troca de senha exige um mecanismo próprio.

A política de renovação, o tratamento humano de comprovantes e a configuração de produção permanecem no escopo das revisões específicas. Nenhum dado de usuário, transação de provedor ou migração real é necessário para rodar os testes.
