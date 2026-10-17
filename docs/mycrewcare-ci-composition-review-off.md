# Composição CI/ownership MyCrewCare — revisão final OFF

Main revalidada:2286c88ffed330246f1c39bed5ad7bb4d64e7851. Composição local anterior:6a61d66fc01cfe23af503e92edf61da92bc0de36 (tree2c24aa1fdda63aca222c1d0d44117509c7b77138), contendo delta aprovado192e50f5 e main atual. Nenhuma nova branch ou implementação de aquisição. Sem push/PR/merge/deploy nesta etapa de revisão final.

## Os13 caminhos e a causa do gate

O auditor compara caminhos alterados desde merge-base(HEAD,origin/main) a uma lista exata do slice Mobile Core. Ele rejeitava os novos arquivos abaixo porque ainda não estavam listados; não era rejeição de hotel_only nem do watermark (os módulos shared já constavam da lista).

Documentos:
- docs/mycrewcare-concierge-wake-handoff-off.md
- docs/mycrewcare-partial-hotel-review-off.md
- docs/mycrewcare-snapshot-monotonic-review-off.md
- docs/mycrewcare-sso-contract-inactive.md

Fixtures somente de teste/revisão, fora dos sourceSets Android:
- scripts/fixtures/mycrewcare-sso-contract/AndroidManifest.synthetic.xml
- scripts/fixtures/mycrewcare-sso-contract/CrewCheckMyCrewCareSsoDraft.java
- scripts/fixtures/mycrewcare-sso-contract/RedirectInstrumentation.java
- scripts/fixtures/mycrewcare-sso-contract/SsoDraftHarness.java
- scripts/fixtures/mycrewcare-sso-contract/debug-inactive.patch

Regressões:
- scripts/regression-mycrewcare-consumer-boundary.mjs
- scripts/regression-mycrewcare-partial-hotel.mjs
- scripts/regression-mycrewcare-snapshot-monotonic.mjs
- scripts/regression-mycrewcare-sso-draft.mjs

Adicionados nominalmente ao auditor, junto de scripts/regression-mycrewcare-ownership-paths.mjs e deste documento (15 entradas novas). Nenhum prefixo, wildcard ou remoção de regra. MainActivity, Home, scripts/v139/apply.mjs, server.mjs e server/platform.mjs continuam explicitamente proibidos. As demais validações de ownership, cache, lifecycle, perfil e isolamento permanecem byte a byte no restante do script.

## Teste negativo e CI

O novo ownership-paths executa o prefixo real do auditor (sem copiar a lista/predicado) em repositórios Git temporários. Cria baseline/origin-main locais, commits sintéticos e executa a descoberta real git diff. Testa as15 adições permitidas e seis rejeições: Home, MainActivity, server.mjs, fixture não listada no mesmo diretório, documento com mesmo prefixo e módulo shared estranho. Todos devem falhar com a mensagem de escopo. Sem chamadas a GitHub ou ao provedor.

Workflow existente mycrewcare-v3-persistence.yml recebe somente os15 filtros de caminhos exatos e uma linha adicional de testes dentro de CADA loop de3fusos, antes/depois da preparação. Executa consumer-boundary, partial-hotel, snapshot-monotonic, sso-draft e ownership-paths. Preserva todas as linhas anteriores, npm ci, contratos nativos/DOM, timezone loops, preparação canônica, stay/Concierge, TypeScript, Vite, SDK compilation e exclusão de release. Nenhuma alteração de permissões (contents:read), runner, timeout, serviços, custos, secrets ou publicação. O ensaio WebView permanece compilável como fixture; não é apresentado como execução instrumental.

## Relação com PR1027/1035 e decisão de ownership

Remotos revalidados: #1027 head0624e99c7fb0d0672cdce6ace1657039803d84f5, #1035 head74f5159d632e1cc74b7bc2aada354b751d082a66. Ambas draft. #1035 é pilha Git sobre #1027 e pertence a Claude. Merge-base da nossa composição com ambas:510555c53d9ee2abd3151ad06dbc82a2ab99fecb; nenhuma delas é ancestral desta branch. Logo esta é continuação complementar sobre main, NÃO se deve alegar que está empilhada sobre1035.

#1027 altera Activity debug, documento debug, DebugActionHarness e regression-debug-action. Nossa branch não altera esses quatro arquivos. #1035 altera os mesmos quatro mais o workflow; a única sobreposição de arquivos é o workflow. Nosso delta nele só acrescenta cobertura; não replica diagnóstico, lógica de callback, APK ou navegação. Os3 módulos de runtime alterados por esta branch são logística(.mjs/.d.mts) e sessão persistente(.mjs), não alterados por1027/1035. Não há duplicação de implementação.

Portanto não injetar silenciosamente o delta na branch de Claude nem reaproveitar1027 como se fosse o mesmo escopo. Não foi encontrada PR aberta/fechada da branch test/mycrewcare-sso-contract-inactive-20261015 nas100 PRs recentes consultadas. Uma PR própria para esta branch existente é semanticamente adequada caso o coordenador confirme esse destino após a revisão da composição final; não criar uma terceira implementação nem retomar907/872. Neste turno não foi criada PR.

## Estado e limites

Manter MyCrewCare OFF: flags, allowlist, login, credenciais, permissões e produção sem alteração. Sem ativação/persistência de SSO, chamada real, agendamento, APK, loja, merge ou deploy. Resultado remoto de CI permanece pendente, pois composição ainda não publicada. A revisão independente deve avaliar o SHA final e o patch contra main incluídos no pacote Library; aprovações dos SHAs anteriores não são apresentadas como aprovação destas mudanças de CI.
