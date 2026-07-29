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

## Ordem de execução

- [x] Confirmar repositório, branch e baseline da `main`.
- [ ] Registrar a saída de referência de uma escala oficial no checkout
  integral.
- [ ] Executar TypeScript completo, build Web e smoke test do servidor.
- [x] Aplicar a classificação única de Folga/Descanso × Programação.
- [ ] Comparar quantidade de atividades, datas, horários, origem, destino e
  continuidade antes/depois com a escala oficial.
- [x] Corrigir App Shell, menu, largura, scroll e identificação do usuário.
- [ ] Revisar textos prioritários em pt-BR.
- [ ] Auditar chave, restrições e serviços realmente usados pelo Google Maps.
- [x] Manter Bruno e Daniel em variáveis de voz independentes.
- [ ] Validar desktop, Android e iPad em tema claro e escuro.

## Fora do escopo por enquanto

- reconstrução do FlyDeck;
- nova Central Admin;
- Locais Próximos completo;
- novas integrações;
- mudanças profundas no parser;
- deploy sem validação.

## Bloqueios externos

- GitHub Actions continua sem créditos; os jobs encerram antes do checkout.
- O ambiente Work possui acesso ao repositório pelo conector, mas não recebeu
  um checkout privado integral. Por isso, build completo, smoke do servidor,
  comparação com PDF oficial e validação visual permanecem pendentes.

## Regra de segurança

Nenhuma correção visual pode alterar quantidade de atividades, datas, horários,
apresentação, origem, destino, continuidade, pernoite, reserva, sobreaviso ou
virada de meia-noite.
