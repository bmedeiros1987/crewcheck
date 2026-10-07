# Concierge: Meu pernoite e histórico compacto

## Esta entrega

- `🏨 Hotéis`, `/hoteis` e `Meu pernoite` abrem um menu curto, em vez da lista de doze hospedagens com quartos.
- `Histórico de pernoites` e `Pernoites registrados` consultam cinco registros por página, ordenados pela data civil salva. O resumo mostra data, hotel e aeroporto. Não consulta nem descriptografa quarto e não mistura apresentação com saída do hotel.
- `Informar hotel` e `Adicionar quarto` explicam os controles existentes no app, incluindo a seleção da estadia e o botão Salvar hotel. A mensagem informa explicitamente que o cadastro por conversa ainda não está disponível. Não há botão sem implementação nem URL de navegação inventada.
- A mesma resposta textual pode ser usada pelo Concierge no app, Telegram e WhatsApp. O histórico requer app autenticado ou conta vinculada em canal privado. No Telegram, o tipo de conversa vem do transporte, não do texto ou de um snapshot antigo.
- A referência usada numa pesquisa de farmácia/hospital continua separada do registro de hospedagem. Nenhum hotel, quarto, localização, alarme, opt-in ou compartilhamento é alterado.

## Limite importante

Esta etapa **não** confirma qual pernoite está ativo no chat. Um registro antigo ou uma data próxima de hoje não prova presença. O seletor legado do servidor pode preencher horários ausentes e não deve autorizar cadastro de quarto. A apresentação atual/próxima e o registro rápido exigem o contrato de integração abaixo.

## Integração seguinte, sob o owner de Pernoite

Issue #823 preserva o ownership Mobile Core da composição/lifecycle. A PR #872 possui o trabalho Wake/MyCrewCare; este menu não modifica essa trilha.

1. Consumir uma projeção do motor canônico existente com revisão da escala, eventId, data civil, aeroporto e limites temporais explícitos. Mostrar apenas eventos já classificados como stay; nunca promover journey-rest nem adivinhar horários.
2. O owner resolve separadamente o ID persistido da estadia. eventId não é stayId. Data isolada, hotel conhecido e proximidade temporal não são provas suficientes quando existem candidatos conflitantes.
3. Entregar ao Concierge um contexto vinculado a conta + revisão + stayId, com expiração/invalidação após nova escala, troca de conta e mudança de estadia. Ambiguidade pede escolha; nenhuma estadia histórica vira a atual por fallback.
4. Permitir atualização parcial desse ID via serviço existente, preservando flags de compartilhamento e campos não enviados. Exigir concorrência otimista/idempotência; a API atual não deve ser invocada cegamente porque valores de compartilhamento omitidos podem virar false.
5. Coletar somente hotel ausente e, opcionalmente, quarto. Um novo pernoite começa sem quarto, mesmo no mesmo hotel. Não copiar quartos históricos nem dados de exemplos. Não persistir texto de quarto em preferências de conversa, logs, cards coletivos ou notificações.
6. Salvar somente os dados que o usuário forneceu explicitamente para a estadia confirmada, com a criptografia privada já existente. Cancelar não altera nada. Referência geográfica para pesquisa nunca realiza essa gravação.

## Aceite da integração seguinte

- Pernoite atual ou próximo escolhido pelo mesmo motor do app, incluindo virada de dia/fuso, limites iguais ao instante atual e janelas sobrepostas.
- Mesma data com dois pernoites, mesma rede de hotel em cidades diferentes, hotel desconhecido, nova escala e registro legado sem identidade falham de forma conservadora.
- Conta/canal isolados; grupo Telegram não consulta quarto nem histórico privado.
- Troca de conta/escala enquanto a resposta ou gravação está em andamento invalida o contexto.
- Repetição da mensagem não cria dois registros; falha de rede não confirma gravação que não aconteceu.
- Hotel novo não recebe quarto anterior; ausência de quarto não apaga inadvertidamente outro campo; flags existentes permanecem iguais.
- Apresentação publicada, APZ e pickup continuam separados. Nenhum alarme, opt-in ou mensagem paga é criado.

## Validação desta etapa

`node scripts/regression-concierge-stay-menu.mjs` cobre aliases, três canais, guardas privados, paginação, datas civis em três fusos, ausência de leitura/gravação de quarto, falha do banco sem sucesso falso, handoff honesto e aplicação idempotente no código real dos handlers.

O workflow dedicado também executa preparação completa, sintaxe, regressões de farmácia/emergência/linguagem, TypeScript e Vite. Passar o teste focado em fontes parciais não substitui esses gates nem um smoke test no serviço implantado.
