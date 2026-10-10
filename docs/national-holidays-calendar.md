# Feriados nacionais e calendário

Base de revisão: be292f81a7945c9a038d0cac95b53b8a8b421463 (main, confirmado em 10/10/2026).

O calendário civil compartilhado classifica os oito feriados fixos das Leis 662 e 6802 e 20/11 a partir de 2024 (Lei 14759). Não inclui Carnaval, Corpus Christi, Sexta-feira Santa nem pontos facultativos como feriados nacionais. Feriados estaduais/municipais dependem da base e continuam na lista manual `crewcheck_local_holiday_dates`. Domingo, feriado nacional e manual resultam em uma única classificação booleana.

Fontes oficiais:
- https://www.planalto.gov.br/ccivil_03/leis/l0662.htm
- https://www.planalto.gov.br/ccivil_03/leis/l6802.htm
- https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm
- ACT LATAM comissários 2025–27, cláusula 3.2.6, p.14: https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf#page=14

O ACT prevê dobra dos quilômetros voados nos domingos/feriados da base domiciliar e permite adoção de UTC pela empresa. Não há evidência aqui da opção efetiva da LATAM, de rateio ao cruzar meia-noite ou de combinação com adicional noturno. A correção preserva a política existente: data do início no fuso operacional e `premiumAllKm` encaminhando todos os quilômetros para `nightKmMetric`. Não introduz multiplicador independente nem afirma que a tarifa configurada corresponde à dobra contratual. A etiqueta legada “tarifa dobrada” permanece; não constitui reconciliação de holerite. Valores fixos, diárias, reserva, sobreaviso, chefia e instrutoria não recebem multiplicação.

No calendário da escala, domingos/feriados nacionais são sublinhados e usam `--ccr-cyan` nos numerais, mesmo sem eventos; hoje conserva seu fundo/cor, seleção conserva borda e foco conserva outline. A descrição acessível informa domingo/nome do feriado. A lista manual permanece financeira: não transforma uma data local não verificada em feriado nacional visual.

Validação: `node scripts/regression-national-holidays.mjs`, `node scripts/regression-salary-operational-clock.mjs`, preparação e build em checkout limpo. Fixtures financeiras são sintéticas (inclusive tarifa 2,7 para demonstrar o efeito exato da regra existente); não validam holerite nem aparelho físico. Revisão independente obrigatória antes de merge/deploy. AIMS967, Cirium/analyzeSafe e gateWear fora do escopo. O único contato com Home é uma importação e a classificação financeira materializadas pelo finalizador específico.
