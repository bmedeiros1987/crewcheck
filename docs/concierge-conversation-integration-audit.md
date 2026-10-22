# Auditoria concreta de ligação CrewCierge

## Referências e responsável verificável

Base desta fatia: main `6269b5100a5db25fbcd90696747cd95829221795`. #1135 é a PR aberta `fix/concierge-temporal-dialogue`, HEAD `373b2bb28397a804802341e99f419099db885fd9`, sobre `fix/canonical-asb-selected-block` `965a48c44e6e4cbc451bd86fc5d77d242f1b64ef` (#1128). O autor/responsável publicamente identificável pelo GitHub é `bmedeiros1987`. Não há outro owner pessoal ou thread identificável nos comentários retornados (lista vazia); não se inventa um nome nem se presume transferência de ownership. A instrução desta tarefa preserva o trabalho paralelo.

Foram lidos o diff da #1135 contra sua base, seu documento, materializador e módulo. A fatia dela altera 11 paths; nenhum é editado por esta continuação. O módulo duty-facts é byte-idêntico entre o main observado e seu HEAD, mas os motores canônicos não: canonicalDutyMeasurement tem 136 linhas de delta e canonicalRoster sete. Portanto empilhar não é sinônimo de importar uma base semanticamente idêntica.

## Trechos conflitantes do servidor

No HEAD fixado da #1135:

- `scripts/concierge-temporal-dialogue/apply.mjs:6–8` injeta no início de `buildTelegramConciergeReply` o `await crewcheckTemporalDialogue.handle(text, profile, snapshot)` e retorno imediato quando tratado. É o conflito textual exato de uma segunda inserção genérica no mesmo anchor.
- Linhas 9–20 instanciam o adaptador com autenticação, leituras assíncronas/síncronas, seleção canônica, renderer e Radar. Linhas 25–29 envolvem o ingresso/processador em `observe`/`run`, preservando ordem e AsyncLocalStorage. Não criar um ingresso paralelo.
- `server/concierge/temporal-dialogue.mjs:11` limita a identidade a Telegram privado, vinculado. `:45–57` admite conta/revisão/turno; `:59–70` instala `authority.validate` e `checkNow` no profile. `:72–79` consome o assunto/oferta e retorna null quando não trata a intenção; `:77` já trata `/hoje`, `/proximo` e algumas frases. `:109–115` exporta `protect`, `currentTurnCheck`, `currentDeliveryCheck` e `currentValidator`.

Uma ligação antes de `.handle` pode pular a invalidação da oferta; substituir `.handle` elimina a autoridade do owner; inserir depois e esperar interceptar `/proximo` não funciona, pois ele já retornou. Envolver a entrada inteira no nosso adapter também não cria automaticamente a autoridade temporal exigida pelo sender. Essas alternativas foram rejeitadas por análise do código, não por uma negativa de ferramenta.

## Proposta mínima do servidor para revisão pelo responsável

Preservar a chamada temporal primeiro e o seu retorno quando tratado. Para **novas paráfrases não tratadas**, inserir a capability somente na continuação `temporal === null`, dentro do `run` admitido. Antes de criar a resposta, chamar `crewcheckTemporalDialogue.protect(profile,snapshot)` e validar a autoridade. `readContext` fornece apenas o snapshot autorizado dessa admissão; `isCurrent` combina revisão/hash originais, conta/sessão, `currentTurnCheck` e o `checkNow` da mesma autoridade. O sender existente conserva sua revalidação final. A ferramenta não chama `ask`, menu, Radar, saída ou sintetizador. Depois de preservar essas invariantes, um callback de fatos/renderer opcional em `createTemporalDialogue` pode unificar também as intenções que ele já trata, sem trocar a lógica de seleção/oferta.

O canal app não deve fingir ser Telegram privado nem receber uma sessão Telegram fabricada: precisa de seu próprio host autenticado read-only, preservando a autoridade da conta. IA pode permanecer ausente em ambos; o vocabulário local já é compartilhado. Não adicionar o provider ao caminho offline.

