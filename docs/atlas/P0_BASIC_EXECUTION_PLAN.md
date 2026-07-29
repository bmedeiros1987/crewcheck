# CrewCheck Atlas — P0 básico

## Objetivo

Executar somente as correções essenciais e de baixo risco, com validação antes
de cada integração e sem alterar o motor canônico da escala.

## Baseline confirmado

- Repositório: `bmedeiros1987/crewcheck`.
- Branch principal: `main`.
- Base desta retomada: CrewCheck Web/PWA `14.3.49`.
- Commit-base: `ac6137f624cddd16f03781f08350c1657f55b3c8`.
- PR de trabalho: `#209`, branch `atlas/p0-basic-foundation`.
- A correção pendente do antigo PR `#198` foi portada, validada e integrada pelo
  PR `#201`; ela não bloqueia mais esta P0.
- As vozes de Bruno e Daniel já foram separadas na `14.3.48`, pelo PR `#202`.

## Escopo deste lote

1. Proteger o motor canônico da escala.
2. Separar Folga/Descanso de Programação.
3. Corrigir menu, largura, scroll e identificação do usuário.
4. Padronizar os textos mais visíveis em pt-BR.
5. Diagnosticar o Google Maps sem expor erro técnico ao usuário.
6. Manter as vozes de Bruno e Daniel independentes.
7. Transformar o FlyDeck em um briefing pré-programação conciso.
8. Corrigir gramática, números e objetividade do Concierge.
9. Impedir que uma localização antiga permaneça como cidade atual.
10. Exibir orientação permanente para conferência da escala oficial.

## Primeiro lote funcional — v14.3.50

Implementação real, ainda mantida como rascunho:

- cria uma classificação única de interface para `Programação`, `Folga`,
  `Descanso`, `Pernoite` e estado desconhecido;
- mantém separadas as decisões “conta como programação” e “exige
  deslocamento”;
- HSB não acionado e EAD continuam sendo programações publicadas, mas não
  acionam a Saída Inteligente;
- Folga, descanso e pernoite ficam fora da contagem de programações;
- o FlyDeck passa a mostrar o total de programações e, separadamente, folgas e
  descansos;
- o resumo de importação passa a informar programações, folgas, descansos e
  pernoites em linhas próprias;
- a Escala usa ícone de descanso e rótulo diário próprio, sem avião ou
  “programação” artificial;
- a Linha do Dia deixa de manter uma regex paralela e usa a mesma
  classificação;
- o voo em deslocamento `DH` permanece voo e não é confundido com código de
  folga.

## Validação executada neste lote

- sintaxe dos scripts v14.3.50;
- TypeScript isolado da classificação e da Linha do Dia;
- matriz comportamental para voo, MCK, HSB, HSB acionado, EAD, DO, DR,
  pernoite e placeholder;
- regressão específica v14.3.50;
- reaplicação idempotente;
- verificação estática de que o patch não escreve em parser, motor canônico,
  continuidade, financeiro ou regulamentação.

## Segundo lote funcional — v14.3.51

- o menu Web deixa de esconder nomes e descrições em tooltips e passa a usar a
  mesma lista legível de uma coluna do mobile;
- painel, cabeçalho e lista têm responsabilidades separadas: o painel contém, o
  cabeçalho permanece visível e somente a lista rola;
- o menu passa a ter largura previsível de até `440 px`, inclusive em iPad;
- o conteúdo principal fica centralizado e contido em até `1180 px`, sem
  overflow horizontal;
- o nome da conta autenticada tem prioridade sobre um apelido local antigo;
- nome, e-mail, função, base e plano disponível aparecem juntos na
  identificação do menu;
- o patch continua restrito à apresentação e não grava no parser nem no motor
  canônico.

## Validação executada no segundo lote

- sintaxe do patch v14.3.51 e da regressão;
- transformação idempotente da identidade, do marcador do App Shell e do CSS;
- precedência da conta autenticada sobre nome local;
- presença permanente dos rótulos do menu, sem dependência de hover;
- largura contida, lista de uma coluna e scroll vertical único;
- verificação estática dos arquivos protegidos do motor.

## Terceiro lote funcional — v14.3.52

- separa as chaves server-only de Routes, Geocoding e Places;
- impede o servidor de usar a chave pública `VITE_GOOGLE_MAPS_API_KEY`;
- documenta a chave de navegador necessária para Embed e Static Maps;
- deixa de montar iframe legado quando a chave pública não existe;
- mantém “Abrir no Google Maps” como saída permanente;
- troca estados indefinidos por mensagens finitas e prioritárias em pt-BR;
- registra o diagnóstico e a matriz de APIs/restrições sem copiar segredos.

## Validação executada no terceiro lote

