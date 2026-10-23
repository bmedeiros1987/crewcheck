# CrewCierge: ligação local entregue e correção temporal

Continuação da PR1203 sobre main `6269b5100a5db25fbcd90696747cd95829221795`. O HEAD22e4d7bf era o estágio isolado; esta continuação liga o cliente existente. Não cria outro chat. Sem merge/deploy, chave, conta, OAuth, dados reais, mensagens ou modelo real. Provider e canais externos continuam OFF.

## Tela existente, sem fallback HTTP offline

`TelegramConciergeView.ask` usa `useCrewciergeConversation`. Offline, termina em `crewCiergeLocal`, inclusive para indisponível, ambiguidade e intenção não compreendida. Não chama `askTelegramConcierge`, restore ou writer de cache. O refresh termina localmente e ações de vínculo/sync/import ficam indisponíveis; preview financeiro dependente de servidor não monta offline. Online conserva o transporte existente, subordinado ao guard da pergunta. Renderer de resposta e POI canônicos foram preservados.

O hook captura auth session real, owner da seleção, JSON completo, intent revision e epoch opaco. Cada pergunta tem sequência própria. Depois de WebCrypto e antes de setters, verifica sessão, seleção/cache, geração e montagem. Pergunta suspensa não sobrescreve outra. Auth-will-change/auth-changed/auth-expired, troca A→B, escolha iniciada/finalizada, seleção, captura, storage e desmontagem limpam resposta, contexto e resultados anteriores. Tokens não entram no contexto local, metadata ou provider.

## Captura verdadeira no salvamento

`saveRoster` chama `recordCrewciergeCapture` somente depois de seu salvamento. O helper acrescenta `crewCiergeCapture:{capturedAt,contentHash,revision}` ao envelope **já existente** de `startupKey()`, somente se owner/schema, seleção explícita, intent revision e JSON inteiro correspondem. Amostra o instante no começo dessa captura legítima, faz SHA256 local e revalida sessão, sequência, intent e bytes do envelope após o await, antes da escrita. Captura antiga não grava depois de A→B ou de outro save.

Não cria chave nem migra dados. Consulta, montagem e reload não chamam o helper. Cache legado sem timestamp continua desconhecido/indisponível. Não usa a data de uma chave global e não inventa Date.now na leitura. A data é captura **local**, não publicação ou atualização da empresa; a resposta mantém essa fonte e o caveat de programação salva, sem comprovar execução, repouso ou conformidade. Métodos de cálculo continuam nos motores canônicos existentes.

## Ownership comprovado antes da edição final

Inventário de PRs abertas consultado com seus arquivos e patches. Dez alteravam Home; nenhuma alterava `saveRoster`, `TelegramConciergeView` ou os materializadores roster-startup nesta fatia. A posição inicial de imports compartilhava o contexto de Radar/meteorologia; a versão final os põe no fim dos imports, fora desse bloco.

Comparação three-way em arquivos temporários: merge de main×owner comparado ao merge candidato×owner, usando o mesmo merge-base. Resultado final:

| PRs | Conflitos herdados por PR | Novos | Blocos herdados byte-idênticos |
|---|---:|---:|---|
|1200,1198,1110|0|0|sim|
|1147,891|1|0|sim|
|1032,1031,882,870,824|3|0|sim|

Nenhuma branch foi integrada ou reescrita. A primeira edição adicional foi negada automaticamente por falta de prova de ownership e não executou. A nova tentativa ocorreu **após** essa comparação; foi aceita. Um guard local inicialmente confundiu uma linha em branco com drift e parou sem gravar; o guard foi corrigido. Não houve contorno por outro canal. Os anchors legados de estilo/voz/POI foram preservados e os materializadores existentes não foram editados.

## Corrida temporal do servidor: reproduzida e corrigida

Na suíte completa, com `buildDutyFacts` e motor reais, selecionamos uma jornada cujo fim canônico é `t+10ms`. O provider avança o relógio até `t+20ms`. O estágio anterior retorna `available` com fim anterior à entrega: contraprova RED reproduzida. Não se inventa uma data; o fim vem do motor.

A correção usa intervalo semiaberto, recusa empate/sobreposição e reavalia a seleção depois de todos os awaits de provider/isCurrent. Chave inclui identidade canônica, data e extremos. Continuações exigem `selectionKey` além de conta/sessão/revisão/hash/TTL. Se ocorrência/identidade muda ou a jornada termina, pede nova consulta sem trocar silenciosamente para a seguinte. Testes reais cobrem provider lento, isCurrent lento, fim durante await, passagem de jornada na mesma revisão, empate e sobreposição. O provider recebe apenas enum de intenção; sem fatos, pergunta livre ou conta.

## Evidência de navegador e limites

`regression-crewcierge-screen-browser.mjs` compila o **TelegramConciergeView** e `saveRoster` reais, com auth, hook, captura, leitor e renderer reais. Filhos apenas visuais são fixtures. Chromium tem rede realmente desligada; fetch/XHR/WebSocket e restore são proibidos. Cobre captura por save, consulta/reload, legado sem data e sem escrita, duas perguntas concorrentes, logout no digest, A→B, troca de seleção/storage, captura suspensa em A→B e desmontagem com resposta pendente. As queries não gravam caches nem tentam HTTP. Navegação/reload recebe somente o shell compilado da memória da fixture, sem socket HTTP; não é certificação do boot/cache global do service worker nem do aparelho.

Matriz final raw/prepared nos fusos UTC, America/Sao_Paulo e Pacific/Auckland: 21 grupos de servidor por execução, 40 verificações do leitor por execução e suíte da tela real por execução. TypeScript completo, check/build canônicos e regressão canônica existentes são gates separados. O teste preparado inicialmente expôs anchor quebrado pela posição do hook e dependências visuais incompletas da fixture; ambos foram corrigidos sem remover assertions ou mudar materializadores. A CI de contrato executa as mesmas três suítes nos dois estados.

## Fronteira ainda preservada

Nenhum arquivo da #1135 foi editado ou absorvido. Seu HEAD373b2bb2/base965a48c4 continuam com a composição Telegram e sua autoridade temporal. A ligação de provider no servidor continua sem callsite e OFF; a proposta `protect/validate/checkNow` documentada na auditoria anterior permanece para coordenação. WhatsApp/áudio, login real, qualidade de modelo e aparelho não foram validados.

O audit de DOMPurify herdado da base pertence à #1201. Não copiar manifests, rodar audit fix ou afrouxar gate. Não fazer merge/deploy nesta tarefa.
