# Seleção AeroDataBox: correção independente, sem confirmação de portão

Base da análise: main daed8971d0161767937c8bbd76f97a415d81b0e5. O adapter escolhia o primeiro item da resposta. Quando esse item pertencia a outro dia/trecho, a proteção posterior o rejeitava mesmo se outro item correspondesse exatamente ao voo autorizado. A seleção agora exige voo normalizado, origem, destino e partida programada absoluta iguais à ocorrência canônica; duplicidade exata é ambiguidade e não é resolvida por proximidade ou ordem. Não muda a URL, quantidade de consultas, chaves, configuração ou ativação de fornecedores.

Isso corrige seleção, não comprova portão de LA3622 nem corrige sozinho a ausência do campo na tela. Portão de resposta sem observação válida continua não confirmado. O portão manual vinculado permanece identificado e prioritário.

## Saúde do provedor

Resposta HTTP válida sem ocorrência única (outro voo, outro dia, duplicidade) devolve "Voo não localizado" para essa consulta, mas não marca falha do AeroDataBox. Antes, essa marcação abria a pausa global de 30 s e o provedor deixava de ser consultado para outros voos. Falha HTTP continua marcando falha e abrindo a pausa. A regressão usa `providerAvailable` e `markProvider` reais extraídos do `server.mjs`.

## Bloqueio de evidência preservado

A documentação oficial [AirLabs](https://airlabs.co/docs/flight) define `updated` como último sinal da aeronave. O [OpenAPI AeroDataBox](https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json) define `lastUpdatedUtc` como atualização de informação do voo, excluindo localização; não garante quando cada campo foi observado. Status pode mudar enquanto portão antigo é retido. `Live` não resolve essa lacuna. Nenhum desses tempos é promovido a `gate.sourceObservedAt`; recibo HTTP/cache também não é observação. A tentativa local dessa promoção foi rejeitada em revisão e removida antes de commit/envio.

## Busca somente leitura em registros existentes

Workspace explicitamente autorizado: Bruno's workspace. Serviço conferido por nome/repositório/ID: crewcheck, bmedeiros1987/crewcheck, srv-d8de30sm0tmc73drgvig. A conexão foi usada com workspaceId explícito, sem mudar sessão, serviço, conta ou permissões.

Em 21/10/2026, consulta de logs desde 03:00 UTC até 08:45 UTC filtrada por `LA3622` retornou zero entradas (`hasMore:false`). Consulta de request logs por `/api/radar-flight` no mesmo intervalo também retornou zero. Isso não prova ausência de consultas/portão nem cobertura completa de logs. Não recuperamos resposta de fornecedor para a ocorrência, nem dados do cache do celular. Nenhum segredo, documento ou dado pessoal foi extraído; nenhuma nova consulta de voo foi disparada.

## Testes e fronteira

Fixture totalmente sintética atravessa providerAeroDataBox real extraído → publicRadarPayload real → resolver do card: item correto depois do errado, outro voo/data/rota, duplicidade, portão ausente, fonte antiga, mudança de valor sem evidência não promovida e manual preservado. Workflow executa a fixture raw e preparada. Proteções de ocorrência/frescor permanecem intactas.

Notificação externa de portão permanece separada: falta produtor servidor de mudanças com evidência de campo confiável e contexto de consentimento específico. Não reutilizar o verificador de campanha BIDs para disparar portão. Sem ativação, envio real, nova permissão/credencial/infra ou alteração de Telegram/ligação/Watch.
