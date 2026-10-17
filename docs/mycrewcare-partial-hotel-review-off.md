# Revisão: hotel parcial sem pickup — OFF

Continuação da branch existente test/mycrewcare-sso-contract-inactive-20261015, anterior HEAD de3771d5621a73d291aafda5987f40dca0cb92c4. Main revalidada e usada na composição offline: 2286c88ffed330246f1c39bed5ad7bb4d64e7851. Base histórica da branch permanece6bb888447020e10b71723acb0dad3b96680f4e8a. Não mergear antes de revisão independente do delta.

## Delta pequeno no reconciliador existente

myCrewCareLogistics aceita uma variante explícita de registro normalizado, direction:'hotel_only'. Ela exige confirmation:'confirmed', status explícito publicado/alterado/cancelado, aeroporto e pairing, hotel e ambos os limites de reserva válidos. Os limites precisam COBRIR todo o intervalo de um único pernoite persistido da conta/revisão atual; simples sobreposição, bordas tocando ou aeroporto isolado não bastam. Identidade ambígua continua fail-closed. O fuso do pernoite continua obrigatório no registro de pernoites validado.

A variante rejeita data/hora de pickup, local de pickup, transportadora, telefone de transporte e duração não nulos, inclusive texto vazio ou duração0. Não converter ausência de hora num pickup00:00; não criar hall, fuso do hotel, duração ou agendamento. Produz somente o fato hotel já existente no schema1. O caminho to_airport preserva o contrato anterior.

confirmation é um requisito da entrada normalizada confiável, não prova criptográfica nem licença para mapear texto livre da página. Não foi criado produtor nativo/DOM desse registro. Observações atuais continuam operationalImportAllowed:false e timeZone:null, e não podem alimentar essa entrada automaticamente. A política de SSO/identidade/perfil/cleanup não muda.

O fato hotel de saída conserva status published/changed/cancelled com a semântica anterior; published não se transforma em rótulo “reserva confirmada”. Não adicionamos um booleano de confirmação ao cache nem alteramos seu schema/validador para não invalidar dados anteriores. UI que precise distinguir confirmação de reservas antigas requer um contrato de proveniência adicional revisado; não presumir que todo fato hotel antigo passou pela nova entrada hotel_only.

O cache normalizado existente já suporta um único fato hotel. Teste pela sessão real com adapter sintético e storage em memória confirma salvar/restaurar sem pickup. Um snapshot completo posterior hotel_only remove pickup anterior: não conserva silenciosamente hall antigo. Erro de consulta ainda pode preservar cache anterior segundo política existente e deve aparecer como cache/erro, não como novo snapshot parcial confirmado.

## Consumidor existente, sem edições de outros owners

Os testes importam diretamente shared/stay-edit-plan.mjs, sem alterá-lo. Exercitam reconcileStayDraft/editStayDraft: edição manual de pickup e escolha permanecem após atualização do provedor; revisão da escala exige review; troca de conta não herda campos touched/manuais. Não constroem segundo editor.

calculateStayWakeup preserva hora absoluta manual após mudar default/horário-base e calcula90/60min com virada de dia e fuso explícito. O teste usa hotel-APZ MANUAL confirmado, conforme contrato atual do consumidor, não promove pickup MyCrewCare a APZ do hotel. Esses são testes puros de cálculo: schedulingState continua not-programmed, planStayAlarm continua integration-disabled por default. Nenhuma API de scheduler ou permissão é chamada.

A sessão MyCrewCare existente também é testada com leitura pendente da contaA resolvida após bind da contaB: resposta tardia não publica hotel nem pickup. Não há SSO real, credencial, persistência de login, rede ou armazenamento de pessoa real.

Ownership preservado: #1035 Claude intacta; Home/Pernoite/Wake/Android e shared/stay-edit-plan/stay-editor-store não foram editados. O owner01a1413f-ee74-7649-a537-711f199dd038 recebe o contrato via coordenador; não alegamos contato externo nem alinhamento direto confirmado.

## Evidência local

Novo script scripts/regression-mycrewcare-partial-hotel.mjs:8 testes. Na fonte original do main2286c88:5 falhas dos cenários de hotel parcial e3 testes do consumidor existentes aprovados. Com delta:8/8 PASS. Essa contraprova foi feita em checkout separado, sem alterar branch de Claude.

Nova bateria + consumer-boundary + v3 + controller:80/80 PASS em UTC, America/Sao_Paulo e Pacific/Auckland na branch. Na composição com main atual preparado:80/80 PASS. Regressões existentes stay-edit-plan e stay-editor-persistence:28/28 PASS. git diff --check:PASS. Módulos shared não são reescritos pela preparação canônica. Logs preservados no pacote de evidências.

Nenhuma CI ou revisão independente nova foi alegada. Nenhum APK/build de loja, agendamento real, merge ou deploy. Auditor histórico de ownership tem allowlist de arquivos específica e não foi enfraquecido para acomodar esta continuação; a futura PR precisa de revisão explícita dos caminhos de testes/docs adicionados. Não apresentar CI antigo como aprovação deste delta.

## Limites que seguem bloqueados

- Aquisição SSO e POST ACS→302→GET real ainda não comprovados. Reusar o contrato SSO inativo; não converter POST em GET nem ler token.
- A futura fonte precisa provar confirmation e limites de reserva/pernoite de modo sanitizado e confiável. Hotel sem confirmação/limites completos continua ausente; isso é uma limitação conservadora desta correção.
- Não há ligação automática hotel/pickup→APZ/Wake. O próximo teste pelo owner do consumidor deve aplicar os facts revisados ao card/editor real, com ausência explícita de hall, confirmação manual e ACK do scheduler, sem chamadas reais.
- Café não informado continua diferente de “sem café”; seleção90/60 e edição ao toque são contrato de UI com o owner, não implementados aqui.

TypeScript da composição main preparada: `node node_modules/typescript/bin/tsc --noEmit` PASS, exit0 e log sem diagnósticos. A preparação canônica reaplicada preservou byte a byte os dois arquivos do reconciliador alterados. Não alterou gate de release, protocolo nativo, schema de cache ou UI.
