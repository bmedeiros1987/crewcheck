# CrewCierge: piloto de contrato conversacional, sem ativação

Base exata: main `6269b5100a5db25fbcd90696747cd95829221795` (reconfirmada após a recuperação do executor). Branch: `codex/concierge-conversation-offline-20261022`. Este incremento acrescenta contratos isolados de servidor/cliente, um classificador compartilhado, regressões e CI de fixtures. Não cria outro chat, endpoint, conta, chave, OAuth, dependência de aplicação, infraestrutura de produção, gravação, notificação ou integração operacional.

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

## Offline no cliente: módulo testado; ligação à tela ainda pendente

`client/src/lib/crewCiergeLocal.ts` é um leitor real de navegador, sem provider, import de servidor, rede, timer ou gravação. Reutiliza `canonicalRoster.ts`, `measureCanonicalDuty` e `publishedDutyEndpoints`. O mesmo classificador de intenção é compartilhado com o servidor em `shared/concierge-conversation-intent.mjs`. Seu host fornece `identity`, `readSnapshot(owner)` e `isCurrent(binding)` a partir da seleção local existente. O envelope de entrada é uma projeção em memória, não uma nova chave de cache: `{version:1,kind:'locally-selected-roster',owner,revision,capturedAt,roster}`. `sessionEpoch` é uma geração opaca do host, nunca o token de login. SHA256 do conteúdo é calculado pelo WebCrypto local e revalidado com conta/sessão/revisão após o await.

O módulo rotula fonte salva, captura, consulta e fuso; limita idade a sete dias e exige evidência canônica disponível. Datas completas inválidas, duplicatas de dia/perna, indicadores de injection, status não confirmado, fontes de relógio explicitamente estimadas, rollover inválido, offsets textuais e registros preservados que esta fatia não certifica ficam indisponíveis. É uma política conservadora de aceitação, sem novos cálculos ou reparos. Ausência não vira zero. Contexto de continuação vale por até dois minutos e inclui a seleção: atravessar o fim de uma jornada não troca silenciosamente para outra. Portão/status/meteo não são expostos como ao vivo.

A regressão `scripts/regression-crewcierge-local-browser.mjs` empacota o módulo real com o esbuild já existente e usa um Playwright externo de teste. Depois de carregar somente a página local de fixture, desativa a rede do Chromium, exige `navigator.onLine === false`, bloqueia fetch/XHR/WebSocket, recusa todas as gravações em Storage e verifica duas contas, dados ausentes/corruptos, contexto, APZ e mudanças de sessão/revisão. São 40 verificações por fuso. Isso prova o módulo isolado em navegador, não a tela existente completa.

O app atual tem `askTelegramConcierge` em `client/src/pages/Home.tsx`, que faz POST em `/api/telegram/concierge/ask`; `TelegramConciergeView.ask` chama essa função. `refresh` também busca vínculo e snapshot no servidor. Portanto o fallback determinístico deste módulo de servidor **não permite conversar com o app sem rede**. Módulos Node (`node:crypto` e a ponte canônica gerada) não devem ser importados diretamente no navegador.

Próxima fatia, com coordenação do owner de Home/#1135:

1. Reutilizar `canonicalRoster.ts` e `canonicalDutyMeasurement.ts` no cliente, com um leitor puro da escala local existente. Validar a origem ativa e ownership da sessão, sem confundir escala planejada com escala ativa. `plannedRosterStore.ts` já tem snapshot por owner, captura e fingerprint; `rosterStartup.ts` possui guards de troca de conta/revisão. Sua existência não autoriza usar um snapshot planejado como ativo, nem restaurar do servidor durante uma consulta offline.
2. Ligar a resposta local à mesma tela CrewCierge antes de qualquer fetch, sem depender de IA. Fonte/data/revisão/fuso e condição de dado salvo devem acompanhar a resposta. Armazenamento indisponível ou conta divergente gera indisponível, jamais zero ou leitura da chave de outra conta. A resposta pendente deve sumir com logout/troca de sessão/escala.
3. Não tratar portão, status ou meteo salvos como ao vivo. Nenhum desses domínios está exposto neste piloto. Sem fonte atual, manter dado salvo rotulado ou indisponível segundo o contrato do domínio.
4. Executar a tela real em navegador com rede desabilitada, dados fictícios já locais, fetch/XHR/WebSocket proibidos e IA ausente. Provar paráfrases, contexto, desconhecidos, APZ ambígua, ausência/corrupção do cache, duas contas, logout e troca de escala, sem gravação cruzada. Nenhum service worker global deve ser alterado sem coordenação.

A validação do módulo em navegador offline foi executada; a da tela existente sem rede permanece pendente. Bloquear apenas `fetch` em Node não a substituiria. WhatsApp é etapa posterior e não foi conectado. A auditoria com trechos, contratos ausentes e proposta de ligação está em [concierge-conversation-integration-audit.md](concierge-conversation-integration-audit.md).

## Verificação e ativação futura

Reproduzir com Node >=22.13, sem instalar dependências novas:

```sh
node scripts/regression-conversation-pilot.mjs
node scripts/regression-concierge-journey-programs.mjs
node --check server/concierge/conversation-pilot.mjs
node --check server/concierge/conversation-provider.mjs
# Playwright/Chromium já instalados, selecionados por ambiente de teste:
node scripts/regression-crewcierge-local-browser.mjs
```

A regressão gera apenas os artefatos descartáveis da ponte canônica existente; não incluir `server/concierge/generated` no commit. As fixtures usam identidades `.example.test`, escala inventada, relógio injetado e transporte de memória. O primeiro teste negativo de proveniência foi corrigido: uma APZ explícita da perna continuava sendo prova válida apesar da fonte estimada do dia; o negativo agora remove essa prova antes de exigir indisponível. Não se mudou o motor para satisfazer um oracle incorreto.

TypeScript completo nas fontes originais e preparadas e build canônico foram executados em cópia temporária. O runtime Node embutido do app recusou a assinatura do addon Rollup; o build passou com Node oficial 24.19.0, obtido em /tmp e conferido pelo SHASUMS oficial, sem alterar dependências. O executor sandbox também bloqueou leituras de arquivos; os processos identificados desta verificação foram encerrados antes da repetição com leitura normal. Alterar fontes depois da preparação reproduziu a falha herdada v1396; a cópia final é congelada antes de check/build. Nenhum materializador/gate foi alterado para contornar essas condições.

A CI do primeiro HEAD `631f80420bba5784de2d438b897e5173160e4e86` terminou com oito workflows success, um skipped e Web validation failure no audit: DOMPurify <=3.4.16, com dois achados críticos agregados incluindo o dependente jsPDF. É o pacote herdado da base, correção pertencente à #1201, que permanece aberta. Não se copiou seu fix, não se rodou audit fix e não se enfraqueceu o audit. O workflow novo executa fixtures raw/prepared em três fusos e build; o gate de segurança compartilhado continua independente e obrigatório.

Não executados: tela CrewCierge real offline, aparelho, autenticação real e qualidade/compatibilidade de modelo real. Os testes deste contrato não aprovam #1135 ou qualquer PR paralela. Qualquer ativação futura exige composição revisada com os owners, leitura autenticada e read-only real, tela offline validada, política de privacidade/minimização, limites reais do modelo/transportes e autorização específica para uso de dados e chamadas. Não configurar conta/chave/secrets agora. Manter DRAFT; sem merge, deploy ou loja.
