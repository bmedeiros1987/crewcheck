# CrewCierge — atualização Wellhub e autorização da fonte

## Situação e escopo separado

A PR #984 corrige o vazio de Fortaleza e o fallback de GPS expirado; permanece independente. Esta proposta parte da main `5fc76a09e568de215b7a0b6cec9a50c9fa139fa7`, sem copiar catálogo/commit da #984. Não publica serviço, não configura fornecedor e não adiciona credenciais, permissões, dependências, infraestrutura ou custos.

Não é possível afirmar "sempre atualizado" com a fonte hoje disponível. O leitor legado consultava até 40 páginas individuais em paralelo quando havia modalidade, com cache em memória de 12h. Não consultava a fonte em buscas sem modalidade, não atualizava mínimo/condições e não descobria unidades fora do catálogo. Disponibilidade de HTML e palavras na página não comprovam modalidade/plano. Não havia deduplicação de chamadas em andamento ou backoff próprio para 429. Nenhuma dessas limitações deve ser apresentada como atualização automática de catálogo.

## Regra de acesso verificada em 10/10/2026

Fonte primária: https://wellhub.com/pt-br/terms/, seção "Quais são as restrições que tenho ao usar os Serviços?". A página restringe coleta de páginas/dados tanto por meios manuais quanto automatizados e armazenamento de conteúdo. Aplica os termos também à navegação no site e limita o uso pessoal/não comercial. Não foi encontrado acordo que permita ao CrewCheck realizar coleta periódica/republicação. Não se infere autorização pelo fato de uma ficha ser pública.

`robots.txt` não pôde ser verificado: browser de pesquisa não disponibilizou o recurso e o executor recebeu CONNECT tunnel 403 do proxy. Isso não é apresentado como uma proibição do robots do Wellhub. Não houve tentativa de contornar esse resultado, disfarçar User-Agent, usar proxies alternativos, API privada, login/check-in ou motor de pesquisa pago.

A restrição impede implementar/ativar o coletor contínuo pedido usando essas páginas. A PR remove a coleta HTML legada; `live:true` não pode mais autorizá-la. Preserva a consulta ao catálogo já existente e sua validade/condições. A autorização para atualização/reutilização periódica da fonte segue como bloqueio a resolver com o fornecedor; a revisão da PR #984 também deve considerar essa constatação antes de publicar os dados. Esta proposta não decide juridicamente a reutilização de fatos públicos do snapshot.

## Comportamento implementado agora

Servidor e CrewCierge retornam somente o snapshot com sua data original por unidade, `liveVerified:false`, `refreshStatus:authorization-required`, `accessConfirmationRequired:true` e `snapshotValidUntil` (90 dias existentes). HTTP informa `automaticRefresh:false`. Nenhuma consulta ao Wellhub ocorre, inclusive com modalidade/live=true, sem timeout/retry inútil contra uma fonte não autorizada. Não se avança `verifiedAt` pela execução da busca ou pelo cache.

Planos continuam cumulativos e cidade/UF são filtrados antes da resposta. Regras de modalidade já verificadas no snapshot continuam funcionando. Modalidades sem regra comprovada, condições especiais, data futura/inválida ou fonte vencida permanecem desconhecidas. A mensagem informa catálogo parcial, ausência de atualização automática e confirmação no app Wellhub. Rotina informa data da unidade e exige confirmar acesso/horários/condições. Nenhum resultado vazio é convertido em incompatibilidade ou unidade de outra cidade. Dados de conta/GPS não são transmitidos.

## Plano factível quando houver fonte autorizada

Preferência: feed oficial autorizado para uso/reutilização pelo CrewCheck, consumido pelo servidor já existente e sem serviço novo. Alternativa: arquivo estruturado que o fornecedor autorize distribuir e atualizar. A alternativa deve trazer evidência de permissão, esquema, limites, licença/validade e versão. Nenhuma configuração arbitrária de URL/flag "enabled" será tratada como autorização. Não há feed gratuito autorizado identificado nesta investigação; não se presume preço, disponibilidade ou permissão.

Após definição concreta dessa fonte, implementar adapter separado e revisado com:

- ID estável e URL oficial por unidade; cidade/UF/endereço, mínimo de plano, exceções, regras de atividade e data da consulta validados juntos. Feed desconhecido/ambíguo não promove acesso.
- Cache compartilhado usando armazenamento existente, sem usuário/plano/GPS nas chaves ou requests; uma consulta em andamento por unidade/versão, validade limitada pela licença e TTL, tamanho e volume limitados. Recebimento/attemptAt não substitui verifiedAt.
- Refresh diário máximo por unidade, somente a partir de fonte autorizada. TTL inicial de 24h para sucesso e 1h para indisponibilidade, ajustado aos limites do fornecedor. Sem polling de catálogo mundial a cada mensagem.
- Timeout total e de corpo (até 5s), corpo limitado, concorrência no máximo 2, orçamento global e backoff exponencial até 24h com jitter. Respeitar Retry-After em 429/503 e não repetir em 401/403. Redirecionamento fora da origem aprovada, desafio anti-bot ou necessidade de login interrompem a consulta; nenhum contorno.
- Atualização atômica somente após validação de identidade/local/regras, mantendo a última versão e a data original no fallback. Dados vencidos/permissão vencida/alteração ambígua tornam acesso desconhecido; nunca certeza em cima de cache velho. 404 não é sozinho prova de encerramento/parceria removida.
- Data por unidade, idade/fonte/status visíveis no CrewCierge; acesso sempre sujeito à confirmação no app Wellhub. Descoberta de novas unidades só pelo feed autorizado, nunca inferida pelo nome da rede.

Os testes deverão usar fornecedor sintético: concorrência/cache hit, TTL, rollback, 429/Retry-After, 401/403 sem retry, timeout/corpo excessivo, cidade/UF contraditória, planos/condições alterados, modalidade, fonte fora da allowlist, versão inválida e nenhuma saída privada. Adaptador fica indisponível até revisão da fonte e do código. Não existe coletor desativado que possa ser habilitado silenciosamente nesta PR.

## Evidência e revisão

Teste negativo na base: uma sequência de buscas de modalidade/live=true tentou 15 fetches; mock bloqueou todos. Candidato deve fazer zero. Nova regressão executa o search/API/formatter reais e verifica ausência de falsificação de data, TTL, hierarquia/modalidade e avisos. Dados/transportes são sintéticos. A regressão v14407 contém uma asserção legada por token `cc-v14407:concierge-gyms` inexistente no apply da própria base; não é gate aceito sem atualização independente. Gates vigentes DF, v14410, conversas, plano, build/TypeScript e source-policy raw/compilada devem passar.

Draft aguardará revisão independente e CI do SHA exato; não há merge/deploy ou atualização automática ativa.

Validação local da proposta: source-policy raw/compilado PASS (zero fetch), DF/v14410 PASS, conversas 18/18 raw/compiladas e plano/persistência 13/13 raw/compilados; build canônico e TypeScript PASS. Workflow dedicado evita disputar o workflow da correção imediata #984. Logs locais ficam em /tmp/crewcheck-source-*. A revisão da fonte autorizada e a implementação do adapter continuam bloqueadas, sem promessa de refresh ativo.
