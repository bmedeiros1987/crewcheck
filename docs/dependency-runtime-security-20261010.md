# Atualização pontual de banco e PDF

Base comum: `500fb1c33370689b6c05a49c1d594a0df0b5bb35` (main verificada em 2026-10-10). Worktree e branch isolados; sem alterações às PRs #965/#951/#975 ou a serviços/dados reais. Não foram encontrados AGENTS.md ou .agents/skills no workspace disponível.

## Evidência e limite da auditoria

O [log existente](https://github.com/bmedeiros1987/crewcheck/actions/runs/38081298494/job/114298591770) informa 7 vulnerabilidades na instalação (1 crítica, 3 altas, 1 moderada, 2 baixas). O relatório já existente de `--omit=dev` identifica mysql2 e DOMPurify (1 moderada e 2 baixas, incluindo propagação transitiva). O artefato desse run é somente auditoria funcional. Nenhum relatório completo de dependências foi encontrado no workspace. A leitura de `/repos/bmedeiros1987/crewcheck/dependabot/alerts` retornou `Forbidden`.

**Pacote crítico ainda não identificado.** O banner remoto do git push nesta tarefa informou 15 vulnerabilidades na branch padrão (1 crítica, 8 altas, 4 moderadas, 2 baixas); confirma somente essa contagem agregada exibida pelo GitHub, sem acesso aos alertas individuais. Os advisories públicos desta correção não permitem atribuir aquela crítica. Não há afirmação de explorabilidade real, resolução de todas as vulnerabilidades ou nova contagem pós-correção. Para encerrar essa pendência é necessário um relatório completo já existente ou acesso autorizado somente de leitura aos alertas Dependabot do repositório (incluindo pacote, severidade, estado e faixa afetada). Não foi feito novo npm audit, audit fix, scanner alternativo nem transmissão do grafo.

Downloads foram limitados a metadados/tarballs de pacotes para instalação normal e advisories públicos. Instalações: `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache`. A integridade SHA-512 dos pacotes é registrada no lockfile e validada pelo npm ci. Não foram alterados workflows. Os commits têm `[skip ci]` porque a CI atual contém npm audit explícito e instalações com audit automático; CI remota permanece pendente, sem criar outra execução de auditoria. Revisão independente e validação do SHA final continuam gates de merge/deploy.

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
