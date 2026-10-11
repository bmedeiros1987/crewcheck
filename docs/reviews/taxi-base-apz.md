# Táxi separado das refeições — candidato bloqueado para merge

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
as ordens. Uma segunda saída independente no dia preserva a primeira linha
conhecida e gera pendência de múltiplos trajetos; não fica silenciosamente
descartada. Não modifica nem descarta lançamentos reais de recibos.

Chegada final à base na janela é registrada como pendência, sem transformar
hora de chegada ou motores cortados+30 em APZ. Falta definição explícita do
horário de chegada/liberação aplicável. A ordem dos eventos não permite que
essa pendência suprima uma saída comprovada na mesma data. A chegada pendente
também não é apagada pela saída conhecida: os agregados permanecem incompletos. Sem tarifa ou com
critério de chegada pendente, os agregados ficam incompletos, preservando as
refeições calculadas e evitando total financeiro aparentemente confiável.

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
confirmação/período e pendências monetárias/chegada. Executa em UTC, São Paulo
e Tóquio, raw e preparado. Revisão independente achou dependência da ordem
chegada→saída, corrigida e coberta. O gate financeiro existente foi ampliado.
As expectativas do teste de relógio mantêm café/ceia e agora exigem total
incompleto quando o novo táxi não tem tarifa/critério confirmado.

Bloqueios: definição da chegada e política de dois trajetos; validar formato
textual da extração PDF real na frente documental (sem copiar dados pessoais);
revisão do HEAD final e CI terminal. Sem merge/deploy/serviço ou alteração de
configuração Render. Ownership limitado ao cálculo, biblioteca financeira e
regressões; nenhuma alteração de layout, Radar, MCC ou preparação.

Revalidação privada: leitura autenticada de texto da Library com o documento
resolvido exercitou `learnPerDiemStatement` real e extraiu TAXI (`amount`) e
CAFE (`meal`) como categorias distintas, não confirmadas, com período limitado.
Valores iguais não fundem as rubricas. A transferência de bytes pelo helper
oficial falhou; portanto não foi possível executar o extrator PDF do app neste
executor. O texto nativo não é prova de paridade de extração. O total declarado
nesse texto foi corretamente mantido em revisão, sem fabricar confirmação.
Texto e relatório privado ficam fora do repositório; não há fixture de dado real.
