# CrewCierge via WhatsApp: caminho existente e bloqueios

Análise em 21/10/2026 sobre main `daed8971d0161767937c8bbd76f97a415d81b0e5`, em clone íntegro isolado. Não houve leitura de segredos, configuração de conta, chamada de mensagens, teste real, migração de número ou ativação. Despertador por ligação é outra frente e permanece inalterado; o usuário informa que funciona.

## Entrada, motor e saída

| Caminho | Implementação atual | Limite |
|---|---|---|
| Meta legado | `/api/whatsapp/webhook`, GET challenge e POST com HMAC Meta `x-hub-signature-256`; `server/whatsapp.mjs` responde por Graph `/messages` | Não é transporte Infobip |
| Infobip | `/api/infobip/whatsapp/webhook` e `/delivery`; `server/infobip-whatsapp-runtime.mjs` | O bootstrap canônico chama `createInfobipWhatsAppRuntime()` sem argumentos: 503/OFF antes de ler body, env, credenciais ou pool |
| Composição candidata explícita | TLS verificado, Basic antes do body, JSON limitado, lote de um evento; store transacional | Não registrada como runtime habilitado em produção; não existe env que a ative sozinha |
| CrewCierge | `configureWhatsAppConcierge` / `invokeConfiguredWhatsAppConcierge`; callback materializado usa `conciergeLoadSnapshot` e `buildTelegramConciergeReply` | Mesmo motor, sem parser paralelo nem identidade derivada só do telefone |
| Saída Infobip candidata | `server/infobip-whatsapp-transport.mjs`: base HTTPS da conta + `POST /whatsapp/1/message/text`, autorização `App` | Request injetado; entrada de produção fica desabilitada; sem fallback Meta |

O endpoint de saída coincide com o [SDK oficial Infobip gerado de OpenAPI](https://github.com/infobip/infobip-api-java-client/blob/master/src/main/java/com/infobip/api/WhatsAppApi.java#L2085). Isso confirma o contrato geral, não a habilitação do sender, chave, base URL, custo ou routing desta conta. Não foi repetido GET/POST real da conta.

O vínculo reutiliza `/api/whatsapp/link/start`, sessão autenticada, consentimento do Concierge e código temporário de uso único. O candidato revalida titular, sender, destinatário, revisão e revogação sob locks. Claim e fila são duráveis; tentativa incerta não é reenviada. Aceitação `PENDING_ACCEPTED` não equivale a entrega; DLR autenticado exige correlação estrita. Texto clássico está coberto; menus/PDF não são ativados por essa preparação.

## Autenticação: lacuna concreta

O receiver Infobip implementa **Basic**, separado do HMAC Meta. Não implementa um verificador HMAC Infobip. Se o perfil real estiver em HMAC, simplesmente habilitar a composição não o torna compatível: ele falha fechado na autenticação. Não há fallback para corpo sem autenticação.

A [documentação oficial atual](https://www.infobip.com/docs/subscriptions/subscription-components#request-signing-and-verification-authentication-settings) descreve assinatura sobre bytes brutos, algoritmo do perfil e cabeçalho padrão `X-Hub-Signature`. As páginas consultadas não permitem comprovar encoding/prefixo e envelope efetivos do perfil desta conta. A especificação/vetor sintético solicitados no caso de suporte continuam necessários para implementar e validar esse contrato sem adivinhação. Não substituir HMAC por Basic como contorno e não reutilizar o verificador Meta.

## Evidência de conta versus hipótese

A atualização do suporte no caso 5517884, comunicada pelo coordenador em 21/10 às 07:23 UTC, informa Full access já existente à WABA/app, inexistência de Messaging Account separado e ausência de partner solution/Tech Provider Program. Informa também que o envio do número passa pela Infobip, explicando o erro `#200` no POST Meta. São informações do suporte, não validação independente da conta nesta auditoria. Não usar a orientação anterior para ampliar permissões.

Não foram reinspecionados portal, credenciais ou configuração real de subscription/profile nesta rodada. Registros históricos de URL/auth vazios não provam estado atual. O fato comprovado no código é a composição Infobip OFF e o receiver candidato Basic-only.

## Correção restrita de diagnóstico

`/api/whatsapp/health` anteriormente dizia “pronto” somente pela presença de variáveis Meta. A correção acrescenta `provider=meta_cloud_api`, `configurationOnly=true` e `deliveryProof=not_checked`, com mensagem que não afirma envio/entrega. Flags legadas de presença são preservadas; não há request ao fornecedor. O roteiro de produção foi identificado como exclusivo da Meta. Nenhuma rota, consentimento, autenticação, transporte ou gate foi habilitado.

PRs abertas #888 e #926 foram conferidas: menus/PDF/guardas continuam nelas, sem hunk de health nem reutilização de suas branches antigas. #740 e #1039 também permanecem frentes separadas. Não há motivo para criar outro motor ou menu aqui.

## Próximo passo mínimo

Conferir **somente leitura**, no perfil/subscription que realmente recebe este sender: URL e tipo de autenticação, algoritmo/header/formato de assinatura, eventos `INBOUND_MESSAGE`/`DELIVERY`, event format e filtros sender/application/entity, regras de ACK/retry e limites de lote/timeouts. Confirmar base URL e presença da chave WhatsApp sem revelar valores. Não alterar nem salvar nada no portal.

Com o contrato efetivo e o vetor sintético já pedidos ao suporte, comparar o envelope com o parser clássico e preparar o adapter de autenticação estrito que faltar, ainda OFF. Se o perfil for Basic, comprovar isso antes de afirmar compatibilidade; se for HMAC, implementar seu contrato comprovado. Configuração real, bootstrap habilitado e teste de conversa pago exigem etapa operacional específica e não foram executados.

## Validação desta rodada

Candidate, persistence e runtime OFF passaram no main auditado, com dependências sintéticas e transporte mock. O teste de persistence atravessa o callback canônico materializado com snapshot/builder sintéticos. Não valida dados reais do motor nem conta Infobip. O MySQL real histórico não foi reexecutado nesta rodada e não é apresentado como PASS novo. A correção do health será revalidada na fonte preparada e no CI do draft, sem ativação/publicação do canal.
