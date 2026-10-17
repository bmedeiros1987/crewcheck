# Táxi separado das refeições — APZ na base, uma diária por dia

Base inicial: `72ca637642a5f7e6c1f40917bb21e1b2089f838f`.

O cálculo de diárias e o leitor de demonstrativos reconheciam apenas café,
almoço, jantar e ceia. O teste sintético novo falha na base: TAXI não é
extraído; o caller real também não tem caminho que gere essa verba.
PR960 tratou presença na base para café e excluiu transporte/táxi.
A busca de PRs por taxi não encontrou correção equivalente.

Este candidato extrai `per_diem.taxi` como `amount`, separadamente de café,
mesmo quando valores coincidem. Não confirma automaticamente a tarifa.
O armazenamento por conta, revisão e período continua obrigatório; somente
uma tarifa BRL de táxi explicitamente confirmada no período gera previsão.
Não aplica percentual de refeição, piso ACT, valor global ou fator de feriado.
Importar um valor não cria lançamento pago ou altera documento real.

A regra operacional fornecida pelo usuário é APZ entre 00:00 e 05:45,
inclusive, na base. Para saída, o caller usa a apresentação publicada no
relógio canônico da escala BRT (UTC-03). APZ ausente/estimada e intervalos
incompletos continuam pendentes. Reserva aeroportuária na base pode fornecer
apresentação; sobreaviso, hotel e passagem intermediária não geram deslocamento.
Deduplica a mesma ocorrência por identidade de jornada/registro e APZ.
Reserva+ativação comprovada no mesmo intervalo são um deslocamento, em ambas
as ordens. Conforme correção explícita posterior de Bruno, o teto é uma diária
de táxi por dia operacional BRT, inclusive com várias APZ independentes.
Seleciona a primeira ocorrência comprovada de forma determinística, sem pendência
por segunda APZ. Não modifica lançamentos reais de recibos.

Táxi considera somente APZ na base entre 00:00 e 05:45 inclusive. Chegada de voo
não gera elegibilidade nem pendência, conforme instrução mais recente que substitui
a interpretação anterior. Sem tarifa confirmada ou APZ comprovada, os gates
financeiros existentes continuam válidos. As refeições mantêm seus próprios
critérios de presença/chegada, sem alteração pelo táxi.

Fontes públicas consultadas em 11/10/2026:

