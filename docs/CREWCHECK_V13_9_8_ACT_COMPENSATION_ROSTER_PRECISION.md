# CrewCheck v13.9.8 — precisão de diárias, salário, escala e iPad

## Regras financeiras implementadas

- Janelas inclusivas do ACT: café 05:00–08:00, almoço 11:00–13:00, jantar 19:00–20:00 e ceia 00:00–01:00.
- Em voo, a ceia considera apresentação até 30 minutos após o corte dos motores. Corte às 23:30 gera ceia; às 23:29 não gera.
- Café de voo somente quando a jornada parte da base contratual dentro da janela e não há café incluído.
- Pernoite fora da base gera apenas almoço e jantar quando atravessa as respectivas janelas. Pernoite na base não gera diária por si só.
- Reserva aeroportuária pode gerar as refeições atravessadas. Sobreaviso domiciliar sem acionamento não gera diária nem KM.
- Voo após acionamento recebe KM e diária normalmente; a parcela horária de reserva/sobreaviso permanece separada.
- KM noturno, extra/PS, domingo ou feriado configurado usa a tarifa dobrada sem contar o mesmo KM duas vezes.
- Conferência manual da indenização de R$ 700 por postergação do início da folga: acima de 4 h na regra geral ou de 12 h somente na hipótese excepcional comprovada do ACT.
- A comparação planejado x atual sinaliza possível garantia da parcela variável da escala inicialmente publicada, sujeita à causa prevista no ACT.

## Demonstrativo validado

O demonstrativo enviado (08/07/2026 a 14/07/2026, pagamento em 16/07/2026) foi convertido em fixture comportamental. O teste reproduz 11 itens e o total de R$ 1.039,68 usando refeição principal de R$ 109,44 e café de R$ 27,36. O ciclo quarta–terça e pagamento na quinta é apresentado como padrão observado no documento, não como regra universal imutável.

## Escalas validadas

- `CrewRosterReport`: 42 etapas lidas; continuidades LA3073 e LA3384 preservadas; ASB de 13 e 14/07 e RCFI de 15/07 lidos.
- `AIMS`: marcador de extra preservado em LA3978; duplicata contaminada de LA3237 em 02/08 removida.
- Dias 07, 11 e 23/07 aparecem pela continuidade física entre jornadas, sem serem convertidos em folga presumida.
- Uma data pode manter reserva e voo acionado como programações separadas.

## Interface

O menu em iPad/tablet usa modal amplo, duas colunas, abas fixas e rolagem apenas do conteúdo. A regra começa em 768 px e exige ponteiro coarse, preservando o layout específico de celulares.

## Referências operacionais

Os cálculos são apoio de conferência. Divergências dependentes de causa, função, município/feriado, operação efetivamente realizada ou exceção operacional continuam marcadas para revisão, sem gerar direito ou irregularidade automaticamente.
