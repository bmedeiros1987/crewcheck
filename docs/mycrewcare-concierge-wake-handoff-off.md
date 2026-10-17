# MyCrewCare → Concierge e Wake: handoff de contrato, OFF

Revisão 2026-10-15. Main revalidada em 2286c88ffed330246f1c39bed5ad7bb4d64e7851. Esta continuação está na branch existente test/mycrewcare-sso-contract-inactive-20261015, anterior head 7124ebe40245746d96e29a2319626ebc83d555f6/base 6bb888447020e10b71723acb0dad3b96680f4e8a. Os módulos shared/myCrewCareLogistics.mjs, myCrewCarePersistentSession.mjs e myCrewCareObservedContract.mjs são idênticos entre aquela base e main revalidada. Testes da fronteira também executados no checkout literal do main atual.

Ownership: #1035 Claude, head74f5159d/base0624e99c, draft diagnóstico, allowlist intacta; #1027 head0624e99c, draft preview OFF. Android/Wake: owner01a1413f-ee74-7649-a537-711f199dd038, conforme delegação; não verificada a sessão ao vivo, não alterado Android. Financeiro/visual: #1055 cb32199a e #1054 77fb975d, drafts independentes; nenhum arquivo dessas frentes alterado. Este documento é handoff ao coordenador/owner Android, não afirma entrega de mensagem externa ao owner.

## Reusar o caminho existente

Observação nativa/DOM → validação de perfil antes/depois e mesma tentativa → cleanup confirmado → preview de reserva OFF. A observação atual retorna operationalImportAllowed:false e timeZone:null. Não transformá-la diretamente em fato operacional ou alarme.

Quando houver aquisição validada e associação revisada, reusar createMyCrewCarePersistentSession/controller e reconcileMyCrewCareLogistics, nunca criar fetch/login/SSO paralelo. O reconciliador exige contexto accountId/rosterId/rosterRevision/providerSubject e pernoite persistido, único, com pairingId, aeroporto, intervalo e fuso válidos. Seletores hotel/pickup só recebem facts do contexto já validado pelo controller: isoladamente não conferem a conta fornecida pelo consumidor; não passar arrays mescladas de contas.

Navegação existente preserva somente stayId/data/aeroporto em memória e retorno ao Pernoite. Não transportar hotel, quarto, reserva, credenciais ou payload privado pelo contexto de navegação. O consumidor resolve o pernoite explicitamente vinculado, não o primeiro hotel da lista nem apenas cidade/aeroporto.

## Campos e comunicação de incerteza

- Fonte: source=mycrewcare; observedAt é instante da leitura, NÃO horário de atualização no provedor. Mostrar “consultado em …”, não “atualizado no provedor em …”, salvo metadado separado comprovado.
- Pickup: pickupAt é instante UTC reconciliado; timeZone é IANA do pernoite validado. Mostrar data/hora no fuso do pernoite, inclusive mudança de dia; nunca inferir pelo fuso do aparelho. Hora de parede sem fuso continua não validada.
- Hotel: hotelName/endereço/telefone opcionais; o fato hotel atual não carrega timeZone próprio. Obter fuso somente do mesmo pernoite validado, sem assumir pelo nome do hotel.
- Local de pickup: pickupLocation não vazio não significa automaticamente “hall”. Confirmar semântica da fonte; não converter ônibus/terminal ou pickup de chegada em saída do hall.
- Estado: cancelled não é candidato ativo; changed deve permanecer visível e exigir revisão do horário; published é publicação, não garantia de reserva confirmada. Planned/estado desconhecido da observação não é normalizado a published pela integração.
- Ausência: emptyConfirmed significa consulta válida sem registros; timeout/erro/login bloqueado não significa “sem reserva”. Usar mensagens distintas: “Nenhum pickup nessa consulta”, “Não foi possível consultar”, “Horário sem fuso validado” e “Consulta anterior — conferir antes de usar”. Não inventar hotel, duração, telefone, localização ou horário.
- Frescor existente: até15min fresh, depois cached; acima7dias indisponível. Isso é limite técnico do cache, NÃO autorização para agendar Wake com dado antigo. Não decidir aqui novo prazo operacional. Na ausência de política aprovada, horário cached/changed/revisão divergente exige conferência explícita, sem agendamento automático.

## Contrato com o owner de Wake

A regra solicitada é sugestão editável, não alteração de APZ, apresentação ou compliance: horário sugerido = hall validado menos90min com café; menos60min sem café. Café não informado não equivale a “sem café”: pedir escolha/edição. Offset e hora final são editáveis; tocar no horário do card abre o editor existente, com teclado/foco/rótulo acessível. Não criar outro editor ou scheduler nesta frente.

