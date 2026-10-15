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
