# Infobip WhatsApp — contrato HMAC offline, produção OFF

Base: `792fd649cfd036be3a08365e971837037ef6b2e5`.
Reaproveita receiver, DLR, store transacional, motor e transporte existentes. Não
altera voz, contas, configuração, permissões, dados reais, bootstrap ou envio.
Inventário: nenhum PR HMAC/WhatsApp aberto foi encontrado; #872/#907 tratam outras
frentes, e #1170 já entregou o diagnóstico. Não substituir o menu WhatsApp #888.
Não há AGENTS.md nem `.agents/skills` no checkout isolado consultado.

## Evidência nova e limites

Suporte, ticket 5517884, mensagem de 21/10/2026 12:37:28 UTC (Gmail
`1a15e77739d186dd`): `x-hub-signature: SHA256=<64 hex>`, comparação sem distinção
entre maiúsculas/minúsculas; `secretKey` em UTF-8 literal sem trim, decode ou
normalização; assinatura dos bytes brutos completos do corpo antes de parse.
Headers não são assinados. Não há timestamp/nonce fornecido pelo protocolo.
O vetor exato foi recuperado pelo conector, sem abrir imagens de rastreamento.
Somente os valores explicitamente sintéticos foram incorporados aos testes.

O suporte informa os pares DELIVERY `delivery.whatsapp.v2.json`/`DLR_JSON_OMNI`,
SEEN `seen.whatsapp.v1.json`/`DLR_SEEN_WITH_CALLBACK_DATA` e INBOUND_MESSAGE
`inbound-message.whatsapp.v1.json`/`MO_OTT_CONTACT`, todos com `results[]`.
Isso não fornece os campos completos de cada item nem comprova a configuração
atual do perfil. O vetor de assinatura NÃO é schema real e deve continuar sendo
rejeitado pelos parsers de eventos. SEEN continua sem adaptação e nunca vira DLR.

## Alteração

`infobip-whatsapp-auth.mjs` centraliza o Basic já existente, preservando sua API
reexportada pelo candidato, e acrescenta HMAC SHA-256 com comparação de 32 bytes
em tempo constante. Recusa assinatura duplicada, Base64, prefixo/hex inválidos,
whitespace no header e corpo que não seja Buffer. Nada é logado ou descoberto em
env. O nome do header é insensível a caixa; headers adicionais não ganham autoria.

A composição offline recebe `configuration.webhookAuthentication` explícito:
`{mode:'hmac-sha256',secretKey:<string injetada>}` ou
`{mode:'basic',username:<string>,password:<string>}`. Sem esse campo, preserva o
caminho Basic anterior; não deduz o método pelos headers nem faz fallback. Os
primitivos são capturados em uma policy imutável. A configuração não é fornecida
pela rota pública nem por dados do webhook.

A borda mantém TLS, POST, JSON, 64 KiB/5 s e batch 1. Basic inválido continua
recusado antes da leitura. HMAC exige header sintaticamente válido antes de ler
o corpo limitado; verifica o digest ANTES de JSON.parse, seleção de evento ou
SQL. Os receivers também verificam sua autenticação na entrada. Nenhum gate de
conta/consentimento/schema/identidade foi relaxado.

`createInfobipWhatsAppRuntime()` de produção continua sem argumentos e fechado
OFF antes de body, configuração, credenciais, DB, scheduler ou rede. Somente a
composição explicitamente injetada dos testes exercita as policies novas.

## Replay e validação

HMAC válido não garante frescor nem uso único. Reutiliza claim durável por
sender/messageId, claim+enqueue atômicos, digest de conteúdo e revalidação do
vínculo. O namespace independe da credencial; rotação da chave não libera replay.
Idêntico é duplicata; mesmo ID com conteúdo diferente falha fechado. Janelas de
idade existentes e tombstones/retention permanecem inalterados. Não se inventa
nonce, timestamp ou nova tabela. DLR mantém correlação e monotonicidade existentes.

Testes novos cobrem vetor do suporte, caixa, bytes/Unicode/whitespace, headers
ambíguos, separação de métodos, captura da policy, autenticação antes do parse,
vetor fora de schema, concorrência/recriação/rotação/conflito e SQL guardado. O
cenário MySQL novo utiliza exclusivamente o harness já existente com socket,
datadir e HEAD comprovadamente próprios; execução é reportada separadamente, sem
atribuir ao mock evidência de durabilidade real.

## Gates que continuam abertos

1. Confirmar somente leitura a autenticação efetiva do perfil/subscription. O
   e-mail explica HMAC **quando habilitado**, sem demonstrar que já está ativo.
2. Obter/validar schema completo e roteamento dos renderers reais com amostras
   sanitizadas ou schema oficial; `results[]` e vetor criptográfico são insuficientes.
3. Revisar configuração e binding do sender, vínculo/consentimento de conta,
   endpoint de retorno e credencial outbound existentes, sem alterar nenhum deles.
4. Aprovação específica para qualquer mudança/ativação da conta ou mensagens
   faturáveis. Este draft não habilita bootstrap, assinatura ou canal.

Não houve mensagem real, chamada, consulta faturável, mudança de credenciais,
permissões, perfil ou ativação. #1172/#1173 e o despertador por ligação não foram tocados.
