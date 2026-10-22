# CrewCierge: piloto de contrato conversacional, sem ativação

Base exata: main `6269b5100a5db25fbcd90696747cd95829221795` (reconfirmada após a recuperação do executor). Branch: `codex/concierge-conversation-offline-20261022`. Este incremento acrescenta somente dois módulos, uma regressão e este documento. Não cria outro chat, endpoint, conta, chave, OAuth, dependência, infraestrutura, gravação, notificação, configuração ou integração operacional.

## Entrega e limites

`conversation-pilot.mjs` reutiliza `buildDutyFacts` e, por ele, os motores canônicos existentes de jornadas e extremos publicados. O modelo não calcula jornada, financeiro, APZ ou conformidade. As ferramentas `nextDuty.read` e `schedule.read` leem somente a projeção autorizada; não executam comandos do Concierge. A resposta final é sempre um template determinístico com até uma/três programações, data, fonte declarada, revisão de conteúdo, atualização do snapshot, consulta, fuso do leitor e limites da prova. Não transfere email, chat, voo, rota, hotel, texto bruto ou escala completa ao provider.

Snapshots sem autorização, com proprietário/chat divergente, estrutura inválida, fonte desconhecida, atualização ausente/futura ou acima de 15 minutos são indisponíveis. O limite de 15 minutos é uma política conservadora deste ensaio de servidor, não prova de correspondência com a escala ativa ou regra de validade da publicação original. A medição exige o estado disponível do leitor existente; evidência incompleta bloqueia o conjunto, sem zero inventado ou recuperação parcial. Cancelled, Planned e status desconhecidos bloqueiam o ensaio até existir uma autoridade operacional conectada. A ausência de status não é apresentada como confirmação de execução. Nenhum snapshot é escrito ou reparado.

O reconhecedor local aceita variações previstas: “Quando começa minha próxima jornada?”, “q horas é a prx jornada?”, “Qual a proxma joranda?”, “mostre a escala”. Não exige um comando literal. A normalização de acentos e a pequena lista de erros não demonstram entendimento irrestrito. Perguntas fora do vocabulário retornam `null` para o host manter seus handlers existentes; um host offline futuro deve traduzir isso em limite explícito de entendimento, sem tentar rede. Datas específicas, finanças, meteo e Radar estão fora deste ensaio.

APZ/apresentação sem local pede esclarecimento entre aeroporto, hotel e van. Hotel e van nunca viram apresentação no aeroporto. Continuação (“e o horário?”, “e a apresentação no aeroporto?”) exige contexto do host com intenção, conta, sessão, revisão, hash do snapshot e expiração ainda válidos. Não há memória global ou histórico de modelo. Não avança silenciosamente para outra jornada com “e depois?”.

## Provider e contenção

`createGroqPilotProvider()` fica OFF por padrão e não lê variáveis de ambiente ou credenciais. Seu transporte opcional é apenas uma função de fixture injetada; não há implementação HTTP nem modelo real configurado. O identificador `synthetic-groq-contract` é um marcador de teste. O contrato se assemelha a uma solicitação JSON de chat, mas não foi validado contra uma API/modelo Groq.

O provider recebe exclusivamente o enum local de intenção, sem a pergunta original ou fatos de conta. Há uma única seleção, sem loop, retry ou consulta externa; limite de 512 bytes de entrada como teto conservador de tokens do protocolo ASCII, 128 de saída e deadline de 1 segundo com aborto. A resposta precisa selecionar exatamente a ferramenta esperada com argumentos vazios; ferramenta estranha, identidade escolhida pelo modelo, texto livre, erro, excesso de saída ou timeout mantêm os mesmos fatos determinísticos. Nenhum texto do modelo é entregue ao usuário.

Dados permanecem fora do contexto do modelo por construção. Indicadores conhecidos de prompt injection no snapshot são adicionalmente recusados; essa heurística não é apresentada como detector universal. A proteção principal é a projeção de datas/números e a ausência de conteúdo de fonte no provider. O host deve construir a capability por consulta, não capturar uma conta antiga em singleton.

## Integração com o CrewCierge: preparada, ainda não instalada

`createCrewciergeConversationAdapter({ legacyReply, pilot, enabled: false })` encaminha os mesmos argumentos, retorno e erros ao handler existente quando OFF, sem ler o piloto. Quando explicitamente habilitado por fixture, intenções suportadas usam o mesmo leitor; demais intenções preservam o handler legado. Isso é uma fronteira testada de composição, não uma ligação publicada no app ou Telegram.

Antes da edição foram procurados AGENTS.md (também nos ancestrais), `.agents/skills` e CODEOWNERS: ausentes neste checkout. Foram consultadas #864, #909/#910, #656, #938, #1154 e inventário de PRs abertas, incluindo #1201/#1202. Não foi encontrada PR Groq equivalente. Nenhuma branch ou arquivo desses owners foi alterado, copiado ou incorporado.

