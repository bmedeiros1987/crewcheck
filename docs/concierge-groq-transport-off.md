# Transporte Groq isolado, OFF

Branch independente sobre main `71f1878495293160079b2a0fad876365e7ec2fdd`. Não contém nem altera o HEAD `693df833` da #1203 em revisão. Antes da edição foram conferidos main, #1203, #1135 e PRs relacionadas #864/#909/#910/#1191; não foi encontrado transporte Groq concorrente. #1203 contém somente o provider sintético; nenhum de seus arquivos é editado aqui. Não foram encontrados AGENTS.md ou skills locais em .agents/skills. Os quatro arquivos desta entrega são novos.

## Contrato e limites

`createGroqHttpTransport()` retorna uma capability OFF. Ativação exige `enabled:true`, credencial explicitamente injetada e função `fetchImpl`; não existe fetch ambiente como default, leitura de env, SDK, inicialização automática ou callsite.

O transporte recebe `(request,{signal})` e retorna somente o conteúdo JSON textual **não confiável**. O host/provider futuro continua responsável pelo schema, allowlist de ferramentas, argumentos vazios, autorização, fatos e renderer. O transporte não implementa classificação natural, roteamento operacional, cálculos, conversa ou fallback textual. Erros têm códigos fixos `GROQ_*`, sem payload, causa, chave, pergunta, corpo upstream ou stack upstream; o módulo não chama console. Isso não certifica logging de infraestrutura ou de um futuro host: estes também não podem registrar request/response.

- URL fixa `https://api.groq.com/openai/v1/chat/completions`; POST, `redirect:error`, `credentials:omit`, sem streaming. 3xx, resposta marcada como redirecionada ou URL diferente são recusados.
- Allowlist de modelo: somente `openai/gpt-oss-20b`; modelo diferente ou `synthetic-groq-contract` é recusado. O provider da #1203 ainda usa o modelo sintético: conectá-lo futuramente exige mudança explícita/revisada dessa configuração, não reescrita oculta no transporte.
- Duas mensagens, system e user, com campos conhecidos; corpo UTF8 máximo 512 bytes. Isso é limite de bytes, não medição exata de tokens do protocolo/modelo.
- Até 128 tokens de completion; corpo HTTP até 8192 bytes e conteúdo até 128 bytes. MIME, Content-Length, leitura chunked e UTF8 são verificados; JSON externo e conteúdo devem ser válidos, com uma única resposta assistant terminada em stop. Truncamento, tool_calls e refusals são recusados. Schema semântico não é garantia do transporte.
- Timeout máximo de 1000ms inclui fetch e leitura do corpo, com AbortController e race. Resposta tardia é cancelada. Fetch que ignora cancelamento mantém o slot fechado até terminar, impedindo substituição concorrente.
- Sem retry, fila, polling ou failover. 429 instala cooldown a partir do recebimento, respeitando Retry-After numérico/data; mínimo conservador de 60s para valor ausente/inválido. Falha de relógio nessa admissão mantém o circuito fechado.
- Uma chamada por capability por padrão; teto configurável de 20, reservado antes do await e consumido também em falhas. É orçamento por instância, **não quota diária persistente nem limite financeiro distribuído**. Recriar instâncias/reiniciar/múltiplas réplicas não preserva esse contador; isso bloqueia ativação de um host sem orçamento global adequado.

O erro de transporte deve cair no fallback determinístico existente quando houver integração autorizada. Nenhum texto do modelo deve ser mostrado como fato. Não há integração nesta entrega.

### Correção da revisão: 429 recebido depois de timeout/abort