Essa proposta contém os pontos e contratos da mudança futura, mas nenhum desses arquivos/callsites foi editado. A composition seam atual permanece OFF. Não se alega integração de canal pronta.

## Cliente: ponto sem sobreposição e dado faltante real

O diff de #1135 contra sua base não altera Home. O ponto cliente mínimo é `TelegramConciergeView.ask` em Home (raw :4966–4980), antes de `askTelegramConcierge`; o POST está em raw :1609–1621. Não é necessário editar o materializador temporal, o endpoint, o service worker ou criar outra tela para ligar `createLocalCrewcierge` ali. A implementação deve retornar a resposta local diretamente quando sem rede, inclusive `unsupported`/`unavailable`, sem fallback HTTP automático.

Foi auditada também a Home **preparada**, pois raw e shipping diferem. `loadRoster` usa `startupKey()` com owner, `ROSTER_CACHE_SCHEMA`, `!cleared` e seleção explícita; `saveRoster` grava nessa chave owner/roster/selection/choiceIntent/sourceFileName/cacheSchema, **sem capturedAt/updatedAt nesse registro por conta**. As chaves globais e sessionStorage adjacentes têm timestamps mas não a mesma prova de owner. Não emprestar a data global, não usar Date.now na leitura, não migrar silenciosamente uma escala planejada, e não chamar restoreLatestImport para suprir a consulta offline.

Mudança coordenada necessária: ao próximo salvamento/seleção explícita legítima, registrar a captura no envelope já pertencente à conta, sob o mesmo guard de sessão. Dados antigos sem essa prova continuam com atualização desconhecida e ficam indisponíveis neste leitor conservador. Isso é metadata futura de seleção, não mudança de parser ou cálculo. O módulo deste incremento aceita uma projeção em memória e não grava uma chave nova nem faz essa migração.

O host pode reutilizar `captureAuthSession().isCurrent()`, `startupOwner/startupKey` e `alertRosterOwned(bundle.roster)`; a revisão precisa abranger todo o JSON selecionado, não apenas mês ou fingerprint abreviado. Criar `sessionEpoch` opaco, invalidado com auth-changed/auth-expired/storage/troca de seleção; jamais serializar o token. Guardar a resposta/continuação somente no estado da mesma tela. Limpar ambas no lifecycle e revalidar depois de WebCrypto antes de setAnswer. `isCurrent(binding)` deve comparar o conteúdo/revisão selecionados e a sessão original, não retornar um booleano estático. O cache futuro deve informar sua captura verdadeira; o módulo já verifica idade e conteúdo.

## Empilhamento e evidência

Uma composição temporária foi criada a partir dos objetos Git do HEAD exato da #1135 e recebeu somente nossos arquivos isolados, sem criar branch, fechar PR, aplicar merge ou alterar seus materializadores. TypeScript preparado passou. A suíte do owner, executada com o argumento documentado `--materialized`, passou **357/357, zero skips**. Nosso contrato de servidor passou e o módulo real passou **40 verificações** em Chromium offline também nessa composição. Isso demonstra compatibilidade dessas fixtures, não aprovação independente de toda a base #1128, nem autorização para absorver a branch.

A primeira invocação da suíte do owner sem `--materialized` falhou no requisito explícito do harness e em um caminho não preparado do teste dependente; foi repetida corretamente seguindo o workflow, sem editar a asserção ou o owner. O empilhamento é mecanicamente possível para arquivos isolados; a ligação no anchor compartilhado e a diferença de base canônica exigem revisão conjunta. Manter nossa PR baseada em main e preservar a #1135 até essa decisão.

## Gates que continuam separados

O audit de dependências do primeiro HEAD da nossa PR falhou no DOMPurify da base; a #1201 detém sua correção e continua aberta. Nosso workflow só adiciona a regressão isolada e não substitui esse gate. Não copiar manifests nem aplicar audit fix. Sem modelo real, credenciais, dados reais, mensagens, merge, deploy ou ativação. A tela completa offline e a autoridade autenticada dos canais ainda são entregas pendentes, claramente distintas do módulo de navegador já testado.
