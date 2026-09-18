# CrewCheck TV — LG primeiro, visitante por consentimento, Samsung depois

## Decisão de produto — 18/09/2026

Fechar a LG antes de Alexa, Fire TV e Home Assistant. Preparar Samsung como adaptação da mesma experiência, não como outro motor de escala. Diferencial proposto: acompanhar a rotina do tripulante em uma TV com visual de consulta rápida e compartilhamento controlado. Não afirmar exclusividade de mercado sem estudo.

Três experiências: **Meu CrewCheck** (titular); **Acompanhar alguém** (visitante autorizado, somente leitura); **Apresentação** (rotação/música/proteção opcionais sobre as informações permitidas). Não transformar o modo Família do token do titular em autenticação de visitante.

## Estado verificado nesta tarefa

Backend piloto PR #698: fonte 1885959f87582e342eb56edf6b2a7dc466afab46, deploy dep-damjsugae00c73bpapk0 listado como live. GET público /api/tv/status retornou 503 nesta verificação por TinyFish. Deploy live não significa pareamento saudável. Registros consultados contêm ER_CON_COUNT_ERROR às 13:39:04Z de 18/09; não atribuir a indisponibilidade atual ao mesmo erro sem correlação adicional nem encerrar conexões indiscriminadamente.

Existe modo visitante web e especificação de presença com permissões no projeto. A aba map examinada mostra aeroportos da programação; não comprova posição atual. LG 0.1.8 é o último pacote de correção disponibilizado; vínculo/escala real/revogação ponta a ponta na TV ainda não comprovados. A base Samsung examinada tem config.xml, required_version=7.0 e domínio de produção; não equivale a WGT assinado/testado nem conexão ao piloto.

## Escopo implementado

Código de servidor isolado e NÃO montado: server/tv/guest/policy.mjs e reader.mjs; projeção visitor.v1 distinta do TvSnapshot proprietário; view-model de leitura sem persistência. Sem alteração de auth existente, parser, APZ, escala, SQL, variáveis, banco, serviços, build IPK ou produção.

Cada leitura exige credencial de TV visitante validada pelo host; relação visitante/titular ativa; autorização explícita para TV; concessão ao dispositivo exato; igualdade dos identificadores; validade; tv:visitor:read como único escopo. Direitos são interseção da relação com a concessão da TV. O host deve persistir as três entidades e incrementar revisões nas alterações.

Depois de buscar dados, identidade e consentimento são reconsultados. Alteração/revogação/expiração durante I/O invalida a resposta, inclusive troca de concessão ou edição de permissão sem incremento de revisão. Erro de banco não libera acesso nem retorna perfil/escala como fallback. Handler GET somente, default-off, rate limit obrigatório, no-store.

## O titular escolhe

Todas as novas permissões começam desligadas; escolhas futuras por visitante E TV, período, duração, pausa e revogação:
- Nome/apelido escolhido, sem e-mail/CPF/perfil completo.
- Estado confirmado por check-in; nunca presumir sono.
- Cidade confirmada por fonte autorizada, data explícita, sem coordenadas.
- Destino previsto SEPARADO, rotulado como previsão na escala, não posição atual.
- Próximo voo, somente opt-in; programação não confirma decolagem.
- Retorno como estimativa recebida de fonte canônica, sujeito a alteração.
- Cidade/janela de pernoite já canônico, sem inferir hotel.
- Hotel e quarto separados; quarto exige hotel e registro compartilhável.
- Calendário apenas do período autorizado, tipos/datas; sem IDs/números de voo/hotel por esse direito isolado.
- Posição precisa somente opt-in próprio, fonte dispositivo e precisão/data válidas; nunca via escala.

map/roster/hotels antigos não concedem estes direitos automaticamente. Chat, financeiro, dados médicos, contatos alheios, PDF bruto e histórico de localização ficam fora. Cada fato deve ser autorizado e vinculado ao titular por adaptador do servidor. Não confiar em ownerId/source/sharedWithVisitors enviados pela TV. A biblioteca não coleta GPS nem resolve cidades. Fatos ausentes, vencidos ou incompatíveis são omitidos; resultado vazio é neutro, sem revelar informação oculta.

## UI e cache

Proposta para implementação seguinte: 1 destaque + até 2 cards por página, data da confirmação, previsão identificada e pausa pelo controle. Não deixar o painel proprietário atrás da tela visitante nem permitir ampliar direitos pelo controle. Música/canal/screen care não mudam consentimento.

Snapshot visitante máximo 60s, sem offline. View-model limpa ao vencer; adaptador de UI DEVE limpar também em erro, desconexão, ocultação, troca de conta e revogação, chamando read() por timer. Não usar cache de 15min do titular para localização visitante. Pausar rotação não pausa validação. Revogação impede novas leituras; sem rede conteúdo já desenhado pode persistir até 60s. Não prometer revogação instantânea offline. Prazos são decisões de produto, não garantias do fabricante.

## Pendências de ligação real

1. Estabilizar banco/pareamento proprietário, observar status e POST pair sob carga, preservar CORS e sessão.
2. QR/código, login retornando ao vínculo, aprovação legítima, comparação celular/TV de mês/jornada/APZ.
3. Sessão/renovação em armazenamento apropriado; não salvar token proprietário em localStorage para evitar QR.
4. Editor no celular e persistência de concessões; ligar à relação visitante existente, sem duplicar pessoas.
5. Montar endpoint atrás de flag separada só após testes de adaptadores, rate limit, CORS/CSRF, pareamento nominal e consumo único.
6. Player visitor.v1: limpeza em erro/offline/ocultar, troca de direitos e conta, controle remoto/Magic Remote na LG física.
7. Revisão independente, #530/#607 e checklist LG antes de loja.

## Critérios LG — não marcar sem evidência

- [ ] Pareamento/status estáveis, sem 503 sob carga representativa.
- [ ] Login retorna ao vínculo com código válido.
- [ ] Conta real correta: mês, próxima atividade e APZ conferidos celular/TV.
- [ ] Fechar/reabrir/suspender, renovação e revogação documentados/testados.
- [ ] Visitante sem token do titular; permissões por pessoa e TV.
- [ ] Cidade, coordenadas, quarto e voo respeitam negações individuais.
- [ ] Previsão versus confirmação, atualização e expiração visíveis.
- [ ] Pausa/revogação/remover visitante/troca de conta limpam a TV.
- [ ] Pausar tela, músicas, screen care opcional e claro/escuro preservados.
- [ ] Controle/Magic Remote, legibilidade e consumo testados no hardware.
- [ ] Sem valores fictícios ou Powered by sem fonte confirmada no candidato.
- [ ] Materiais e checklist de loja correspondem às funções efetivas.

## Samsung após LG

Reutilizar projeções, identidade, consentimento, canal e música. Adaptar remoto Back, ciclo de vida, áudio, armazenamento, permissões e layout para Tizen; revisar required_version pelo modelo-alvo. WGT assinado com certificado do titular e teste físico. IPK não instala em Samsung. Nenhuma assinatura ou submissão nesta entrega.

Fontes oficiais verificadas em 18/09/2026:
- https://webostv.developer.lge.com/distribute/app-self-checklist
- https://developer.samsung.com/smarttv/develop/getting-started/quick-start-guide.html
- https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html

## Reprodução

node --test scripts/tv-guest-test.mjs

27 testes determinísticos locais: interseção/identidade/validade/fontes/localização/datas/escopo temporal/redação de payload/revogação em I/O/endpoint/cache. Registros em memória e relógio de teste, não banco MySQL real, API implantada, conta do usuário, Chromium 53, certificados ou hardware.
