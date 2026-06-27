# CrewCheck v11.0.91 — Regulamentação confiável sem falsos positivos

## Hotfix v11.0.91

Correções principais:

- Recalcula a regulamentação ao abrir a tela de resultados, evitando cache antigo com alertas falsos.
- Recalcula escalas abertas pelo Gerenciador, inclusive as salvas no banco, usando o motor atual.
- Remove alerta automático de tempo em solo entre etapas.
- Tempo em solo não entra mais como jornada regulatória automática.
- Sobreaviso sem acionamento não entra como jornada mensal/semanal.
- Jornadas acima de 11h e até 12h não viram alerta automático; ficam fora da lista para reduzir ruído.
- Jornada só vira alerta de atenção acima de 12h, e irregularidade forte apenas em teto realmente alto.
- Detecta janela contaminada por continuação/pernoite no PDF e estima jornada pelos trechos para evitar 20h+ falsas.
- Repouso mínimo não é alertado quando a escala mostra continuação operacional na virada do dia com solo curto.
- Madrugada agora conta apenas voo que toca 00:00–06:00; folga, voo sem madrugada, reserva/sobreaviso sem acionamento e pernoite quebram sequência.
- Limite semanal/mensal de jornada fica como métrica, não como irregularidade confirmada automática.
- Siglas técnicas não classificadas deixam de aparecer como alerta ao usuário.

Android:

- versionName: 11.0.91
- versionCode: 11091
- produção premium com R8/ProGuard, shrinkResources e mapping.
