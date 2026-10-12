# Identidade publicada IATA e operadora FS — delta OFF

Base main88183e93, após #1029 OFF integrada e deploy automático live.
Não ativa Cirium, não toca credenciais ou cria caminho administrativo remoto.

Calendar/AIMS07/10 comprova somente o publicado LA3443 GRU→NAT, partida
12/10/2026 00:05 America/Sao_Paulo =03:05Z, chegada03:20local.
APZ11/10 23:18 não é a partida nem a data operacional. Esses dados não
comprovam carrier FS/operadora: nenhuma conversão LA→JJ/FS por tabela local.

Fonte oficial: https://developer.cirium.com/apis/data/codeshare-and-wet-lease-relationships
e coleção https://developer.cirium.com/postman/cirium-sky-api.postman_collection.json.
A busca aceita códigos publicados; status pode devolver carrier/número operacionais
distintos. O delta adiciona capability de código explícita identityMode=published-iata,
com carrierNamespace=IATA/carrierIataCode, emitindo codeType=IATA. Default permanece
operating-fs e codeType=FS; nenhum modo é escolhido por inferência/flag HTTP/env.

Apenas appendix.airlines desta resposta pode resolver IATA publicado para FS:
exatamente uma referência IATA e uma referência FS, sem colisões/duplicatas.
O status precisa da referência operacional FS única e de igualdade exata em
rota, data local do aeroporto e instante UTC de partida. Reusa o contrato puro
físico anterior para validar tempos/status/recursos; não amplia tolerância horária.

Aceita igualdade direta comprovada (FS/número da resposta iguais à referência
resolvida/número publicado), ou codeshares.fsCode/flightNumber/relationship
comprovando a relação exata ao publicado. Relações L/Z/S/X são reconhecidas;
C só para mesmo carrier FS. Sem relação, carrier errado ou número errado =>no_data;
relação/operadora múltipla ou referências duplicadas =>ambiguous, sem escolher
por ordem. Dados inválidos falham fechados. Identidade operacional concorrente
operatingCarrierFsCode diferente da identidade da linha também é ambígua.

Resposta mantém voo publicado para o caller e expõe publishedIdentity,
operatingIdentity, operatingOccurrenceKey e identityBinding separadamente.
Chave inclui operação+UTC exato+qualificador MARKETING:IATA. Toda proveniência
de campo mantém observação conhecida e chave comum; vínculo de identidade aponta
para appendix/codeshares da resposta, sem inventar instante de observação da relação.
Não usa normalização LATAM_BR, consenso legado, snapshots/canonical ou Flex.

Fixtures FS M1/O1 e números operacionais são sintéticos, não alias LATAM real.
Testes negativos: relação ausente, colisão FS versus IATA, operadora/número diferente,
referências ambíguas, duplicação, códigos não textuais, APZ/data incorreta, rota/hora
incorretas e tentativa de mudar namespace antes de credenciais/rede. Handler real
raw/prepared prova caminho IATA→HTTPfake→binding→proveniência e zero canonical writes.
CI existente cobre três fusos e mantém todos os gates OFF/FS anteriores.

Canário segue NÃO executado. Além da revisão deste delta, falta caminho de execução
autorizado no serviço: ferramentas Render disponíveis não têm exec/SSH; CLI ausente.
sshAddress no metadata não prova acesso autenticado. Rota /api/admin/cirium-health
é diagnóstico separado e não serve para este contrato. Nenhuma nova permissão,
credencial, endpoint administrativo, browser metered ou configuração foi criada.
Plano permanece uma tentativa/maxCalls1/8s/5min e recibo sanitizado, somente por
Shell/SSH já autorizada e revisada. Orçamento por processo não é teto financeiro;
produção contínua requer orçamento/cooldown duráveis compartilhados.
