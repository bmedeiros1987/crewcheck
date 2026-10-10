# Atualização pontual de Capacitor iOS e ferramentas de desenvolvimento

Base comum: `500fb1c33370689b6c05a49c1d594a0df0b5bb35` (main verificada em 2026-10-10). Worktree e branch isolados; sem alterações às PRs #965/#951/#975 ou a serviços/dados reais. Não foram encontrados AGENTS.md ou .agents/skills no workspace disponível.

## Evidência e limite da auditoria

O [log existente](https://github.com/bmedeiros1987/crewcheck/actions/runs/38081298494/job/114298591770) informa 7 vulnerabilidades na instalação (1 crítica, 3 altas, 1 moderada, 2 baixas). O relatório já existente de `--omit=dev` identifica mysql2 e DOMPurify (1 moderada e 2 baixas, incluindo propagação transitiva). O artefato desse run é somente auditoria funcional. Nenhum relatório completo de dependências foi encontrado no workspace. A leitura de `/repos/bmedeiros1987/crewcheck/dependabot/alerts` retornou `Forbidden`.

**Evidência histórica anterior à autorização de audit:** pacote crítico ainda não identificado naquele momento. O banner remoto do git push nesta tarefa informou 15 vulnerabilidades na branch padrão (1 crítica, 8 altas, 4 moderadas, 2 baixas); confirma somente essa contagem agregada exibida pelo GitHub, sem acesso aos alertas individuais. Os advisories públicos desta correção não permitem atribuir aquela crítica. Não há afirmação de explorabilidade real, resolução de todas as vulnerabilidades ou nova contagem pós-correção. Para encerrar essa pendência é necessário um relatório completo já existente ou acesso autorizado somente de leitura aos alertas Dependabot do repositório (incluindo pacote, severidade, estado e faixa afetada). Até esse ponto não foi feito novo npm audit, audit fix, scanner alternativo nem transmissão do grafo. A atualização autorizada abaixo substitui a pendência de identificação.

Downloads foram limitados a metadados/tarballs de pacotes para instalação normal e advisories públicos. Instalações: `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/crewcheck-npm-cache`. A integridade SHA-512 dos pacotes é registrada no lockfile e validada pelo npm ci. Não foram alterados workflows. Os commits iniciais têm `[skip ci]` porque a CI atual contém npm audit explícito e instalações com audit automático; Na fase inicial a CI remota permaneceu pendente, sem criar outra execução de auditoria; após autorização específica, o commit final libera a CI existente. Revisão independente e validação do SHA final continuam gates de merge/deploy.

## Versões confirmadas por advisories públicos

| Pacote dev transitivo | Antes | Depois | Advisory |
| --- | --- | --- | --- |
| tar | 7.5.20 | 7.5.21 | [GHSA-r292-9mhp-454m](https://github.com/advisories/GHSA-r292-9mhp-454m), alta |
| @xmldom/xmldom | 0.9.10 | 0.9.12 | [GHSA-8344-3jmq-59r6](https://github.com/advisories/GHSA-8344-3jmq-59r6), alta |
| brace-expansion | 5.0.7 | 5.0.12 | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), alta |

As três entradas conservam os requisitos de dependências e flags dev existentes. Somente versão, URL e integridade mudam no lockfile; sem atualizar Capacitor ou Android/Gradle.

## Validação local

Node 24.19.0, sem credenciais: npm ci, npm run check, npm run build, `node scripts/regression-dependency-dev-security.mjs`, `./node_modules/.bin/cap --version` (7.6.7), `cap config` e `cap ls` passaram. O teste usa expansão limitada, XML com 1500 atributos e listagem seletiva de arquivo tar sintético. Ele verifica compatibilidade, sem alegar reprodução de todos os ataques. Build Vite mantém o aviso existente de chunks grandes. Os arquivos gerados pela preparação foram descartados, preservando somente lockfile, teste e documento.

Não há gradle/SDK Android instalado: assembleDebug e teste físico não executados. Nenhum sync de plataforma, permissão, store, custo, secret, merge ou deploy.

## Audit autorizado e Node 22 — atualização final

Em 2026-10-10, após pergunta específica sobre transmitir somente nomes e versões ao registry.npmjs.org, Bruno autorizou prosseguir. O retry único da auditoria antes negada concluiu normalmente, sem nova rejeição. O relatório JSON completo da main identificou @capacitor/ios 7.6.7 como crítico: [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv), faixa >=7.0.0 <7.6.9. Identificação agora comprovada, sem contornar o Forbidden de Dependabot. O relatório atual da main contém 6 pacotes vulneráveis (1 crítica, 3 altas, 1 moderada, 1 baixa); as contagens antigas de CI/Dependabot são snapshots distintos e não foram reescritas como se fossem equivalentes.

Node 22.23.3 oficial (mesma versão do log CI): instalação com audit/scripts desabilitados, npm run check e npm run build PASS. As fontes geradas foram descartadas após validação; nenhum código de aplicação mudou. O commit final sem skip libera CI normal existente com todos os gates, inclusive audit. Não há merge/deploy autorizado por estes resultados.

Além de tar 7.5.21 e xmldom 0.9.12, brace-expansion foi elevado a 5.0.12: o audit mostrou [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) e [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), ainda afetando 5.0.9. Requisito de Node sobe de 18||20||>=22 para 20||>=22, compatível com engines do app.

@capacitor/ios 7.6.7 → 7.6.9, requisito direto ^7.6.9; peer @capacitor/core ^7.6.0 permanece satisfeito pelo 7.6.7 já travado. CLI/core não alterados. Fonte nativa da versão instalada inspecionada: guard de navegação bloqueia httpInterceptorStartIdentifier, proxy servido somente com CapacitorHttp enabled. Sem @capacitor/android ou com.capacitorjs:core encontrado em android-wrapper; não se atribui vulnerabilidade Capacitor ao wrapper próprio. Fixture dev e cap --version/config PASS em Node22.

Audit final desta branch: 3 pacotes (mysql2 moderado, DOMPurify baixo e propagação jsPDF baixa), tratados separadamente na #988; zero crítica/alta desta branch. A atualização de pacote iOS não atualiza binários já distribuídos: rebuild/teste nativo Xcode e distribuição revisada continuam necessários, sem execução neste Linux, sem stores ou publicação.

Composição somente de manifest/lockfile das duas correções: audit autorizado retornou zero vulnerabilidades (info/baixa/moderada/alta/crítica = 0), snapshot em 2026-10-10. SHA-256 do lockfile composto: `e8aac2b5bf899342ef78e751971cc33462f2873f106d7769546a746915009816`. É evidência dessa composição local; não altera main, não faz merge das PRs e não substitui revisão/CI de cada SHA. Relatórios JSON e lock composto estão no pacote privado de revisão.