O binding do rascunho precisa identificar conta, sessão, pernoite, revisão e fingerprint do pickup. Guardar a origem da hora (sugestão versus edição manual) e o fuso explicitamente. Se usuário editar a hora, atualização de pickup nunca sobrescreve silenciosamente: mostrar divergência e pedir revisão. Se trocar conta/pernoite/revisão, cancelar/logout, retirar pickup ou alterar status para cancelled, invalidar a sugestão pendente. Não afirmar cancelamento de alarme já instalado sem ACK do scheduler existente; essa semântica pertence ao owner Android.

Exemplo puramente sintético: hall05:00 em America/Fortaleza → sugestão03:30 com café,04:00 sem café. Hall00:30 →23:00 do dia anterior com café ou23:30 sem café. Converter primeiro o hall validado para instante; subtrair duração e apresentar no mesmo fuso. Não fazer aritmética de string HH:mm nem reutilizar data do hall sem conferir virada de dia. DST ambíguo/inexistente deve permanecer bloqueado.

Confirmar/salvar o rascunho não é prova de entrega/disparo. Scheduler nativo, permissões, execução em segundo plano, reboot, DST, áudio, confirmação/cancelamento e tela física pertencem ao owner Android. Nenhum agendamento real ou alteração Android feito aqui.

## Evidência e próximos testes

Nova regressão executa os módulos existentes, sem mocks do reconciliador: scripts/regression-mycrewcare-consumer-boundary.mjs. Sete testes Node em UTC, America/Sao_Paulo e Pacific/Auckland: fonte/instante/fuso; nulos opcionais sem invenção; conta/revisão/pernoite inválidos; conflito/duplicidade; pairing/data/intervalo/direção/status; cancelled/changed; fresh/cached/expired; vazio confirmado; timestamp futuro; DST repetido/inexistente. Não testa UI, conexão SSO, alarme ou conta real.

Próximo teste offline possível, com o owner: injetar facts sintéticos no consumidor existente sem rede e exercitar card→editor→rascunho, café sim/não/não informado, offsets editados, hora manual, virada do dia, revisão concorrente, cancelled, troca de conta e cleanup tardio. Verificar que nada chama o scheduler até confirmação explícita e que o ACK distingue “rascunho”, “agendado” e “falhou”. Esta frente entrega contrato/teste da fonte; não altera o consumidor Android em paralelo.

## Bloqueios restantes exatos

1. SSO permanece bloqueado no app: contrato completo IdP/tenant/subrecursos e identificador do parceiro ausentes; tratamento seguro do retorno opaco ainda exige revisão. Reusar docs/mycrewcare-sso-contract-inactive.md e patch fixture desconectado. Não ler/copiar tokens nem converter POST ACS em GET.
2. Ensaio WebView sintético real POST→302→GET não executado: ambiente sem emulator/system-image e adb falha em diretório home read-only. Compilação não prova WebView. Precisa ambiente Android descartável funcional, sem contas reais; somente loopback e payload literal sintético.
3. Associação entre observação de reserva e pernoite persistido/fuso/ciclo operacional ainda não provada. O reconciliador atual requer registro to_airport válido para emitir ambos os fatos; hotel isolado sem pickup não é suportado por esse caminho. Não inventar pickup para liberar hotel. Evolução desse caso exige contrato/testes no mesmo reconciliador, após definir associação segura.
4. Consulta física própria ainda precisa provar perfil correto antes/depois, mesma sessão/contexto, hotel/pickup/status, continuidade e limpeza. Nenhuma conexão real ou sincronização contínua comprovada.
5. Critério de frescor operacional para Wake e UX de revisão/edição ainda precisam implementação/revisão pelo owner; 15min/7dias do cache não resolvem isso. Sem credenciais novas, persistência de login, permissões, envios, release/lojas ou ativação.

Resultados adicionais em checkout literal main2286c88: nova bateria+v3+controller 72/72 PASS, tanto raw como após node scripts/v139/apply.mjs; regressão de navegação Pernoite/Wake/Concierge PASS após preparação; auditor de ownership no main PASS, changed:[]. O primeiro ensaio controller não iniciou por typescript ausente; repetição usou node_modules já instalado localmente, sem download, e passou. A regressão de navegação exige preparação e falhou no raw; passou no preparado. A primeira auditoria usou origin/main obsoleto e foi rejeitada; após atualização read-only de origin/main, a auditoria do main passou. Esses resultados são locais e não validam a allowlist histórica do auditor para os novos arquivos de teste/documentação desta branch. Nenhum gate foi enfraquecido. Compilação Android/WebView, UI visual, alarme real e CI novo não foram executados nesta continuação.
