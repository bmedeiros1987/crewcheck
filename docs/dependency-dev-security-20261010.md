# Atualização pontual de ferramentas de desenvolvimento

Base comum: `500fb1c33370689b6c05a49c1d594a0df0b5bb35` (main verificada em 2026-10-10). Worktree e branch isolados; sem alterações às PRs #965/#951/#975 ou a serviços/dados reais. Não foram encontrados AGENTS.md ou .agents/skills no workspace disponível.

## Evidência e limite da auditoria

O [log existente](https://github.com/bmedeiros1987/crewcheck/actions/runs/38081298494/job/114298591770) informa 7 vulnerabilidades na instalação (1 crítica, 3 altas, 1 moderada, 2 baixas). O relatório já existente de `--omit=dev` identifica mysql2 e DOMPurify (1 moderada e 2 baixas, incluindo propagação transitiva). O artefato desse run é somente auditoria funcional. Nenhum relatório completo de dependências foi encontrado no workspace. A leitura de `/repos/bmedeiros1987/crewcheck/dependabot/alerts` retornou `Forbidden`.

**Pacote crítico ainda não identificado.** O banner remoto do git push nesta tarefa informou 15 vulnerabilidades na branch padrão (1 crítica, 8 altas, 4 moderadas, 2 baixas); confirma somente essa contagem agregada exibida pelo GitHub, sem acesso aos alertas individuais. Os advisories públicos desta correção não permitem atribuir aquela crítica. Não há afirmação de explorabilidade real, resolução de todas as vulnerabilidades ou nova contagem pós-correção. Para encerrar essa pendência é necessário um relatório completo já existente ou acesso autorizado somente de leitura aos alertas Dependabot do repositório (incluindo pacote, severidade, estado e faixa afetada). Não foi feito novo npm audit, audit fix, scanner alternativo nem transmissão do grafo.

Downloads foram limitados a metadados/tarballs de pacotes para instalação normal e advisories públicos. Instalações: `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache`. A integridade SHA-512 dos pacotes é registrada no lockfile e validada pelo npm ci. Não foram alterados workflows. Os commits têm `[skip ci]` porque a CI atual contém npm audit explícito e instalações com audit automático; CI remota permanece pendente, sem criar outra execução de auditoria. Revisão independente e validação do SHA final continuam gates de merge/deploy.

## Versões confirmadas por advisories públicos

| Pacote dev transitivo | Antes | Depois | Advisory |
| --- | --- | --- | --- |
| tar | 7.5.20 | 7.5.21 | [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m), alta |
| @xmldom/xmldom | 0.9.10 | 0.9.12 | [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6), alta |
| brace-expansion | 5.0.7 | 5.0.9 | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), alta |

As três entradas conservam os requisitos de dependências e flags dev existentes. Somente versão, URL e integridade mudam no lockfile; sem atualizar Capacitor ou Android/Gradle.

## Validação local

Node 24.19.0, sem credenciais: npm ci, npm run check, npm run build, `node scripts/regression-dependency-dev-security.mjs`, `./node_modules/.bin/cap --version` (7.6.7), `cap config` e `cap ls` passaram. O teste usa expansão limitada, XML com 1500 atributos e listagem seletiva de arquivo tar sintético. Ele verifica compatibilidade, sem alegar reprodução de todos os ataques. Build Vite mantém o aviso existente de chunks grandes. Os arquivos gerados pela preparação foram descartados, preservando somente lockfile, teste e documento.

Não há gradle/SDK Android instalado: assembleDebug e teste físico não executados. Nenhum sync de plataforma, permissão, store, custo, secret, merge ou deploy.
