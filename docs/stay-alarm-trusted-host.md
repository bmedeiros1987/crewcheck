# Host de sessão e transporte preparados, OFF

Mudança separada sobre PR997/28ca060f. MainActivity chama install no WebView
principal; PREPARED_HOST_ENABLED=false retorna antes de criar host, registrar
listener, escrever lease, validar token ou chamar scheduler. Sem flags via JS,
sem writer de physicalValidationApproved e sem permissões novas.

Quando houver autorização específica para build físico de teste, são necessários
ambos: mudança revisada da constante e aprovação física nativa confiável já
registrada. Essa preparação NÃO executa esses passos. Não publicar lojas.

O host concreto usa WebViewCompat.addWebMessageListener (WebKit1.14.0 já fornecido pela preparação canônica), allowlist
HTTPS exata crewcheck.online, sourceOrigin e isMainFrame, URL atual, revogação
em onPageStarted/close e geração de sessão para rejeitar callbacks de rede
atrasados. O portal externo não recebe listener. Não há JavascriptInterface para
esse endpoint. WebView sem WEB_MESSAGE_LISTENER falha fechado.

authenticate recebe credencial candidata pelo canal; HttpsURLConnection consulta
/api/auth/me no HTTPS exato, sem redirects, timeout5s e resposta limitada64KiB.
Somente ok/authenticated true e user.id string validam identidade. Tokens não são
persistidos pelo host, logados ou enviados em transact. Não são provisionadas
credenciais. Rede fica fora do lock; commit de lease/epoch novo usa
StayAlarmEngine.updateTrustedOwner, compartilhando a fronteira com receive.
Logout, navegação, auth-expired e troca de conta revogam autoridade e reconciliam
jobs antigos. Resposta de autenticação antiga não pode restaurar sessão revogada.

Lease inicial conservadora: até5min depois da validação, com timer de revogação
nativo e web e checagem temporal no Owner. Não há renovação em background. Após
morte/restart do processo, Owner fica indisponível até nova autenticação; journal
não é autoridade de identidade. Reboot NÃO restaura alarmes automaticamente neste
candidato. Isso falha fechado e é uma limitação material para alarmes futuros de
longa duração. Não é prometido funcionamento noturno/com app fechado. Resolver
lease duradoura/renovação/reboot exige contrato de expiração/revogação do serviço
e revisão própria antes de ativação de produto.

No web, port → autenticação → capabilities → factory → controller do editor está
conectado. Sem port aprovado, factory retorna null e editor permanece cálculo.
Um botão explícito de tentativa só aparece em sessão nativa pronta. Permissão
é somente consultada, não solicitada. APZ confirmada, tempo/fuso e estado de
cancelamento seguem gates existentes; recibo é API+journal, nunca entrega.
Alterações de eventos/APZ/fuso/escolha invalidam jobs programados neste runtime;
cancelamentos são serializados pela identidade. Invalidação global de roster
fora do editor ainda exige wiring de ciclo de vida da aplicação; o candidato
não afirma cobrir toda importação com editor desmontado.

Candidato físico posterior: aparelho autorizado, build de teste identificado,
origem real do app, usuário de teste fornecido pelo operador e permissões já
existentes. Confirmar primeiro rejeição de subframe/origem/portal, logout durante
validação, troca/expiração e zero schedule sob OFF. Depois de autorização de
ativação exclusivamente no build de teste, escolher APZ/trigger sintéticos dentro
da lease curta e observar recibo/journal/notificação. Doze, relógio, revogação,
processo morto/reboot e áudio permanecem testes físicos pendentes. Nenhum teste
desta mudança produz notificação real.

Validação: regressions host JS com port/mock; núcleo real Java + host com clock e
store falsos; compilação de host/listener/driver/bridge reais contra API35 e jar
WebKit oficial; admission de origem/frame com Uri real. Build Android CI verifica
MainActivity e resolução Gradle; não equivale a WebView/aparelho físico.

Fontes oficiais:
https://developer.android.com/reference/androidx/webkit/WebViewCompat
https://developer.android.com/jetpack/androidx/releases/webkit#1.14.0

## Cancelamento incerto durante invalidação

A identidade só sai do conjunto web após recibo cancelled correlacionado.
Unknown preserva a identidade, desabilita readiness e solicita revoke; uma nova
invalidate repete revoke em vez de esquecer o job. Recibo de revoke confirma
revogação de autoridade, não remoção do alarme. O host também revoga a sessão
nativa ANTES de devolver cancelamento incerto (inclusive falha do journal antes
de pending-cancel). Assim receive recusa o epoch antigo mesmo se o job continua
no SO. Falha de transporte antes de qualquer operação nativa permanece
revocation-unknown: o web não pode afirmar revogação imediata. A lease nativa
limita essa janela; testes físicos de perda de canal permanecem necessários.

Pendências web são segregadas por account+epoch nativo. Autenticação de uma nova
conta/epoch não apaga a incerteza anterior, mas a invalidação atual só opera no
escopo vigente. Jobs antigos continuam auditáveis em uncertainJobs; a troca de
epoch pelo host invalida a autoridade anterior e recover a reconcilia, sem
interpretar isso como recibo de cancelamento. Resposta antiga que falha não pode
revogar nova sessão web nem nativa: a revogação do host verifica geração/dono/epoch
dentro do lock compartilhado.
