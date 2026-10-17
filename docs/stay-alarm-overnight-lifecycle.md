# Continuação preparada, OFF: duração, reinício e invalidação global

Base: PR998 fix4d8c2d87. Esta mudança não altera essa PR; fica empilhada separadamente.
PREPARED_HOST_ENABLED=false e PREPARED_OVERNIGHT_LEASE_ENABLED=false. Nenhuma
permissão/credencial nova, nenhum armazenamento de bearer pelo host, alarme real,
publicação em loja, merge ou deploy. Me recebe somente campo adicional de prova
após verifyJwt, usando o segredo de autenticação EXISTENTE sem alterá-lo.

## Duração conectada

/api/auth/me retorna stayAlarmLease derivado de payload.exp já verificado:
serverNow,sessionExpiresAt,stayLeaseExpiresAt. Exp ausente/malformado/expirado não
gera prova. Limite preparado18h (proposta revisável), nunca além da expiração da
credencial. Não estende token nem cria outra credencial.
Host HTTPS exige a prova e desconta conservadoramente o tempo de ida/volta da
validação; prazo nativo usa SystemClock.elapsedRealtime (inclui deep sleep),
evita prolongar lease por atraso/retrocesso do relógio civil. Clock e store são
falsos nos testes. A sessão recebe prazo configurável limitado18h, capabilities
publica leaseRemainingMillis e runtime web usa esse prazo para revogar.
Com gate noturno false o limite continua5min, mas agora também limitado pela
expiração verificada. Sem o backend novo disponível o host recusa prova ausente;
ativação exige aplicação coordenada/revisada, não fallback silencioso para prazo
inventado.

## Invalidação fora do editor conectada

main.tsx importa o serviço na inicialização; sem port nativo aprovado faz nada.
Listener global acompanha roster-updated,roster-cleared,roster-choice-start,
planned-roster-updated e stay-editor-saved. Todos revogam autoridade inteira,
mesmo com editor desmontado; jamais rearmam após importação/alteração.
Auth-expired/logout/troca já revogam via runtime. Eventos globais são os emissores
existentes inspecionados, não uma alegação de cobertura de qualquer produtor
futuro. Novos produtores de mutação devem emitir esse contrato. O editor oferece
revalidação EXPLÍCITA de sessão após revogação quando há port aprovado, sem
programar sozinho.

## Reinício: política implementada e bloqueio da retomada autônoma

Processo sem host autenticado tem Owner indisponível; receiver não entrega e
recover bloqueia/quarentena jobs antigos. App iniciado abre canal restrito,
revalida credencial já existente no login web perante /me, emite epoch novo e
exige nova confirmação do pernoite. Nenhum epoch antigo é adotado da persistência.
Isso é fail-closed e já conectado, mas NÃO garante despertar após morte do
processo/reboot sem reabrir o app. Lease longa resolve duração enquanto autoridade
nativa vive; não resolve a ausência de autoridade após reinício.

Para retomada AUTÔNOMA falta um emissor/validador de lease retomável com origem,
account,epoch,expiração,versão de programação e política de revogação durável.
Alternativas concretas a revisar: (a) revalidar online no receiver usando uma
credencial de retomada armazenada com proteção nativa; (b) prova offline assinada
pelo serviço com chave pública e contexto de boot/tempo confiável. Não persistimos
bearer nem criamos chave/credencial para escolher uma alternativa sem autorização.
Retomar simplesmente verifiedOwnerId/ExpiresAt de prefs seria adoção de autoridade
sem resolver logout/cancel desconhecido/relógio após boot e não foi implementado.
A eventual decisão que exija credencial/chave nova deve parar antes de provisionar
ou armazenar isso. Não é necessário fazer essa decisão para revisar/testar os
caminhos OFF e as alterações de duração/invalidação desta mudança.

Roteiro verificável: validar prova de servidor e limites em mocks; verificar
elapsed durante8h simuladas e término da lease; disparar todos eventos com editor
fora da árvore e confirmar revoke/readyfalse; confirmar ausência de autoridade
após processo novo, revalidação com epochnovo e ausência de auto-rearm. Depois,
somente build/aparelho autorizados, testar Doze, clock, logout/disk/transport,
process death/reboot e notificação real. Mocks e build não comprovam som/despertar.

Fonte oficial do clock usado:
https://developer.android.com/reference/android/os/SystemClock#elapsedRealtime()