- sintaxe do patch v14.3.52 e da regressão;
- separação idempotente das chaves por superfície;
- fallback de rota para falha de sessão, rede ou configuração;
- remoção de “Calculando” e “aguardando” nos estados finais da rota;
- verificação de que a chave `VITE_` permanece somente no cliente;
- verificação estática dos arquivos protegidos do motor.

## Quarto lote funcional — v14.3.53

- substitui os cards mensais e financeiros da tela inicial por um briefing
  operacional da próxima programação;
- mostra somente data, programação/rota, apresentação, início/partida,
  fim/chegada e portão/status;
- mantém um relógio de atualização e contagem regressiva em algarismos para
  indicar que o sistema está ativo;
- oferece ações diretas para consultar a escala, planejar a saída, abrir o
  Radar e revisar alertas;
- não apresenta o horário de apresentação como se fosse o horário calculado de
  saída;
- preserva a Linha do Dia logo após o briefing;
- mantém HSB e EAD como próximas programações quando publicados, mas sem
  ativar rota automática;
- remove indicadores mensais e atalhos financeiros da superfície operacional;
- inclui orientação visível de que a escala oficial e as comunicações da
  empresa prevalecem em caso de divergência.

## Validação prevista no quarto lote

- sintaxe e transpile isolado do novo briefing;
- transformação e CSS idempotentes;
- matriz mobile, iPad e Web em tema claro e escuro;
- HSB/EAD visíveis como programação e inelegíveis para Saída Inteligente;
- ausência de KPIs mensais, financeiro e horário de saída inventado no
  FlyDeck;
- verificação estática dos arquivos protegidos do motor.

## Quinto lote funcional — v14.3.54

- normaliza respostas textuais do Concierge em pt-BR;
- corrige construções como “as meio dia” para “às 12:00”;
- troca duração e contagem por extenso por formas rápidas como `1 min`, `2 h`
  e `3 etapas`;
- corrige singular e plural em respostas determinísticas;
- remove métricas técnicas de qualidade/fonte do Radar da mensagem enviada ao
  tripulante;
- acrescenta uma linha curta de confirmação da escala oficial somente nas
  respostas dependentes de escala, apresentação, saída ou regulamentação;
- preserva METAR/TAF bruto sem reescrever códigos;
- exige `updatedAt` real para usar localização persistida;
- invalida localizações legadas sem horário de captura, eliminando a
  renovação artificial de “Goiânia/GO” ou de qualquer outra cidade;
- mantém localização recente compartilhada no Telegram com validade de 6 h e
  localização Web/Android com a validade curta já definida na v14.3.46.

## Validação prevista no quinto lote

- matriz de gramática, algarismos, horários, singular/plural e indicativos de
  voo;
- preservação literal de METAR bruto;
- aviso oficial presente em `/hoje`, `/amanha`, `/proximo`, `/escala`,
  `/saida` e consultas regulatórias, sem poluir meteorologia;
- localização sem `updatedAt` tratada como vencida;
- localização recente aceita e localização com mais de 6 h rejeitada;
- transformação do servidor idempotente;
- verificação estática dos arquivos protegidos do motor.

## Ordem de execução

- [x] Confirmar repositório, branch e baseline da `main`.
- [ ] Registrar a saída de referência de uma escala oficial no checkout
  integral.
- [ ] Executar TypeScript completo, build Web e smoke test do servidor.
- [x] Aplicar a classificação única de Folga/Descanso × Programação.
- [ ] Comparar quantidade de atividades, datas, horários, origem, destino e
  continuidade antes/depois com a escala oficial.
- [x] Corrigir App Shell, menu, largura, scroll e identificação do usuário.
- [x] Revisar textos prioritários em pt-BR.
- [x] Auditar chave, restrições e serviços realmente usados pelo Google Maps.
- [x] Manter Bruno e Daniel em variáveis de voz independentes.
- [x] Projetar e implementar o briefing Premium do FlyDeck.
- [x] Corrigir gramática, números e objetividade do Concierge.
- [x] Corrigir a renovação artificial de localização legada.
- [x] Incluir orientação de conferência da escala oficial.
- [ ] Validar desktop, Android e iPad em tema claro e escuro.

## Fora do escopo por enquanto

- nova Central Admin;
- Locais Próximos completo;
- novas integrações;
- mudanças profundas no parser;
- deploy sem validação.

## Bloqueios externos

- GitHub Actions continua sem créditos; os jobs encerram com zero etapas,
  antes do checkout. O estado `failure` não representa execução nem resultado
  do código.
- O ambiente Work possui acesso ao repositório pelo conector, mas não recebeu
  um checkout privado integral. Por isso, build completo, smoke do servidor,
  comparação com PDF oficial e validação visual permanecem pendentes.

## Regra de segurança

Nenhuma correção visual pode alterar quantidade de atividades, datas, horários,
apresentação, origem, destino, continuidade, pernoite, reserva, sobreaviso ou
virada de meia-noite.
