# CrewCheck Life Operations — Wellness Scheduler e calendário "Academia"

Fluxo: **escala oficial → repouso e janelas livres → compromissos pessoais → sono/recuperação (se autorizados) → decisão → Google Calendar "Academia"**, recalculado quando qualquer entrada muda.

## Fontes, em ordem de prioridade

1. Escala oficial importada (canônica do CrewCheck). Se divergir de outra fonte, a escala oficial vence.
2. Google Calendar do usuário: compromissos pessoais entram **apenas como intervalos ocupados**. Título e descrição não são lidos pelo motor.
3. Resumos de saúde já autorizados neste aparelho (Health Connect, CrewLife Companion ou registro manual): sono, FC de repouso, passos, minutos de atividade e treinos registrados. **HRV não é usado**, porque nenhuma fonte autorizada o fornece hoje.
4. Janelas de academia do relatório CrewCheck (`getGymRecommendations`): servem como **referência** e passam pelo motor. Nunca são copiadas diretamente.

Dado ausente aparece como **"Dado não disponível"**. Nada é inventado.

## Regras rígidas (preferências do usuário, editáveis)

| Preferência | Padrão | Efeito |
|---|---|---|
| `minimumRecoveryBeforeWorkoutHours` | 8 h | nenhum treino começa antes de C/O + 8 h |
| `minimumBufferBeforeDutyHours` | 4 h | o treino termina até a próxima apresentação − 4 h |
| `earliestWorkoutStart` / `latestWorkoutEnd` | 06:00 / 22:30 | protege o sono |
| `autoOrganize` | desligado | recalcula e sincroniza sozinho |
| `syncSchedule` / `syncAcademia` | ligado / ligado | escala em "Bruno & Marina", treinos em "Academia" |
| `useHealthData` | ligado | usa os resumos do relógio, se existirem |

Isso **não** é repouso regulamentar aeronáutico. É organização pessoal de bem-estar.

## Decisão (determinística, sem "score mágico")

1. Os segmentos livres do dia são o resultado depois de remover: jornada + 8 h, apresentação − 4 h e compromissos pessoais. O cálculo usa o fuso real do lugar onde o tripulante está; em pernoite em OPS, por exemplo, usa America/Cuiaba.
2. Nível base:
   - com referência do relatório: ideal → treino completo; bom → moderado; moderado → leve; limitado → recuperação;
   - sem referência: decide pela maior janela livre e pela carga da jornada anterior (jornada longa, 4 ou mais etapas, liberação na madrugada).
3. Ajustes sempre comparados à **linha de base do próprio usuário** (mediana dos dias anteriores, com no mínimo 3 amostras):
   - sono abaixo de 85% da linha de base: −1 nível; abaixo de 70%: −2;
   - FC de repouso mais de 5% acima da linha de base: −1 nível; mais de 10%: −2;
   - treino de 60 min ou mais ontem, ou dois treinos completos seguidos: completo vira moderado.
4. HSB limita o dia a recuperação perto de casa. ASB significa descanso.
5. Se a janela não comporta a duração prevista, a atividade é reduzida. Se nada cabe, a decisão é **descanso**, com o motivo explícito.

Saída por dia: decisão (`TRAIN`/`TRAIN_LIGHT`/`RECOVERY`/`REST`), intensidade, confiança, fatores ✓/⚠, janela, duração e motivo legível.

Títulos no calendário:

| Decisão | Título |
|---|---|
| Treino completo | 🏋️ Academia · Treino completo |
| Treino moderado | 🏋️ Academia · Treino moderado |
| Treino leve | 🚶 Academia · Treino leve |
| Recuperação | 🧘 Recuperação · Mobilidade / caminhada |
| Descanso | 😴 Descanso recomendado (dia inteiro, transparente) |

## Google Calendar

- **"Academia"**: localizado pelo nome exato entre os calendários próprios. Se não existir, é criado uma única vez (`calendar.app.created`; o corpo aceita só nome, descrição e fuso). O CrewCheck nunca apaga calendários.
- Eventos de bem-estar levam `extendedProperties.private`: `crewcheck=true`, `crewcheckDomain=wellness`, `crewcheckCrew=<pseudônimo>`, `crewcheckEventKey=wellness|AAAA-MM-DD` e `crewcheckHash`.
- **Upsert idempotente:**
  - evento igual: nada;
  - evento mudou: PATCH;
  - evento novo: POST;
  - evento que saiu do plano (de hoje até o fim da escala): DELETE;
  - evento pessoal, inclusive dentro de "Academia": ignorado.
- O sync da escala ignora eventos com `crewcheckDomain` diferente de `schedule`, e o sync de bem-estar não escreve no calendário da escala.

## Recálculo automático

Com "Auto-organizar" ligado e o Google conectado, o CrewCheck recalcula:

- ao abrir o CrewCheck Life;
- quando a escala, os dados de saúde ou as preferências mudam;
- a cada 6 h, para captar compromissos pessoais novos.

Isso roda **no aparelho do usuário**. Não há job no servidor, porque os dados de saúde não saem do aparelho.

## Privacidade

- Dados de saúde: leitura opcional, só do que o usuário já autorizou, guardados localmente.
- No Google vai apenas um resumo legível do motivo (por exemplo, "Sono abaixo do seu habitual").
- Não há diagnóstico médico, avaliação de aptidão nem uso trabalhista ou envio a empregador.

## Passos manuais

1. Google Cloud → Google Auth Platform → **Data Access**: adicionar `calendar.app.created` aos escopos `calendar.events.owned` e `calendar.calendarlist.readonly`.
2. **Audience** (enquanto o app estiver em Testing): incluir a conta do usuário em Test users.
3. No app: reconectar o Google Calendar para conceder os escopos novos.
