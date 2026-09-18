# Piloto de conta real — restrito, não é lançamento

Backend preparado somente na branch #698, sem merge em main. Usar o serviço preview já existente; não criar infraestrutura adicional. O hash de uma única conta e a origem autorizada são configurados no Render, nunca no repositório. O código reavalia a autorização ao aprovar, emitir credencial, autorizar, listar e revogar.

Configuração do preview autorizado: CREWCHECK_TV_ENABLED=true; CREWCHECK_TV_PILOT_ACCOUNT_SHA256=<SHA-256 do e-mail autenticado normalizado>; CREWCHECK_TV_PILOT_ORIGIN=<origem HTTPS exata, sem barra final>; VITE_CREWCHECK_TV_ENABLED=true. CREWCHECK_TV_PILOT_BOOTSTRAP=true só funciona com IS_PULL_REQUEST=true.

O bootstrap explicitamente autorizado compila o projetor canônico já preparado e inicializa crewcheck_tv_pilot_registry com CREATE IF NOT EXISTS/INSERT IGNORE. Não escreve na escala, contas ou registry TV genérico. Erros de banco/compilação fecham o acesso. A tabela isolada é necessária pois previews Render podem herdar o banco de produção.

GET /api/tv/status responde somente prontidão/versão/tipo de piloto, nunca conta/escala/segredos. A emissão inicial de código não entrega dados; somente a conta permitida pode aprovar no celular. Recompilar a TV para a origem exata do piloto, sem demo, ID separado .pilot. Credencial só em memória, até 24h; cache offline máximo 15min. Reiniciar pode exigir novo vínculo. Não afirmar revogação instantânea offline.

Validação: CI de núcleo TV, policy/service, MySQL real isolado (concorrência, rollback, consumo único, revogação); deploy do SHA esperado; login da conta real no dispositivo do usuário; comparação celular/TV; revogação. Login Google pode depender do domínio/callback e não é validado por testes de senha. Revisões ambíguas da escala são recusadas. Notícias/clima/saída/portão continuam indisponíveis até providers reais; sem fallback fictício.

Não mesclar/liberar para outros usuários nem marcar LG Store aprovada. #530/#607 permanecem vigentes. O piloto só está vinculado depois da autorização e comparação da escala real. IPK e HTTP 200 não provam o vínculo.

Rollback: desligar CREWCHECK_TV_ENABLED e VITE_CREWCHECK_TV_ENABLED apenas no preview, sem substituir as demais variáveis. Não excluir tabela, conta ou escala automaticamente. Tokens deixam de obter dados; cache respeita a janela offline.
