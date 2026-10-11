# MyCrewCare v3 — fundação persistente, isolada e local-first

Status: **DRAFT desconectado, sem ativação, login real, deploy ou publicação**.

Esta entrega prepara a base para o comportamento aprovado — conectar uma vez, conservar a sessão no aparelho quando o provedor permitir e manter hotel/pickup disponíveis com procedência e idade — sem ativar acesso ao portal corporativo antes da validação do contrato real.

## O que foi implementado

### Fatos logísticos separados

`shared/myCrewCareLogistics.mjs` representa hotel e pickup como fatos diferentes. Cada fato contém fonte, estado publicado/alterado/cancelado, `stayId`, `rosterEventId`, revisão da escala, instante de observação e fingerprint de conteúdo.

A associação exige conta, escala/revisão, aeroporto, pairing, fuso, limites temporais e uma única estadia candidata. Sobreposição, registros conflitantes ou qualquer registro válido que não encontre vínculo inequívoco fazem a sincronização falhar fechada. Esses fatos não modificam APZ, apresentação, jornada, repouso, parser, financeiro ou alarmes.

### Sessão local-first

`createMyCrewCarePersistentSession`:

- restaura o último cache válido sem declarar que a sessão está conectada;
- mantém dados verificados durante falha temporária ou ausência de rede;
- distingue `connected`, `cached`, `offline-cache`, `reconnect-required`, `ambiguous-data`, `sync-error`, `off` e `invalid-context`;
- limpa fatos anteriores somente após um vazio verificado;
- invalida callbacks quando conta, escala ou revisão mudam;
- expõe consultas separadas de hotel e pickup;
- registra alterações sem sobrescrever entrada manual nem configurar o CrewCheck Wake.

### Política de atualização

`planMyCrewCareSync` calcula quando atualizar com base na proximidade de pernoite/pickup, erro anterior e disponibilidade de rede.

Uma aquisição que dependa de tela interativa sempre resulta em `defer-to-foreground` quando o app está fechado. `background-sync` só é permitido quando existir transporte não interativo explicitamente autorizado. Esta PR não cria WorkManager nem WebView invisível.

### Isolamento Android por conta

`CrewCheckMyCrewCareProfile` usa múltiplos perfis do AndroidX WebKit. O nome do perfil é derivado do identificador interno por SHA-256, sem expor o valor original. A limpeza é limitada ao perfil escolhido e não utiliza o gerenciador global do WebView.

`CrewCheckMyCrewCareSecureStore` mantém somente o envelope normalizado em cache cifrado AES-GCM com chave do Android Keystore e vínculo criptográfico ao identificador derivado da conta. A validação usa allowlists exatas e distintas para fatos de hotel e pickup, rejeitando chaves extras, tipos inesperados, escopo divergente, horários inválidos e payloads acima dos limites. Testes Android instrumentados continuam como gate antes da ativação.

### Fronteira nativa desativada

`CrewCheckMyCrewCarePortalV3` e `CrewCheckMyCrewCareRuntimeV3` são apenas fronteiras compiláveis. `RELEASE_ENABLED` permanece `false`, `open()` retorna `false` e nada foi ligado a `Home.tsx` ou `MainActivity.java`.

O asset `mycrewcare-transport-v3.js` define um contrato estruturado e sem fallback global, mas não é executado nesta entrega. O futuro adaptador do provedor deverá ser uma proposta separada, revisada e validada fisicamente.

### Ligação à interface (desligada)

`shared/myCrewCareController.mjs` conecta a sessão por conta, o adaptador nativo e o cache cifrado a `client/src/hooks/useMyCrewCareV3.ts` e `client/src/components/mycrewcare/MyCrewCareV3Panel.tsx`.