Bloqueio de composição comprovado: #1135 permanece aberta no HEAD `373b2bb28397a804802341e99f419099db885fd9`. Seu `scripts/concierge-temporal-dialogue/apply.mjs` modifica `buildTelegramConciergeReply` em server.mjs, chama `crewcheckTemporalDialogue.handle` e instala guards próprios de conta/revisão/turno. É exatamente o ponto compartilhado que uma ligação operacional usaria. Este piloto preserva esse materializador, temporal-dialogue, menu e server.mjs. O responsável deve compor a capability após a autorização já existente e manter seus guards de turno/revisão antes de qualquer entrega. `readContext` deve fornecer contexto autorizado do servidor; `isCurrent(binding)` deve confirmar conta, sessão, revisão **e hash completo** atuais, sem aceitar identidade do corpo/modelo. Não há implementação de autenticação nova aqui.

O endpoint `POST /api/telegram/concierge/ask` não é uma ferramenta read-only: o código atual pode salvar localização e despachar handlers com rede/gravação. Ele não é chamado pelo piloto. A #864 continua sendo trabalho distinto de canal OpenClaw; #909/#910 pertencem à preparação/autenticação de briefing; #656 ao regulatório; #938 a transporte; #1154 a consentimento financeiro. Segurança #1201 e MyCrewCare #1202 permanecem com seus responsáveis.

## Offline no cliente: etapa pendente, sem alegação de entrega completa

O app atual tem `askTelegramConcierge` em `client/src/pages/Home.tsx`, que faz POST em `/api/telegram/concierge/ask`; `TelegramConciergeView.ask` chama essa função. `refresh` também busca vínculo e snapshot no servidor. Portanto o fallback determinístico deste módulo de servidor **não permite conversar com o app sem rede**. Módulos Node (`node:crypto` e a ponte canônica gerada) não devem ser importados diretamente no navegador.

Próxima fatia, com coordenação do owner de Home/#1135:

1. Reutilizar `canonicalRoster.ts` e `canonicalDutyMeasurement.ts` no cliente, com um leitor puro da escala local existente. Validar a origem ativa e ownership da sessão, sem confundir escala planejada com escala ativa. `plannedRosterStore.ts` já tem snapshot por owner, captura e fingerprint; `rosterStartup.ts` possui guards de troca de conta/revisão. Sua existência não autoriza usar um snapshot planejado como ativo, nem restaurar do servidor durante uma consulta offline.
2. Ligar a resposta local à mesma tela CrewCierge antes de qualquer fetch, sem depender de IA. Fonte/data/revisão/fuso e condição de dado salvo devem acompanhar a resposta. Armazenamento indisponível ou conta divergente gera indisponível, jamais zero ou leitura da chave de outra conta. A resposta pendente deve sumir com logout/troca de sessão/escala.
3. Não tratar portão, status ou meteo salvos como ao vivo. Nenhum desses domínios está exposto neste piloto. Sem fonte atual, manter dado salvo rotulado ou indisponível segundo o contrato do domínio.
4. Executar a tela real em navegador com rede desabilitada, dados fictícios já locais, fetch/XHR/WebSocket proibidos e IA ausente. Provar paráfrases, contexto, desconhecidos, APZ ambígua, ausência/corrupção do cache, duas contas, logout e troca de escala, sem gravação cruzada. Nenhum service worker global deve ser alterado sem coordenação.

Essa validação de navegador offline não foi executada e não é substituída por bloquear `fetch` em testes Node. WhatsApp é etapa posterior e não foi conectado.

## Verificação e ativação futura

Reproduzir com Node >=22.13, sem instalar dependências novas:

```sh
node scripts/regression-conversation-pilot.mjs
node scripts/regression-concierge-journey-programs.mjs
node --check server/concierge/conversation-pilot.mjs
node --check server/concierge/conversation-provider.mjs
```

A regressão gera apenas os artefatos descartáveis da ponte canônica existente; não incluir `server/concierge/generated` no commit. As fixtures usam identidades `.example.test`, escala inventada, relógio injetado e transporte de memória. O primeiro teste negativo de proveniência foi corrigido: uma APZ explícita da perna continuava sendo prova válida apesar da fonte estimada do dia; o negativo agora remove essa prova antes de exigir indisponível. Não se mudou o motor para satisfazer um oracle incorreto.

Não executados: build/TypeScript completos (npm/compilador de projeto indisponíveis neste executor), preparação global, navegador offline, aparelho, CI remoto, autenticação real e qualidade/compatibilidade de modelo real. Os testes deste contrato não aprovam #1135 ou qualquer PR paralela. Qualquer ativação futura exige composição revisada com os owners, leitura autenticada e read-only real, cliente offline validado, política de privacidade/minimização, limites reais do modelo/transportes e autorização específica para uso de dados e chamadas. Não configurar conta/chave/secrets agora. Manter DRAFT; sem merge, deploy ou loja.