A revisão independente reproduziu no HEAD03a29a2f que o abort-check descartava um 429 tardio antes de registrar seu cooldown. Os quatro novos casos RED reproduzem timeout e abort, cada um com Retry-After em segundos e em data HTTP: a segunda chamada fazia HTTP indevido. A correção mantém a verificação de origem/redirect primeiro, admite somente os headers de 429 antes de abandonar a resposta cancelada, e cancela o corpo sem lê-lo. O caller já concluído mantém o erro original TIMEOUT/ABORTED; o slot liberado não apaga o cooldown. Os testes verificam zero leituras do corpo, cancelamento e nenhuma chamada durante todo o intervalo, inclusive no mesmo clock e em expiry−1ms. A suíte passa agora 66 testes. Nenhum retry, loop ou callsite foi acrescentado.

## Testes sem rede

`node --test scripts/regression-groq-transport-off.mjs` usa somente módulos nativos do Node e mocks de Response/ReadableStream. Fetch ambiente é proibido antes do import; toda credencial e pergunta são sentinelas fictícias. A suíte verifica OFF, contrato de envio, modelos/payloads proibidos, cópia imutável de orçamento, redirects, HTTP/rede, cooldown, clocks, concorrência, abort, fetch/corpo pendentes, resposta tardia, tamanhos, UTF8/JSON, ausência de console e ausência das sentinelas em erros/stack/cause. Não mede latência ou qualidade de modelo real e não prova compatibilidade com uma organização Groq real. A CI roda em Node22 sem instalar dependências.

## Composição seguinte, sem duplicar #1135

1. Depois da revisão/integração da #1203, adaptar explicitamente seu provider para o modelo permitido e injetar este transporte. Preservar modo OFF e limites; não apresentar confirmação de intenção já reconhecida como compreensão natural.
2. Em entrega separada, acrescentar classificação mínima `nextDuty.read | schedule.read | clarify | unsupported`, sem argumentos livres, prosa ou fatos do modelo. O contrato atual apenas confirma um enum local e não realiza essa etapa. Enviar inicialmente somente frases sintéticas. Texto real continua potencial dado pessoal mesmo após redução/redação; autorização e decisão de privacidade são pendentes.
3. #1135 permanece draft HEAD `373b2bb2`, base `965a48c4`, autor verificável bmedeiros1987; não há owner separado comprovado nos comentários. Coordenar o hunk com esse responsável. `scripts/concierge-temporal-dialogue/apply.mjs:6–8` injeta `.handle` em buildTelegramConciergeReply; preservar seu retorno quando tratado. Novas paráfrases entram somente no retorno null, dentro do `run` admitido, mantendo `protect`, `validate`, `checkNow` e a revalidação do sender. Não criar outro router/ingresso temporal. Para intenções já consumidas por `.handle`, será necessário callback revisado no próprio owner.
4. App precisa de host com owner/sessão autenticados no servidor, revisão/hash da seleção e revalidação após await. Extrair núcleo read-only; o endpoint ask inteiro não é ferramenta, pois aceita localização com gravação e pode alcançar consultas externas. Não fabricar identidade Telegram. Offline permanece no leitor local da #1203.
5. Portões e financeiro ficam fora desta allowlist. Sua inclusão exige capabilities autorizadas específicas, origem/data/fuso explícitos, motores determinísticos e coordenação com owners de Radar/financeiro; não chamar ask, Radar externo ou calculadora pelo texto do modelo.

## Condições antes de qualquer ativação

Credencial e configuração futura seriam exclusivas do host servidor, nunca VITE/client/storage/logs. Nenhuma env ou secret foi criada nesta entrega. Antes de testar um modelo real: autorização explícita, confirmação do Free tier e quotas efetivas da organização no Console, controles de dados, modelo permitido, orçamento global e avaliação sintética. Nenhum upgrade pago ou retry automático.

Referências oficiais consultadas em 23/10/2026: [quotas](https://console.groq.com/docs/rate-limits), [billing](https://console.groq.com/docs/billing-faqs), [dados/ZDR](https://console.groq.com/docs/your-data), [API](https://console.groq.com/docs/quickstart). Não foram criadas contas/chaves, concedidos acessos, transmitidos dados reais, ativada IA, enviadas mensagens ou realizado merge/deploy.
