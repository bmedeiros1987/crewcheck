# WhatsApp PDF: integração local revisável — 7 outubro 2026

A liberação Meta e o envio pelo WhatsApp são considerados confirmados pelo relato do usuário de 13:12 UTC. Não constituem bloqueio desta implementação. A confirmação não foi repetida com mensagens reais neste ambiente.

## Desenho e implementação

O fluxo foi ligado pela preparação canônica `scripts/p1-whatsapp-pdf/apply.mjs`. O gate independente `CREWCHECK_WHATSAPP_PDF_ENABLED === 'true'` permanece default OFF; nenhuma variável real foi alterada. O texto e o menu existentes continuam no fluxo protegido, e os gates de menu e PDF são independentes.

1. O webhook verifica assinatura e receiver. PDFs válidos de conta vinculada/consentida são gravados como jobs na tabela JSON existente antes do ACK. Banco indisponível retorna 503, permitindo retry. O caminho de texto continua com sua deduplicação existente.
2. O servidor existente drena a fila; um intervalo de 30 segundos só é criado quando PDF está habilitado. Não há serviço, cron ou worker Render novo. Jobs usam lease/CAS, até três tentativas e binding original. Uma troca de conta entre a checagem da fila e o início do importador também é rejeitada.
3. Mídia é obtida por ID com o receiver configurado. URLs do webhook são descartadas; download permite apenas HTTPS no host exato permitido, proíbe redirects e impõe limite streaming de 20 MiB, prazo, MIME, hash e magic bytes.
4. O parser é o canônico `server/rosterParser.mjs`, executado em worker terminável de 15 segundos/192 MiB. Avisos do parser não chegam aos logs públicos. Nenhuma fórmula ou regra de escala foi copiada.
5. Link/consentimento são rechecados e bloqueados na transação. Recibo idempotente e snapshot minimizado são gravados juntos. Não há DDL ou salvamento em arquivo como fallback. Replay após commit, incluindo interrupção antes de finalizar o job, não reativa escala antiga.
6. Ordem de documento usa timestamps do provedor quando disponíveis e ordem de recebimento. PDFs atrasados não substituem documento/roster mais recente. Uma nova escala do app é preservada.
7. Confirmação ocorre após finalização e nova checagem de binding/receiver. Exige timestamp de mensagem válido dentro de 23 horas; janela desconhecida, expirada ou futura não dispara envio. Não são usados templates. Há no máximo uma tentativa de confirmação por finalização; não há garantia de entrega nem reenvio automático de confirmação incerta.

## Cache e compatibilidade

Com PDF habilitado, `conciergeLoadSnapshot` e `conciergeSaveSnapshotAsync` usam banco como fonte canônica para app, Telegram e WhatsApp. Escritas preservam preferências e se serializam no mesmo snapshot. Um cache legado da própria conta pode ser reconciliado sob lock quando ainda não há snapshot durável ou quando ele é mais antigo; cache de outra conta nunca é migrado. Snapshots marcados como duráveis/importados sempre ganham do arquivo. Falha de banco não vira leitura/escrita local de fallback nesse modo.

Com o gate OFF, os testes verificam o caminho atual de texto/menu e os helpers antigos. Antes de eventual rollout, é necessário homologar MySQL real isolado e planejar rollback: desligar o gate também devolve os helpers ao modo legado; após novas importações, não se deve fazer essa transição sem sincronizar caches ou manter a leitura durável. Esta fase não ativou o gate, não migrou dados reais e não mudou o serviço em execução.

## Consultas e limites financeiros

Hoje, Amanhã, Escala e Próxima programação usam o mesmo produtor canônico que o Telegram. Diárias tem equivalência operacional: pernoites detectados e indicação do módulo financeiro. Não calcula valores monetários nesse fluxo; o menu foi corrigido para não prometer isso. Não há importação de holerite, auditoria financeira completa ou novas fórmulas nesta entrega.

## Evidência

Node22.13.0, mesma versão do CI. Suítes de PDF/pipeline, parser real com PDF fictício, integração assinada/fila/cache, consultas A/B, menu, dedup, binding, diagnósticos, SOS, farmácia/GPS, formato de horário e jornadas canônicas passam. O teste canônico real preserva o voo fictício BSB→GRU e período 10/2026 e rejeita arquivo malformado. Fixtures comprovam ACK após persistência, retry após falha, recuperação de lease, rollback, concorrência, revogação, relink, janela desconhecida/expirada, documento atrasado e preservação de escala mais nova.

Wellhub materializado: 18/18 nesta branch e na main isolada. O harness montado sem preparação completa fica em 17/18 em ambas, com a mesma falha de onboarding de nome; é uma divergência preexistente de montagem da fixture, não uma regressão desta integração. O CI remoto deste patch não foi executado: publicação Git permanece bloqueada pelo helper de autenticação ausente.

As transações foram exercitadas em banco simulado, não em MySQL real. O parser real e os produtores de consultas foram executados em fixtures fictícias. Nenhum dado de usuário real, mídia real, credencial de produção ou serviço Render foi acessado/modificado.

## Teste real autorizado

Uma mensagem “Teste do Concierge CrewCheck” ao número do próprio usuário terminado em 1663 foi autorizada. Não houve tentativa: token/remetente não estão configurados no executor local; as ferramentas disponíveis não oferecem envio WhatsApp; o código expõe saúde/vínculo/webhook, sem rota avulsa com prova de remetente e janela gratuita. Não foram buscadas novas credenciais nem improvisado acesso ao serviço. Provider ID/status de aceitação/entrega: indisponíveis, pois nada foi enviado. Esse bloqueio de acesso ao teste não contradiz o funcionamento confirmado pelo usuário.

Referências primárias de mídia: [Media API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api) e [Media Download API](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api).
