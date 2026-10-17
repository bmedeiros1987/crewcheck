# P2: snapshot anterior não substitui observação mais recente — OFF

Continuação na branch existente test/mycrewcare-sso-contract-inactive-20261015, anterior HEAD ad41ab7687a1c68172163653dbe61902ff2cb3dd. Base histórica6bb888447020e10b71723acb0dad3b96680f4e8a; main revalidada2286c88ffed330246f1c39bed5ad7bb4d64e7851. Sem alteração da #1035 Claude, Home/Pernoite/Wake/Android ou SSO.

Problema reproduzido: após aceitar cancelled observado12:00, a sessão aceitava published11:59 dentro da janela de frescor, ressuscitando hotel/pickup. Era possível também carregar cache válido anterior por restore sobre observação mais recente em memória.

Correção em shared/myCrewCarePersistentSession.mjs: após validar envelope/contexto, comparar observedAt contra cached.syncedAt antes da reconciliação ou escrita. Se estritamente anterior, retornar false com lastError stale-snapshot; preservar facts, changes, instante de sucesso e cache persistido. O status usa a política existente de cache indisponível para atualização, não alega conexão validada nova. Cancelamentos e snapshots vazios confirmados também estabelecem esse limite temporal.

restore faz a mesma comparação antes de trocar cached por conteúdo válido mais antigo. Não regrava storage nem toca em drafts. O limite temporal é o syncedAt já persistido no cache normalizado; não requer novo schema, campo, armazenamento ou login persistente. Quando o cache mais recente foi restaurado, o próximo sync continua protegido.

A comparação vale para o contexto/pernoites atualmente vinculados: setContext já limpa cached quando muda conta, revisão, providerSubject ou conteúdo do pernoite. Não transplantar a barreira da contaA paraB nem de uma revisão para outra. As proteções existentes de epoch, cancelamento e fila de storage continuam sem mudanças.

Snapshots realmente posteriores podem publicar novamente uma reserva antes cancelada; cancelamento não é tombstone permanente. Timestamps iguais mantêm o comportamento anterior; este delta resolve ordenação estritamente regressiva, não estabelece desempate de observações conflitantes no mesmo instante. Não detecta um provedor que rotule conteúdo velho com timestamp novo. A proteção após reinício depende do restore válido do cache existente antes da consulta; não é coordenação global entre múltiplas sessões/processos ou caches externos.

Testes sintéticos novos:7/7 PASS. Contraprova em sessão anterior:7/7 FAIL. Cobrem hotel/pickup anterior e hotel parcial, ambos em memória e após restore; publicação posterior permitida; restore regressivo; snapshot vazio confirmado; preservação do draft manual; isolamento de conta/revisão. Storage e adapter são somente memória, sem rede/provedor/contas reais.

Suite nova + partial-hotel + consumer-boundary + v3 + controller:87/87 PASS em UTC, America/Sao_Paulo e Pacific/Auckland. Composição exata do delta sobre main atual com preparação canônica:87/87 PASS. git diff --check PASS. Sem nova CI, build Android ou alegação de TypeScript reexecutado neste delta JS. CI/revisão independente do novo SHA seguem pendentes.

Integração permanece OFF; flags, permissões, credenciais, allowlist e POST ACS não mudaram. Nenhum merge, deploy, loja ou agendamento. Solicitar revisão do diff concreto antes de qualquer integração.

## Correção residual após revisão independente — somente local

O revisor reproduziu que restore com erro de leitura, cache ausente ou malformado fazia cached=null e perdia a barreira temporal. Corrigido separando latestAcceptedAt dos fatos exibíveis. É apenas um número em memória, restrito ao binding atual; avança exclusivamente após sync aceito/gravado ou restore válido aceito. Não é nova persistência de sessão nem retém payload privado.

Falhas de restore continuam retirando cached e tornando fatos indisponíveis. O watermark permanece: sync ou restore válido estritamente anterior não pode repor esses fatos. Um snapshot posterior permite recuperação normal. Mudança real de conta/revisão/providerSubject/pernoite e detach no logout reiniciam o watermark, sem sobrescrita tardia de outro binding. Disconnect com o mesmo contexto não apaga esse conhecimento temporal mesmo quando esquece os fatos.

Regressões adicionadas para erro de leitura, ausência e JSON malformado: facts indisponíveis inclusive com includeCancelled, hasCachedData=false, sync anterior rejeitado sem escrita, restore válido anterior rejeitado, recuperação posterior permitida e troca legítima de conta/revisão permitida. Antes:7 PASS/3 FAIL; depois:10/10 PASS. Suite completa90/90 PASS em UTC, America/Sao_Paulo e Pacific/Auckland; composição main2286c88 preparada90/90 PASS; diff check PASS. Logs locais mcc-watermark-restore-before.log, mcc-watermark-restore-all-3tz.log e mcc-watermark-restore-main-composed.log.

Não há promessa de monotonicidade entre processos sem cache válido: uma nova instância sem histórico válido não conhece o timestamp perdido. Este delta preserva conhecimento da instância atual durante falhas de restore; não cria registro durável extra. Timestamps iguais e conteúdo antigo rotulado com timestamp novo continuam limites já descritos.

Por instrução atual: sem push, PR, Library nova, CI, merge ou deploy. Arquivos e commit permanecem locais para revisão. A branch remota continua no186355fa; o artefato Library anterior representa aquela versão, não esta correção residual.
