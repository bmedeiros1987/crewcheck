# Proteção de eventos do proxy Calendar — revisão independente

Base: main `500fb1c33370689b6c05a49c1d594a0df0b5bb35`. Correção isolada; sem merge/deploy ou ativação OAuth. Nenhum evento, token, credencial ou banco real foi consultado. Não há evidência de acesso a outra conta ou de incidente: o defeito confirmado é a ausência de autorização por evento no proxy.

## Contrato implementado

Antes, PATCH/DELETE encaminhavam um eventId fornecido pelo cliente com o token da identidade autenticada, sem comprovar que o evento havia sido criado pelo CrewCheck. Propriedade privada, título e `#CREWCHECK` não são provas suficientes.

Agora, POST somente na coleção principal cria um ID aleatório no servidor, ignora ID/iCalUID fornecidos e grava `crewcheckServerProof`. A assinatura HMAC SHA-256 usa o segredo de criptografia já existente, com separação de domínio, e vincula identidade CrewCheck, autorização Google (refresh token), calendário, ID e contexto de exportação (período/chave). O token não é gravado no evento nem retornado: somente a assinatura. O período/chave descreve a exportação criada em uma sessão autorizada; não é prova de correção do parser nem de titularidade de uma escala arbitrária.

PATCH/DELETE fazem GET canônico do evento no Google, com o token desta identidade. Exigem ID correspondente, contexto/prova válidos, evento não cancelado e etag válido. PATCH preserva a prova e não permite trocar ID/iCalUID/período/chave. Marca enviada no PATCH não autoriza um evento pessoal. O header `If-Match` vincula a alteração à versão verificada. Não há retry automático de alteração no servidor; 401/403/412 retornam erro. Parâmetros de mutação são restritos a `sendUpdates=none`; GET continua com a allowlist anterior.

Um access token antigo sem atestação de grant é renovado pelo endpoint de tokens antes da primeira mutação; os tokens já renovados mantêm a atestação na store criptografada. Isso evita assinar com um grant e executar com um access token de outra conta. O callback não reutiliza refresh token antigo quando uma nova troca de código não fornece um: rejeita a nova conexão e mantém a antiga intacta. Não foi solicitado escopo novo nem alterada configuração OAuth.