- **Duas chaves**: `MYCREWCARE_UI_ENABLED` (constante `false`) e `RELEASE_ENABLED` nativo. Com qualquer uma desligada o painel não renderiza e a ponte nativa não é tocada.
- **Sem segundo plano**: não há timers, WorkManager nem WebView oculta. Como a sessão do provedor pode exigir SSO/MFA, somente um toque do usuário, com o app visível e online, chama o adaptador. Gatilhos automáticos (abrir o app, mudança de escala) apenas marcam `refreshSuggested`.
- **Cache restaurado não é conexão**: após reinício o painel mostra o dado salvo com idade e rótulo "dado salvo"; `connected` só ocorre após resposta autenticada e reconciliada.
- **Troca de conta**: `bind()` descarta da memória os fatos da conta anterior e uma sincronização em andamento é invalidada antes de qualquer escrita. O cache e o perfil de cada conta permanecem separados.
- **Honestidade do estado**: `refreshSuggested` só é marcado quando a política de sincronização realmente considera os dados vencidos; dado recém-atualizado nunca é rotulado como desatualizado.
- **Publicação idempotente**: o controlador publica apenas mudanças reais e mantém `getSnapshot()` estável entre renders. O painel se vincula por chave de identidade (conta + escala + revisão + estadias), não pela identidade dos props, para não reler o cache cifrado nem entrar em loop de render.
- **Restore sem corrida**: `restore()` captura conta e época antes de ler; se a conta mudar, houver logout/desconexão ou um restore mais novo, a resposta antiga é descartada antes de limpar o storage ou publicar cache.
- **Limpeza nativa assíncrona**: `startMyCrewCareCleanupV3(conta, esquecer, operação)` apenas inicia; `myCrewCareCleanupResultV3(conta, operação)` devolve `pending | ok | failed:código | unknown` somente para a mesma conta e operação. O adaptador aguarda (limite de 15 s, só durante a ação explícita do usuário) e propaga falha, desconhecido ou timeout. Nada devolve sucesso antes de concluir.
- **Nova tentativa**: em `cleanup-error` a conta continua alvo da limpeza (`cleanupPending` / `canRetryCleanup`, inclusive após logout) e o painel mostra "Tentar desconectar novamente".
- **Montagem**: o painel **não** está montado em `Home.tsx`; a fence de ownership agora também falha se qualquer arquivo fora desta fatia importar o painel. Montar exige alteração revisada da fence e de `Home`/`MainActivity` (bridge nativa).



**CrewCheck Mobile Core** é o único owner desta fundação: sessão, perfil, cache, reconciliação, sincronização e futura UI Mobile/PWA.

**CrewCheck Peripherals** deverá consumir somente snapshot normalizado para Wear OS, Watch Face e TV depois da estabilização do contrato.

**Concierge** poderá consumir apenas contexto já resolvido e privado, sem possuir sessão ou matcher paralelo.

A slice não modifica `Home.tsx`, `MainActivity.java`, `scripts/v139/apply.mjs`, servidores, integrações funcionais, parser ou regras de negócio.

## Gates antes de ativar conexão real

- autorização e contrato real de aquisição;
- prova da identidade autenticada do provedor;
- seletores e estados reais documentados, sem fallback genérico;
- SSO/MFA físico, expiração, cancelamento, troca de conta e restauração;
- persistência após fechar o app e reiniciar o aparelho;
- limpeza por conta sem afetar outras sessões;
- testes Android instrumentados de cifragem, corrupção e limpeza do cache;
- dois pernoites na mesma data, sobreposição, virada de mês e fusos;
- vazio, cancelamento, alteração, offline e limitação de requisições;
- wiring e UX finais sob Mobile Core;
- revisão independente e CI do SHA final.

## Validação desta slice

`node --test scripts/regression-mycrewcare-controller.mjs` cobre 18 contratos da ligação à interface (desligado por padrão, duas chaves, sem sincronização automática/segundo plano, offline, expiração, reinício, troca de conta, sync em voo descartada, cleanup com falha, publicação idempotente e honestidade de `refreshSuggested`).

Esses contratos são **simulações em Node** com uma ponte falsa. Eles provam o comportamento do controlador, mas **não** substituem a validação física no Android de identidade autenticada, SSO/MFA, expiração, reinício do aparelho e troca de conta, que permanece como gate antes de qualquer ativação.

`node --test scripts/regression-mycrewcare-v3.mjs` cobre 21 contratos (os 12 originais mais restore atrasado após troca/logout/ida-e-volta fora de ordem, falha de leitura obsoleta, desconexão durante restore, retry de cleanup e limpeza nativa assíncrona/timeout/escopo por operação), em em UTC, Brasília e Auckland: URL exata, hotel/pickup separados, vínculo sem hotel prévio, ambiguidade, cancelamento, diff, persistência, restauração, cache offline, vazio verificado, troca de revisão, logout e política foreground/background.

