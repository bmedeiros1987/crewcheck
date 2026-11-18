# Identidade da conta nas leituras de cobrança

Os endpoints `/api/platform/billing/status`, `/api/platform/profile` e `/api/auth/me` exigem um JWT verificado de conta principal com o identificador do perfil atual. Um perfil ausente ou substituído encerra a leitura com `401`. Credenciais antigas cujo identificador deriva do e-mail precisam passar pelo login canônico. Indisponibilidade do banco continua retornando `503`.

Perfil, assinatura e franquia são lidos no mesmo snapshot. Uma leitura com lock compartilhado confirma a geração atual antes de liberar a resposta. O `PATCH` de perfil exige a mesma identidade e mantém o lock do perfil durante a alteração. `me` reutiliza o perfil confirmado para compor o usuário e a vigência da sessão, sem criar perfil, tabela ou token. Sessões legítimas da mesma conta continuam independentes de aparelho.

O teste em MySQL descartável cobre autorizações simultâneas, exclusão e recriação durante consultas, credenciais antigas, perfis distintos, atualização do perfil atual, expiração e indisponibilidade. Foram usados somente perfis e tokens fictícios. A revisão ainda precisa tratar a admissão das operações de escrita de cobrança, que usam o fluxo separado, e conciliar a entrega com o trabalho de sessão do relógio na #1150. Esta alteração não é um mecanismo de revogação geral de tokens.