O contrato de concorrência segue a [documentação oficial do Google para modificações condicionais](https://developers.google.com/workspace/calendar/api/guides/version-resources): mudança entre leitura e escrita resulta em 412. Na corrida **antes** da leitura/prova são zero chamadas de mutação; na corrida **após** a leitura é uma tentativa condicional, zero alterações aplicadas. Nenhum cliente pode garantir zero requisições de escrita em uma corrida posterior à checagem; a garantia é a precondição atômica no provedor.

## Compatibilidade e legados

- Eventos novos criados pelo proxy continuam aceitando PATCH/DELETE na mesma identidade/autorização/contexto. Renovação normal de access token preserva a prova. A sincronização atual que apaga/recria reconhece os mesmos marcadores privados; as novas criações recebem a prova automaticamente, sem alteração de frontend.
- Eventos anteriores, importados por ICS, criados pelo fallback direto do navegador ou com marca perdida/adulterada não possuem prova. Retornam 409 `GOOGLE_EVENT_PROVENANCE_REQUIRED`, com mensagem explícita de preservação. Não são adotados, apagados ou recriados automaticamente.
- O fluxo atual aborta ao encontrar esse 409 **antes da fase de criação**, evitando duplicação deliberada dos legados. A fase de exclusão não é transacional: eventos novos já autorizados podem ter sido excluídos antes de um legado bloquear o restante. Uma futura sincronização deve planejar e validar o lote antes de gravar.
- Reconexão com refresh token diferente (mesmo que da mesma conta) ou rotação do segredo invalida a prova anterior. Esses eventos passam a protegidos/ambíguos; não existe migração silenciosa. Uma migração futura precisa de fonte/recibo confiável e uma operação explicitamente revisada, sem adotar por nome/texto/marca privada. Se a troca de código não fornece refresh token, a conexão nova é recusada com a mensagem existente; não mistura contas.
- A proteção é do proxy servidor. O fallback GIS que chama o Google diretamente não recebe assinatura e não passa por este guard; revisar esse caminho é tarefa separada. Não há garantia de idempotência global ou sincronização completa nesta correção.
- Exigir sessão real também em modo local auth-optional é intencional para mutações; não há owner anônimo autorizado.

## Validação offline

`node scripts/regression-calendar-event-provenance.mjs` passou em Node 24.19.0 na fonte raw e numa cópia após `env -i ... node scripts/v139/apply.mjs` (preparação exit 0). Os dois módulos do servidor permaneceram byte a byte iguais após o preparo; o server preparado registrou a rota com `cc1371Verify(cc1371RequestToken(req))`. Sintaxe dos módulos e `git diff --check` passaram. Nenhuma dependência nova; build/typecheck geral ficam também no CI existente. Workflow dedicado executa o mesmo teste raw/preparado em Node 22, sem secrets/instalação/banco.

Testes pela rota real do módulo, com store criptografada **sintética**, ambiente substituído e fetch inteiramente mockado: criação autenticada com ID/prova do servidor, PATCH/DELETE positivos, preservação de contexto; pessoais com texto livre, legados privados, prova forjada (ASCII/Unicode), cópia da prova em outro ID, outra identidade, outro grant, marca forjada no request, inexistente, GET 401/403/500/erro de rede/JSON inválido, etag ausente, contexto alterado, cancelado, query que omite prova, sessão ausente e PATCH que tenta remover/trocar prova → zero chamadas de mutação de eventos. Corrida pós-GET e escrita 401/403 → zero alterações aplicadas e nenhuma repetição. Refresh normal, atestação do grant, falha de refresh e callback sem refresh token também cobertos.

## Coordenação das frentes existentes

Leituras das PRs abertas confirmaram sobreposição direta em `server/v1405/google-calendar-oauth.mjs` com #871, HEAD `081e27ccd0e9c5ff882ea05cccfd263b97100a2f`, e sua filha #873, HEAD `45201207bf0d5aa42fa4a3bbc27894fc8475de08` (base #871). Esta correção não incorpora nenhuma delas. #871 precisa portar este guard para o calendário canônico validado, e retirar sua adoção/remoção automática de legados sem prova; owner do calendário não prova origem do evento. #873 precisa de um contrato de domínio autenticado/provável para wellness e da mesma defesa antes de PATCH/DELETE. Resolver o conflito preservando esses invariantes, nunca escolhendo apenas um dos lados.

#859 (login Google futuro) altera identidade OIDC/auth/registro no preparador, não este proxy; fica separada do consentimento Calendar. #969 também altera o preparador, que esta PR não modifica. #824/#836 tratam Watch/CrewLife sem este proxy. #987/#988/#951/#965/#975 não foram alteradas. Não foram encontrados AGENTS.md ou skills locais no workspace/repo selecionados; as instruções da delegação governaram este trabalho.

## Lacunas registradas, sem implementação adicional

A cadeia `scripts/v139/apply.mjs` chama v1402/v1405/compatibility/idempotency e força primary no frontend preparado. O arquivo servidor é um módulo mantido diretamente; o preparador apenas registra sua rota, não reescreve o guard. Não foi necessário mudar os patchers.

O fluxo `syncRosterToGoogleCalendar` gera ICS e propriedades privadas, lista candidatos em janela temporal, exclui e cria todos novamente (`updated: 0`); sua chave atual inclui horário/título e não sustenta upsert por identidade estável. Não há plano de diff/lote nem cancelamento auditável. O exportador atual fixa America/Sao_Paulo nos horários; o parsing de ICS com `Z` não tem tratamento UTC explícito. Pernoites são dias inteiros e usam `day.hotel` na descrição/título, sem verificar proveniência de hotel confirmado neste produtor; não há localização estruturada nem atualização específica de hotel. As novas criações existentes não enviam conferenceData, attendees ou pedido de Meet; esta PR não introduz Meet nem sincronização de hotel.

Para uma frente posterior: revisar upsert/diff da #871 com identidade estável canônica e guard de servidor; planejar lote antes de gravar; resolver legados por estratégia confiável explícita; validar UTC/fuso por aeroporto, overnight/carry-over, cancelamento e duplicatas; projetar apenas hotel confirmado com proveniência, mantendo ausência explícita; testes de não criação de Meet/convites; depois E2E separado e autorizado. Login Google futuro continua separado. Nenhuma nova frente, scope, configuração ou teste real foi iniciado.
