# Extra a serviço: revisão independente

Base: `cea3bfff835707ac08e7a842b9ebdab373f2789a`. Branch isolada: `fix/extra-operated-flight-hours`.

## Problema e comportamento

O contador anterior somava todas as pernas, inclusive PS (passageiro/extra), para horas de voo. Além disso, `extractAimsPhysicalLegs` consumia o marcador `[extra]` no segmento anterior: o voo anterior recebia PS e o seguinte OP. O parser humano já tratava esse marcador como pertencente ao voo seguinte.

A correção interrompe o segmento físico antes de um marcador extra imediatamente seguido de `LA` e número de voo. Não infere papéis pela matrícula, número do voo, código de pareamento ou texto financeiro. Os contadores de voo operado excluem exclusivamente `workType=PS`, com normalização de espaço/caixa. DH e códigos não verificados conservam o comportamento anterior.

Jornada, trabalho, solo, madrugada, etapas, pousos, envelopes operacionais e peso de carga conservam todas as pernas. A carga informa separadamente voo operado e deslocamento extra. Não há novo bloco na home.

## Fontes e limites do escopo

- [Lei 13.475, arts. 4 §1, 34 e 41 III](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm): extra a serviço integra jornada/trabalho, mas não o limite de horas de voo operado.
- [RBAC 117 EMD01, A117.13(d), B/C117.25 e B/C117.27](https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf#page=22): distinção entre voo e trabalho.
- [ACT comissários 2025–2027, 3.3.17](https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf): referências 90/900 e 100/1000 conforme condições contratuais. Este PR não muda perfil, autorização ou limites.

O KPI civil permanece restrito à competência ativa; histórico anterior participa das janelas móveis. O kernel de 365 dias usa o mesmo fluxo filtrado, com máximo **observado** e indicador explícito de cobertura. Não cria alerta, margem anual, declaração de conformidade ou referência nova na UI. Dias ausentes não são presumidos como zero.

## Auditoria dos consumidores

| Consumidor de horas | Fonte após a correção |
| --- | --- |
| KPI da competência, buckets mensais, limite diário e janela de 28 dias | Voo operado, exclui PS |
| Histórico regulatório e métrica observada de 365 dias | Mesmo fluxo operado |
| Campo `flightHours` da análise de carga | Voo operado |
| Peso de carga e razão de deslocamento | Todas as pernas |
| Envelope, margens de jornada e fallback operacional | Todas as pernas via `getAirTravelHours` |
| Ativação de reserva | Todas as pernas; jornada preservada |
| Validação de relógio, solo, madrugada, etapas e pousos | Código anterior, todas as pernas |
| Salário/diárias | Chamadores e tarifas anteriores; eventos PS preservados |

O produtor `scripts/v14395/apply.mjs` também usa todas as pernas no fallback operacional. As demais chamadas geradas de `getFlightHours` continuam operadas. A preparação canônica precisa ser executada uma vez por checkout antes dos testes.

## Evidência e restrições

`scripts/regression-operated-flight-hours.mjs` contém somente identidade, números de voo e ano sintéticos. Exercita o parser completo, reconstrução física, dois extras totalizando 140 minutos, próxima perna OP, competência versus 28/365, fronteiras D28/D29 e D365/D366, cobertura ausente/zero explícito, histórico, carry-in sem duplicar, deduplicação canônica e chamador financeiro real. Repete UTC, São Paulo e Tóquio. As fontes de apresentação/corte utilizadas para medir jornada canônica são explicitamente sintéticas; o teste não afirma que importações sem essa proveniência estão confirmadas.

Os mesmos seis eventos continuam disponíveis ao financeiro. A regra existente de tarifa extra/DFS não foi alterada. **Corrigir os papéis pode mudar qual evento recebe essa regra preexistente**; não é garantia de valores idênticos aos de uma importação errada. Não há recalculação/escrita em dados de produção, migração ou atualização automática do histórico salvo.

Limitações preservadas: arredondamento anterior a uma casa por dia; fallback agregado sem pernas não permite comprovar PS; dados antigos com papéis incorretos precisam de reimportação da fonte. Proveniência de jornada ausente continua pendente. A correção do marcador não resolve outras ambiguidades de chegada versus corte no fallback legado.

O PDF privado foi materializado pelo helper oficial da Library, bytes verificados e página inspecionada localmente. Não integra Git, fixtures, screenshots de QA ou pacote de revisão. Nenhum envio de mensagens, alteração de credenciais/permissões/custos ou publicação em lojas.

## Gates de revisão

Revisar o diff autoral e os snapshots preparados do pacote contra o SHA exato do draft. Verificar preservação de jornada/fallback gerado, parser marcador anterior versus seguinte, separação financeira e cobertura de 365 dias. Conferir logs, hashes e relatórios sintéticos; QA Chrome não certifica Android físico. Merge e deploy dependem de revisão independente e gates do parent.
