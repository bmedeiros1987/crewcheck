# Portão e notificações externas: evidência e limites

Base: main daed8971d0161767937c8bbd76f97a415d81b0e5, clone íntegro isolado. Relato: LA3622 CGH–SSA em 21/10/2026, sem portão; avisos internos e app próprio do relógio funcionam, mas nenhum aviso externo no celular. Não há resposta operacional desse voo capturada nesta auditoria. Nenhum teste de mensagem, consulta paga, mudança de permissão ou job real foi executado.

## Falha comprovada e correção

O cabeçalho `ATUALIZADO` em `scripts/v14353/flydeck-premium.snippet` usava `nowMs`, inicializado com `Date.now()` e renovado a cada 30 segundos. Não era timestamp do provedor, cache ou portão. A correção identifica `HORA LOCAL`, sem live announcement periódico, e explica a distinção no nome acessível. Não afirma fonte viva nem altera orçamento de consultas.

## Fonte → backend → cache → card

`fetchRadarSnapshot` chama `/api/radar-flight` somente com conta/sessão e ocorrência canônica admissíveis. O servidor confirma a escala autorizada e a ocorrência antes da corrida das fontes e novamente antes de exportar. O payload entra no cache por ocorrência; `radarGateInfo`/`resolveNextFlightGate` rejeitam outra data/rota, campos antigos, conflitantes ou sem evidência de observação. `updatedAt` do cache é recebimento e não prova observação do portão. Não remover essas guardas para preencher o card.

As fontes legadas retornam campos simples; a projeção pública não encaminha `operationalEvidence`. O contrato explícito `customGateSourceUpdate` é uma via existente de evidência de portão. Logo, resposta `ok:true` com `gate` simples não garante que a UI o aceite. Isso é limitação de integração comprovável em código, mas não prova que esse foi o retorno específico de LA3622. Cirium permanece OFF no bootstrap auditado; nenhuma chamada Cirium foi feita. O diagnóstico público `/api/radar-health` retornou `ok:true`, `configured:3`, `timeoutMs:2400`; isso confirma somente presença de configuração, não retorno, produto, cobertura ou entrega de campos.

Próximo dado necessário: resposta já recebida no dispositivo para a ocorrência exata, reduzida a `ok`, motivo de supressão, identificação/data/rota, presença de portão e metadados de evidência/observação, sem token, identidade pessoal ou nova consulta paga. Distinguir resposta ausente, fonte sem portão e campo descartado. Não criar evidência a partir do relógio HTTP/cache.

## Celular fora do app

O detector de mudança de portão é `saveRadarSnapshot` em Home; depende do código da página executar e detectar mudança entre portões válidos (primeiro portão não equivale a mudança). `publishCrewCheckNotice` separa Pulse interno de notificação do sistema. Política `background` exige `document.visibilityState === hidden`, preferência de dispositivo e permissão concedida; então tenta a ponte nativa e, como fallback, `new Notification`. Esse caminho não é produtor remoto independente do app fechado.

Há web push com registro por conta/instalação, consentimento, outbox e receipts; o produtor servidor encontrado em `server/web-push/bidsProducer.mjs` é de BIDs, não de portão. Não há integração de mudança de portão nesse produtor. Android possui receiver local; não foi identificado `FirebaseMessagingService`/`MESSAGING_EVENT` no app auditado. Isso não invalida avisos internos ou o app do relógio confirmados pelo usuário, e não comprova a permissão/configuração do aparelho atual.

Para fechar a causa individual faltam a superfície usada no celular (PWA/navegador/APK e versão), estado observado de permissão/app/canal, preferência local e registro/receipt da instalação quando aplicável. Ler esses estados não deve abrir prompt nem enviar aviso. Aceitação do provedor, tentativa da ponte e banner interno não comprovam recebimento externo. Telegram real de hoje 04:05 e ligação Infobip foram preservados, sem consulta ou alteração do job.

## Validação

Preparação canônica passou. Regressões briefing Premium, next-flight-gate (incluindo três fusos), gate-query-proof, radar-source-occurrence, pulse-live e web-push-offline passaram. RadarView React browser passou com conta/eventos sintéticos e rede somente loopback, cobrindo supressão, resposta tardia e troca de sessão/ocorrência. Revisão independente PASS para o delta restrito; não equivale a teste físico ou confirmação de dados ao vivo.
