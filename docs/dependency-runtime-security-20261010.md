# Atualização pontual de banco e PDF

Base comum: `500fb1c33370689b6c05a49c1d594a0df0b5bb35` (main verificada em 2026-10-10). Worktree e branch isolados; sem alterações às PRs #965/#951/#975 ou a serviços/dados reais. Não foram encontrados AGENTS.md ou .agents/skills no workspace disponível.

## Evidência e limite da auditoria

O [log existente](https://github.com/bmedeiros1987/crewcheck/actions/runs/38081298494/job/114298591770) informa 7 vulnerabilidades na instalação (1 crítica, 3 altas, 1 moderada, 2 baixas). O relatório já existente de `--omit=dev` identifica mysql2 e DOMPurify (1 moderada e 2 baixas, incluindo propagação transitiva). O artefato desse run é somente auditoria funcional. Nenhum relatório completo de dependências foi encontrado no workspace. A leitura de `/repos/bmedeiros1987/crewcheck/dependabot/alerts` retornou `Forbidden`.

**Evidência histórica anterior à autorização de audit:** pacote crítico ainda não identificado naquele momento. O banner remoto do git push nesta tarefa informou 15 vulnerabilidades na branch padrão (1 crítica, 8 altas, 4 moderadas, 2 baixas); confirma somente essa contagem agregada exibida pelo GitHub, sem acesso aos alertas individuais. Os advisories públicos desta correção não permitem atribuir aquela crítica. Não há afirmação de explorabilidade real, resolução de todas as vulnerabilidades ou nova contagem pós-correção. Para encerrar essa pendência é necessário um relatório completo já existente ou acesso autorizado somente de leitura aos alertas Dependabot do repositório (incluindo pacote, severidade, estado e faixa afetada). Até esse ponto não foi feito novo npm audit, audit fix, scanner alternativo nem transmissão do grafo. A atualização autorizada abaixo substitui a pendência de identificação.

Downloads foram limitados a metadados/tarballs de pacotes para instalação normal e advisories públicos. Instalações: `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache`. A integridade SHA-512 dos pacotes é registrada no lockfile e validada pelo npm ci. Não foram alterados workflows. Os commits iniciais têm `[skip ci]` porque a CI atual contém npm audit explícito e instalações com audit automático; Na fase inicial a CI remota permaneceu pendente, sem criar outra execução de auditoria; após autorização específica, o commit final libera a CI existente. Revisão independente e validação do SHA final continuam gates de merge/deploy.

## Versões confirmadas por advisories públicos

| Pacote | Antes | Depois | Advisory |
| --- | --- | --- | --- |
| mysql2 | 3.22.6 | 3.23.1 | [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), moderada |
| DOMPurify (override transitivo de jsPDF) | 3.4.13 | 3.4.16 | [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p) e [GHSA-6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2), baixas |

O requisito direto de mysql2 passa de ^3.11.5 para ^3.23.1; lockfile fixa 3.23.1. A nova versão requer sql-escaper ^1.5.1, já instalado no lockfile em 1.5.1; nenhum pacote adicional muda. Override DOMPurify exato 3.4.16. Não há alteração de código de aplicação, configuração de compressão do banco ou uso de sanitização IN_PLACE; os advisories possuem pré-condições que não foram comprovadas em produção.

## Validação local

Node 24.19.0: npm ci, npm run check, npm run build e git diff --check passaram. Vite conserva o aviso existente de chunks grandes. Teste runtime passa em fonte raw; os mesmos casos PDF/DOM também passaram com fonte preparada. PDF: função real exportReport compilada por esbuild, fixtures fictícias de 1 e 80 linhas, cabeçalho PDF e roundtrip no pdfjs-dist com nome/base/texto preservados (3 e 5 páginas). DOMPurify: markup comum, remoção de subárvore em afterSanitizeElements e afterSanitizeAttributes e raiz rawtext IN_PLACE. DOM simulado em jsdom 30.0.1; isso não comprova exploração ou execução real em navegador. Tentativa Chromium local não produziu resultado antes do timeout e não é contabilizada como PASS.

Reprodução sem audit automático ou scripts de instalação:

```sh
npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache
npm install --prefix /tmp/crewcheck-dom-qa jsdom@30.0.1 --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache
CREWCHECK_QA_JSDOM_PACKAGE=/tmp/crewcheck-dom-qa/package.json node scripts/regression-dependency-runtime-security.mjs
npm run check
npm run build
```

A suíte existente regression-notification-mysql passou os 13 cenários SQL com mysql2 3.23.1, fonte preparada e MySQL 8.4.11 descartável. Container `--network none`, sem portas publicadas, banco fictício crewcheck_notification_qa, socket /tmp/crewcheck-notification-qa-socket/mysqld.sock, sem DATABASE_URL, fetch externo proibido pelo harness. O container foi removido ao terminar. Inclui concorrência, consentimento/revogação, heartbeat estrito, isolamento e exclusão de dados fictícios. Não reproduz uma conexão comprimida maliciosa do advisory.

Regressões existentes p0-pwa-share-target-pdf e v14-4-11-roster-integrity-guard passaram na fonte preparada. Arquivos produzidos pela preparação foram descartados; commit conserva apenas manifest/lockfile, teste e documento. Nenhuma migration, credencial, banco/serviço real, novo custo, Render workspace, merge ou deploy.

## Correção da fixture rawtext após revisão independente

A fixture inicial omitia o fechamento `</style>` e não verificava serialização/reparse. Ela foi substituída por payload sintético com fechamento da própria tag, atributo onclick e img/onerror. O teste confirma a passagem pelo registro de force-removal, detach da raiz, serialização do resultado e reparse em div comum. Na versão corrigida nenhum img armado pode reaparecer. O controle negativo opcional exige exatamente DOMPurify 3.4.13: a mesma fixture devolve a raiz removida, neutraliza onclick e materializa um img com onerror após reparse. jsdom está com execução de scripts desabilitada; nenhum handler é executado e nenhum recurso externo é carregado.

Com DOMPurify 3.4.16 PASS e controle negativo 3.4.13 reproduzido, em Node 24.19.0/jsdom 30.0.1. As duas exportações PDF também passam no script revisado. Controle negativo reutilizou a instalação já existente da branch dev, sem novo acesso ao registry. Comando adicional:

```sh
CREWCHECK_QA_JSDOM_PACKAGE=/tmp/crewcheck-dom-qa/package.json CREWCHECK_QA_VULNERABLE_DOMPURIFY_PACKAGE=/caminho/isolado/node_modules/dompurify/package.json node scripts/regression-dependency-runtime-security.mjs
```

Esta é uma reprodução estrutural sintética do advisory; não comprova exploração em produção nem execução em navegador real.

## Audit autorizado e Node 22 — atualização final

Em 2026-10-10, após pergunta específica sobre transmitir somente nomes e versões ao registry.npmjs.org, Bruno autorizou prosseguir. O retry único da auditoria antes negada concluiu normalmente, sem nova rejeição. O relatório JSON completo da main identificou @capacitor/ios 7.6.7 como crítico: [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv), faixa >=7.0.0 <7.6.9. Identificação agora comprovada, sem contornar o Forbidden de Dependabot. O relatório atual da main contém 6 pacotes vulneráveis (1 crítica, 3 altas, 1 moderada, 1 baixa); as contagens antigas de CI/Dependabot são snapshots distintos e não foram reescritas como se fossem equivalentes.

Node 22.23.3 oficial (mesma versão do log CI): instalação com audit/scripts desabilitados, npm run check e npm run build PASS. As fontes geradas foram descartadas após validação; nenhum código de aplicação mudou. O commit final sem skip libera CI normal existente com todos os gates, inclusive audit. Não há merge/deploy autorizado por estes resultados.

Regressão revisada DOMPurify com fechamento </style>, serialize/reparse e controle negativo 3.4.13 PASS em Node22 antes/depois de preparação, assim como os PDFs de 3/5 páginas. Audit final desta branch: 4 pacotes dev ainda vulneráveis (@capacitor/ios crítico, tar/xmldom/brace-expansion altos), corrigidos separadamente pela #987; zero baixa/moderada nesta branch. Não se afirma zero vulnerabilidades em nenhuma branch isolada.

Composição somente de manifest/lockfile das duas correções: audit autorizado retornou zero vulnerabilidades (info/baixa/moderada/alta/crítica = 0), snapshot em 2026-10-10. SHA-256 do lockfile composto: `e8aac2b5bf899342ef78e751971cc33462f2873f106d7769546a746915009816`. É evidência dessa composição local; não altera main, não faz merge das PRs e não substitui revisão/CI de cada SHA. Relatórios JSON e lock composto estão no pacote privado de revisão.