`node scripts/assert-mycrewcare-v3-ownership.mjs` protege a lista de arquivos, impede writers compartilhados, exige release desativado, perfil isolado, armazenamento cifrado, allowlists exatas e recusa dinâmica de registros sem vínculo. O workflow executa esses gates antes e depois da preparação canônica, além de TypeScript, Vite e `assembleDebug`.

### Revisão offline de 11/10/2026: escrita e logout concorrentes

As operações de escrita/limpeza do cache agora são ordenadas por conta na sessão.
Logout/desconexão aguardam uma escrita já iniciada antes da limpeza final, mesmo
quando essa escrita falha; uma escrita ainda enfileirada revalida a geração antes
de tocar o storage. Uma operação antiga não pode persistir dados depois que a
limpeza foi reportada como concluída. Restore aguarda operações de storage já
iniciadas e não restaura a conta enquanto ela está em limpeza. A conta em limpeza
não inicia uma nova sincronização; outra conta pode prosseguir independentemente.

Logout desvincula o contexto em memória antes de aguardar a limpeza. A conclusão
captura conta/contexto/geração e não limpa nem publica estado na conta B vinculada
posteriormente. O controlador também protege a conclusão de `bind` e `logout`
por época de vínculo. Falhas continuam rejeitando a Promise; sem novo vínculo,
a limpeza falha permanece disponível para nova tentativa.

Regressões: escrita bem-sucedida/falha atrasada durante logout e desconexão,
restart sem cache ressuscitado, conclusão bem-sucedida/falha de logout A depois de
restore de B e conclusão tardia no controlador. Os seis novos casos de sessão
falham no HEAD anterior `40056069fff006d523588557057eeb10c12e4a08` e passam após
o reparo. Todos são simulações Node, com ponte/storage sintéticos, sem SSO real.

Validação local (Node 24.19.0): 46/46 em UTC, America/Sao_Paulo e Pacific/Auckland,
antes e depois de `scripts/v139/apply.mjs` em cópia descartável. Ownership PASS
antes/depois, incluindo painel não montado e flags OFF. TypeScript e build Vite
passam; os contratos de associação física de stay, wakeup/concierge e stay menu
também passam na cópia preparada. Nenhum gerador reescreve os módulos corrigidos.
Gradle/SDK Android indisponíveis localmente; a compilação permanece gate de CI.

Limites: a ordenação é por instância de sessão JavaScript; não substitui validação
física Android. Um storage assíncrono que nunca resolve mantém a limpeza pendente
em vez de anunciar sucesso antes da hora. Falha tardia de A após vínculo de B é
reportada ao chamador sem transformar B em `cleanup-error`; a interface continua
restrita a um alvo de limpeza ativo. Os gates físicos e de aquisição real desta
PR permanecem pendentes. Sem ativação, montagem, merge, deploy ou publicação em loja.

### Revisão independente: limpezas sobrepostas e consentimento

A barreira de limpeza por conta conta todas as operações nativas/storage ainda
pendentes. Uma segunda limpeza que termina antes da primeira não libera sync
nem restore. Erros são acumulados até a última operação terminar, evitando que
um sucesso concorrente esconda uma falha. Consentimento não habilita aquisição
enquanto a barreira está ativa.

A publicação do resultado de limpeza usa uma época de contexto independente da
geração de leituras: mudar consentimento na mesma conta não apaga cleanup-error
nem o alvo de retry. Trocar o contexto ainda protege B de conclusões de A.
`cleanupInProgress` é exposto no core e no estado busy do controlador; disconnect
publica esse estado antes de aguardar. Os controles existentes do painel ficam
desabilitados durante a limpeza, mas a proteção também vale para chamadas diretas.

Cinco novas regressões (51 contratos ao todo) reproduzem limpeza repetida com
sucesso/falha, consentimento on/off durante falha e publicação imediata de busy/
retry. Falham em `6471b002`, passam nos três fusos após o reparo. Nenhuma montagem,
flag, bridge de MainActivity, aquisição real ou generator foi alterado.
