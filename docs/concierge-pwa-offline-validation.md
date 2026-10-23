# CrewCierge: boot completo da PWA offline em navegador

Continuação da #1203. Main confirmado `196a0a07937d1f466894b45b8f4ddc9b487ba4a3` (correção #1201 integrada por outro responsável), incorporado por merge normal local `13353f394a5277fce5b1de3d4e86d2fec449c213`, sem force. O diff da base contém somente a correção DOMPurify e seus testes/documentação. Não houve merge da #1203, deploy, ativação de provider, credencial ou serviço.

## Teste entregue

`scripts/regression-crewcierge-pwa-browser.mjs` serve o **dist completo e não modificado** de `npm run build`, com HTML, App, Home, autenticação cliente, CSS, assets e `sw.js` estampado reais. Não extrai componentes, não substitui módulos de autenticação, não injeta resposta do Concierge e não preenche navegações via Playwright. A única fixture HTTP de sucesso é GET `/api/auth/me` no servidor loopback, com identidade/token inventados; todos os demais endpoints locais recebem indisponível. O armazenamento inicial representa uma seleção fictícia previamente salva, com captura datada e SHA256 correto. Não é teste do login nem do servidor real.

O teste espera o worker instalado, controlador ativo e cache de shell/assets. Depois desliga a rede no contexto Chromium, encerra o servidor loopback e desabilita o cache HTTP via CDP. Verifica reload completo e documento em nova aba sem `sessionStorage`. HTML, JS e CSS offline devem responder 200 com `Response.fromServiceWorker() === true`; o número de requisições recebidas pelo servidor não aumenta. Não há chamada bem-sucedida fora do loopback; origens estrangeiras são abortadas, e resolução DNS do processo de teste é restrita ao loopback. A tentativa herdada de Google Fonts é bloqueada, não usada como dependência da resposta.

Nos três fusos UTC, America/Sao_Paulo e Pacific/Auckland passaram:

- boot aquecido, reload offline e nova aba com worker real;
- próxima jornada fictícia de 400 minutos, com fonte, captura e fuso explícitos;
- paráfrase/abreviação, APZ ambígua pedindo esclarecimento e intenção não suportada terminando localmente;
- nenhuma chamada `fetch` durante cada pergunta e nenhum recarimbo/escrita no envelope selecionado;
- cache legado sem captura permanece indisponível e byte-idêntico após reload/consulta;
- A→B sem seleção de B não exibe programação de A, não fabrica dados e não grava seleção de B;
- expiração/logout remove resposta e navega para login, cujo reload também funciona offline;
- controle negativo: contexto novo, sem worker/cache, não consegue primeira instalação/boot offline;
- zero erros de execução da aplicação completa.

Cada execução produz `report.json` e screenshot local. O relatório registra hashes SHA256 do HTML e worker, origem do build, caches, respostas entregues pelo worker, passos e tentativas de rede. `CREWCIERGE_PWA_EVIDENCE` escolhe a pasta. A CI própria executa o teste após build nos três fusos, sem dependência adicionada ao app.

## Limite observado: boot global ainda tenta rede

**Não significa zero tentativas HTTP da aplicação inteira.** O boot real tenta GETs de sessão, preferências, manutenção, termos, câmbio, meteorologia, escala ativa e runtime patch, e POST `/api/control/telemetry` de abertura. Com rede e servidor desligados, essas tentativas não chegam a um serviço e não são necessárias às respostas locais. As perguntas do CrewCierge não fazem fetch nem restauram escala. O relatório separa tentativas de boot das perguntas.

A telemetria é injetada por `scripts/v14317/apply.mjs:125` e `scripts/v14318/apply.mjs:137`; leitura de escala ativa vem de `client/src/lib/databaseClient.ts`. Esses caminhos já existem na base integrada e não foram alterados nesta continuação. Tornar o **boot global** livre de tentativas HTTP exige coordenação com os responsáveis por esses runtimes; este teste não certifica essa propriedade. Service worker global, autenticação, permissões e segurança não foram modificados.

As primeiras execuções identificaram ajustes na fixture: navegação pós-sessão/onboarding e títulos preparados, MIME `.mjs` necessário ao precache, seletor do textarea e URL de login com query. Uma asserção exploratória de boot somente GET falhou no POST herdado de telemetria; a propriedade final testada é ausência de chamadas de consulta/provider e ausência de rede bem-sucedida offline, com as tentativas globais preservadas no relatório. Nenhuma asserção de isolamento, escrita, entrega por worker ou consulta local foi removida.

## Revalidação e fronteiras

Sobre o merge integrado: instalação npm exclusivamente do cache offline; TypeScript raw e preparado, `npm run check`, `npm run build`, 126 grupos servidor, 240 verificações leitor, seis execuções da tela compilada e três execuções PWA completa. A suíte canônica de jornada também passou. Resultados de CI devem ser associados ao novo SHA publicado, não herdados do HEAD anterior.

Esta evidência cobre Chromium desktop local com armazenamento conservado. Não certifica aparelho físico, WebKit/Safari/iOS, remoção do armazenamento pelo sistema, atualização entre builds, primeira instalação sem rede, OAuth/login real ou renovação/revogação real de sessão. Provider continua OFF, sem teste de qualidade de modelo. A ligação do provider no servidor e a coordenação com #1135 permanecem pendentes. Não se declara deploy LIVE nem liberação da #1203.
