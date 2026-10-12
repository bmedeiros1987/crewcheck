# Worker de servidor com provedor exclusivamente simulado

Base: PR979 publicada em main 92b199e66b04eded8826e8412751379cd3fcbd7a.
Este draft não ativa entrega externa nem registra consentimento em produção.

## Percurso e limites

POST autenticado `/api/notifications/free-day-simulated-worker` aceita somente
`enqueue` ou `run`, contexto opaco e revisões pessoal/worker. GET consulta o estado
e faz limpeza de contexto inválido ou marca uma tentativa interrompida como incerta.
Não há timer, varredura automática, novo daemon ou permissão persistente.

A fila SQL real fica `held`, com chat_id/username/phone NULL. A máquina de estados
fica na metadata já existente desse job: `held → pending → dispatching →
accepted_unconfirmed | uncertain | rejected`. Cancelamento antes do transporte
gera `cancelled`. Todos esses estados são da SIMULAÇÃO, não entrega real.
O worker não modifica `SOURCE_QUEUE_DISPATCH_ALLOWED=false` nem a rejeição atual
de qualquer `free-day:` no dispatcher real.

A oferta de simulação exige `CREWCHECK_FREE_DAY_WORKER_SIMULATION_ENABLED=true`,
oferta pessoal já habilitada e ID público exato na allowlist pessoal existente.
Defaults OFF e lista vazia; nenhuma configuração/allowlist de produção é alterada.
O endpoint não aceita destino, URL, provider, resultado, ownerId ou autoridade
administrativa fornecidos pelo cliente. O resultado controlado para testes não
é aceito por HTTP. O provedor é uma função local fixa, sem callback injetável,
rede, destinatário ou credenciais. `accepted`/`delivered` reais permanecem false.

## Elegibilidade e cutoff persistente

Sob lock da conta, validar JWT/publicId, geração de criação, recibos mínimos,
identidade/período/versões/fusos e sequência nas duas publicações; preparação
vigente; ambos os registros do vínculo existente e fingerprint; autorização
pessoal corrente ligada ao contexto, finalidade/texto e TTL. Enqueue exige CAS
da revisão própria. Duplicatas do mesmo enqueue compartilham a reserva.

Run revalida os gates e persiste `dispatching`, chave opaca de tentativa e horário
ANTES de qualquer invocação local. Uma nova transação revalida fonte/vínculo/
consentimento sob os mesmos locks antes do provedor. Revogação, troca de vínculo,
fonte, perfil ou perda de allowlist impedem invocação. Os locks permanecem até a
auditoria do resultado local ser concluída. Grupo é um vínculo coletivo validado,
nunca inferido pelo username ou chatId fornecido pelo cliente.

Enquanto `dispatching` tem menos de 120s, duplicata só consulta esse estado.
Uma tentativa interrompida há 120s ou mais vira `uncertain`, nunca é retomada.
Perda de autorização de uma tentativa já em dispatching também é incerta: não
se afirma que uma invocação anterior foi cancelada. Contexto/metadata removidos
retornam unavailable, sem presumir ausência de tentativa.
Nenhum estado terminal é reativado. Isso prefere perder uma simulação a repetir
uma invocação cujo resultado não pôde ser confirmado; não promete exactly-once.
Falha de auditoria após o cutoff mantém a tentativa persistida, impedindo replay.
Falha anterior ao cutoff sofre rollback e permite nova tentativa sem transporte.
Falha/resultado desconhecido do commit exige inspeção; a resposta não promete
cancelamento ou ausência de tentativa quando o resultado do banco for desconhecido.

## Evidências sintéticas

Unit/HTTP: defaults e allowlist, conta distinta, injeção de autoridade/destino,
grupo, fonte/TTL/vínculo/recriação, revogação antes e depois do cutoff, CAS,
8 enqueues/runs concorrentes, aceitação/recusa/incerteza, interrupção e rollback
de auditoria antes/depois da invocação; nenhum replay de resultado incerto.

Browser: PDFs sintéticos e consentimento pessoal explícito; fecha todo o contexto
do navegador; enfileira e executa via HTTP local no servidor; reabre o app com
resultado persistido, revoga, troca sessão e ignora resposta atrasada. Sem
Notification permission ou rede externa.

MySQL 8.4 isolado: 8 enqueues/runs concorrentes sob locks reais e leitura do resultado
por pool independente; fila real continua held/NULL e sem provider externo.
Regressões raw/preparadas, build/TypeScript, financeiro e isolamento em CI.

## Fora deste draft

Entrega Telegram real, held→pending na fila real, timer/worker contínuo, novos
grants e ativação de produção exigem revisão e autorização específicas. Um
provider externo precisará revisar cutoff, revogação em voo, idempotência do
provider e reconciliação de resultados incertos. Nunca liberar backlog em massa.
Origem oficial permanece não verificada e indenização não é presumida.

## Correções da revisão independente (P2)

O relógio de produção é consultado após obter todos os locks e novamente sem
await imediatamente antes do provedor. TTL de fonte, consentimento pessoal e
cutoff são reavaliados com tempo fresco, incluindo esperas por conexão/locks e
commit do claim. `now` fixo é apenas compatibilidade de fixtures; `clock` injetado
permite testes determinísticos de avanço durante esperas. Nenhum clock é aceito
por HTTP. Respostas também recalculam elegibilidade ao serem montadas.

Antes do commit do cutoff, `claimState` passa a `unknown`; só o ACK confirmado
permite `persisted`. Erro preserva a marca antes de rollback e não é substituído
por falha de rollback/release. HTTP responde `claimPersisted:null` para ACK perdido,
`true` para cutoff confirmado e `false` para cutoff não iniciado, com `claimState`
e `rollbackFailed`. Não afirmar ausência de cutoff diante de resultado desconhecido.

Regressões reproduzem expiração de fonte/consentimento durante conexão, primeiro
ou segundo lock, commit e último gate; cutoff expirado antes do transporte; erro
original mais rollback perdido; ACK perdido no claim e na auditoria final, com
contagem independente de invocações e confirmação de ausência de replay.