- [ACT TAM Comissários 2025/2027](https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf), cláusula3.3.7, página18.
- [ACT TAM Pilotos 2025/2027](https://aeronautas.org.br/wp-content/uploads/2025/12/20251209-ACT-Aeronautas-Pilotos-25-27_v13-site.pdf), cláusula3.3.7, página22.
- [CCT SNA/SNEA Regular 2025/2026](https://aeronautas.org.br/wp-content/uploads/2026/01/2025.12.30-CCT-25-26-AERONAUTAS-para-site-1.pdf), cláusula3.3.7, página12.

As cláusulas tratam da divulgação de horários/locais da condução fornecida.
Não foi encontrada nelas confirmação do corte05:45 ou tarifa de táxi terrestre.
Logo a fonte da janela é o usuário; não se atribui homologação ACT ao critério.
A evidência documental privada recebida pelo analista comprova categoria
separada, mas não APZ preenchida ou tarifa universal. Nenhum PDF, identificador
pessoal ou lançamento real foi incluído no repositório.

Validação: `regression-taxi-base-apz.mjs` exercita o leitor e o caller real,
com fixtures sintéticas: limites00:00/05:45/05:46/23:59, base/fora, overnight,
APZ ausente/estimada, reserva/extra/sobreaviso, duplicados, café separado,
confirmação/período, teto diário e chegada sem elegibilidade/pendência. Executa em UTC, São Paulo
e Tóquio, raw e preparado. Revisão independente achou dependência da ordem
chegada→saída na versão anterior; a instrução posterior remove completamente a chegada do táxi. O gate financeiro existente foi ampliado.
As expectativas do teste de relógio mantêm café/ceia e agora exigem total
incompleto quando o novo táxi não tem tarifa confirmada.

Gates finais: revisão do HEAD atualizado para a regra APZ-only e CI terminal.
Sem merge/deploy/serviço ou alteração de configuração Render. Ownership limitado
ao cálculo, biblioteca financeira e regressões; nenhuma alteração de layout,
Radar, MCC ou preparação. Os critérios de chegada/múltiplos trajetos deixaram
de ser questões abertas após a instrução explícita de Bruno.

Revalidação privada: leitura autenticada de texto da Library com o documento
resolvido exercitou `learnPerDiemStatement` real e extraiu TAXI (`amount`) e
CAFE (`meal`) como categorias distintas, não confirmadas, com período limitado.
Valores iguais não fundem as rubricas. A transferência de bytes pelo helper
oficial falhou; portanto não foi possível executar o extrator PDF do app neste
executor. O texto nativo não é prova de paridade de extração. O total declarado
nesse texto foi corretamente mantido em revisão, sem fabricar confirmação.
Texto e relatório privado ficam fora do repositório; não há fixture de dado real.

Correção complementar de ingestão: o total vigente pode usar o rótulo
`Total depositado na data AAAA-MM-DD R$ ...`. A data precisa ser válida e
corresponder à única data válida declarada em `Pagamento em` do documento.
Repetições do mesmo pagamento são aceitas; declarações divergentes ou inválidas
são revisão obrigatória, independentemente da ordem das páginas. Totais depositados com data
anterior são históricos e não substituem nem somam o total do pagamento atual;
adiantamentos de despesas e seus subtotais não são depósitos atuais. Totais
iguais repetidos por paginação contam uma vez; valores atuais divergentes,
data futura/inválida/sem pagamento declarado e dinheiro malformado continuam
em revisão, sem total numérico. Não houve remoção do gate de warnings.

O handler `confirm` agora aplica a mesma trava de revisão obrigatória do botão,
impedindo bypass programático com tarifas válidas e total inválido. O teste
`regression-taxi-import-confirmation.mjs` gera PDFs exclusivamente sintéticos,
usa o corpo exato do extrator PDF.js6.2.108, o leitor, a árvore renderizada do
componente com hooks controlados, callbacks reais de importação/revisão/confirm
e armazenamento real em memória. Não é teste visual de navegador.
Confirma tarifa somente após revisão de fonte na conta vigente, com período e
proveniência válidos. Casos negativos cobrem total/intervalo/proveniência,
troca de conta, rotação de token e visitante. Não confirma pagamento bancário.

Revisão independente externa comunicou paridade real do extrator do app com
bytes oficiais do documento privado no SHAf2ccd91e, detectando o blocker de
rótulo de total que motivou este complemento. O extrator não foi alterado.
Nenhum PDF privado ou seu texto foi transferido ao repositório/CI.

## Revalidação em 17/10/2026 sobre o Home atual

Main fixada em `0ebf8ec62c068f9ee44c09e28985ac7d9e212321`; candidato original reaproveitado `c708cc6f9e0b7b22de593b899e98c3a7020f1ea2`. Nenhum outro executor ativo ou movimento da branch observado. Merge normal da main sem conflito, preservando os componentes/navegação do Home1054, cálculos posteriores, privacidade financeira e dependências já integradas. O delta de Home contra a main permanece restrito ao import, configuração e caller de cálculo do táxi; não altera seu JSX/layout.

Reprodução sintética na main: `CAFE R$ 1.2,34` produz tarifa 12.34 com confiança alta e nenhuma advertência; `Pagamento em 2026-02-31` produz data impossível sem advertência. A data impossível no período já gera advertência na main e é mantida coberta como não regressão. A implementação da1018 já resolve os dois casos reproduzidos: tarifa malformada ausente e revisão obrigatória; pagamento inválido sem data/total e revisão obrigatória. Não houve reescrita do parser ou da regra de táxi.

As regressões existentes foram ampliadas com esses valores exatos, dinheiro com agrupamento correto/incorreto, zero e ano bissexto válido. PDFs sintéticos passam pelo extrator PDF.js, leitor e handlers reais: tanto o botão quanto a chamada direta de confirmação permanecem bloqueados para dinheiro/data/período inválidos. O caso válido continua exigindo revisão explícita de fonte e respeita owner, sessão, proveniência e vigência.

O harness antigo esperava o helper `money`, renomeado na main para `formatMoney` com o hook de privacidade. A fixture foi alinhada ao AST atual e executa o modo visível; o hook real/DOM oculto continua coberto pela regressão de navegador compilado. A limpeza dos efeitos entre montagens sintéticas conserva os listeners reais de auth sem vazamento da fixture. Nenhuma assertion de confirmação ou isolamento foi retirada. Os testes raw/preparados e três zonas de tempo continuam no workflow existente.

Somente fixtures sintéticas; nenhum documento ou dado real, flag, credencial, permissão, custo, loja ou serviço novo. Revisão independente do novo HEAD e CI terminal são necessários antes de merge; esta atualização não integra nem publica a PR.
