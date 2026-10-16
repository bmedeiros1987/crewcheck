# Infobip: candidato completo, produção OFF

Base desta etapa: a4ea665f8e891abddfa4b50a7ad331f678ea356b.
Esta nota substitui as lacunas de implementação da preparação v4.

## Composição e ciclo de vida

`createInfobipWhatsAppRuntime()` é a chamada canônica de produção, sem argumentos:
OFF, sem configuração/env, body, pool, motor, transporte, timer ou lifecycle.
Somente uma chamada explícita com enabled:true e dependências injetadas compõe
o runtime completo. Não há flag de env que o habilite acidentalmente. Validamos
sender, chaves, credenciais Basic, origem e API key antes de agendador/ownership.
Isso é inicialização de código, não prova de readiness da conta ou custo.

Composição habilitável inclui borda HTTP: TLS direto ou verificador de borda
explicitamente injetado, nunca confiança automática em X-Forwarded-Proto;
POST/application-json, Basic antes de consumir body,64KiB/5s e batch1.
Recebe/commita antes do ACK; aciona drain durável de held. Agendador10s percorre
retenção em lotes20 e tenta um job por ciclo, recuperando fila após restart.
Múltiplas tentativas são protegidas por marker SQL anterior ao I/O. Uncertain
nunca retorna a held. Não há fallback Meta, retry de tentativa ambígua ou push.
Scheduler é gerenciado: dispose fecha ingresso/métodos, para timer, aguarda
operações em voo e libera ownership. OFF nunca inicia esse scheduler.

O motor é o handler canônico configurado por configureWhatsAppConcierge. A
composição não cria outro motor nem fabrica identidade pelo telefone. Vínculo,
consentimento, revisão e titular são revalidados sob locks. Motor tem deadline5s;
SQL usa prazo total8s e operação2s com cancelamento/destruição da conexão.
Reserva antes do send evita iniciá-lo no fim do orçamento SQL. Rede e SQL não
formam transação distribuída: abort/commit incerto continua sem retry.

## Novos vínculos, desvínculo e exclusão

O mesmo `/api/whatsapp/link/start` autenticado e consentConcierge=true emite o
código10min existente. Meta e Infobip compartilham completeCanonicalWhatsAppLink,
na transação limitada: código não expirado, perfil existente, conflito de telefone,
upsert de vínculo e consumo do código. Sem nova tela/opt-in por fornecedor.
Infobip autentica sender antes de completar prova, claim+link+confirmação são
atômicos. O código nunca vai ao motor ou job em claro. Confirmação é texto fixo.
Tentativas Infobip limitadas duravelmente a5 por telefone/sender em janela10min.
Replay não consome outro código nem recria vínculo. Troca de conta ativa falha.

Lifecycle instalado somente no runtime explicitamente habilitado. Desvínculo
autenticado chama limpeza; exclusão chama a mesma limpeza DENTRO do BEGIN da
transação canônica da plataforma e antes de apagar o perfil. Adapter real MySQL
participa da mesma conexão, sem commit/release interno. Deadline descarta conexão.
Revoga vínculo e códigos e limpa payload/ownerHash/correlação dos jobs do titular.
Locks permanecem até o COMMIT externo; rollback conserva vínculo e dados anteriores.
Assim novo código não pode concluir contra perfil apagado durante essa operação.
Sem lifecycle instalado, ambos hooks são no-op; não acessam pool/configuração.

Payload15min; tombstone72h; inbound48h+30s futura. Manutenção é gerenciada no
runtime habilitável; exclui markers só após horizonte que impede replay antigo.
Estados legados sem retainUntil são preservados para migração explícita, não
apagados por suposição. Encriptação e índices HMAC permanecem sem logs pessoais.

## DLR e URLs projetadas

Uma única URL aceita inbound e DLR clássico após autenticação:
`https://crewcheck.online/api/infobip/whatsapp/webhook`.
Alias dedicado opcional: `https://crewcheck.online/api/infobip/whatsapp/delivery`.
São URLs projetadas; não se afirma que estejam publicadas/configuradas/ativas.
Produção atual responde OFF quando materializada. Não configurar ainda.

DLR segue OpenAPI oficial results[], messageId/to/sentAt/doneAt/status. Só status
entregue exato sobe para delivered, correlacionado ao sender/recipient HMAC e
cc-eventKey de tentativa marcada. PENDING_ACCEPTED significa accepted_unconfirmed;
não entrega. SEEN/mistos/status desconhecido são recusados. Callback não cria envio.

## Verificação e ações operacionais restantes

Suítes sintéticas verificam composição, TLS/auth/body/batch, motor canônico,
retention, disposal, configuração inválida sem efeitos, lifecycle, DLR e guards.
SQL real do HEAD final usa MySQL oficial8.4.11 arm64 somente em datadir/socket
temporários, port0/XPluginOFF, sem autostart/Aiven. Harness confirma HEAD limpo,
marker de posse, socket/datadir/skip_networking antes de criar banco sintético.
Cobertura: concorrência, rollback/commit incerto, locks de revogação, novo vínculo
via start canônico→HTTP→SQL→confirmação mock, provas expiradas/conflitos/limite,
deadline real de lock, DLR, retenção/purga, exclusão no adapter/rollback e restart.
Nenhuma chamada externa de mensagens; motor/transportes externos são mocks.
O relatório externo registra resultados reais, HEAD e limpeza; não se transfere
automaticamente o PASS anterior b198 para este código.

Não restam stubs de implementação para esse escopo textual clássico. Antes da
ativação, faltam fatos/ações operacionais reais, que mocks não podem comprovar:

1. Confirmar sender do mesmo serviço CrewCheck, WABA/routing, subscription/profileId,
   eventos INBOUND_MESSAGE e DELIVERY e filtros sender/applicationId/entityId.
   SEEN não deve compartilhar entrega como se fosse DLR entregue.
2. Perfil: campos Webhook URL, Security settings/authId (Basic), Response regex,
   Response body regex, Max bucket size (1), Window size, Connect timeout,
   Read timeout compatível com ACK durável (pelo menos o orçamento8s mais margem),
   TLS protocols e rate limit. Somente nomes/presença de Headers; sem expor valores.
   Não criar header Authorization manual junto do Basic.
3. Confirmar formato efetivo de inbound/DLR e política de ACK/retry no perfil.
   Contrato clássico e retry geral41h30 não provam envelope da assinatura atual,
   ordering/exactly-once ou notifyUrl autenticado. Se o perfil divergir do contrato,
   manter OFF e obter exemplo sanitizado/documentação desse envelope.
4. Disponibilizar no bootstrap explicitamente autorizado as dependências já
   implementadas: enabled, db, request, concierge (padrão canônico), configuration:
   sender, encryptionKey, linkHashKey (mesmo segredo do vínculo atual),
   webhookUsername, webhookPassword, baseUrl, apiKey; verifyTls se houver proxy.
   Segredos apenas no gerenciador apropriado, nunca conversa/fixture. Não reutilizar
   credencial Voice. Verificar tabelas/permissões do pool sem migração automática.
5. Autorizar configuração, eventual custo, publicação/deploy e teste real limitado
   separadamente. Nada nesta entrega habilita conta/provider ou autoriza cobrança.
   Publicação OFF só após testes/revisão; operação real requer evidência própria.
