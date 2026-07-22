# CrewCheck Life — Premium First-Run Experience

## Product intent

CrewCheck Life must feel like the first minutes with a newly acquired premium personal device: calm, intentional, personal, polished and immediately useful. This is not a copy of Apple visual assets or trade dress. It is a CrewCheck-native experience built around clarity, restraint, motion, privacy and personalization.

Tagline:

> Sua escala organiza o trabalho. O CrewCheck Life ajuda a organizar sua vida.

## Core principles

1. One decision per screen.
2. Spacious layout with short, human text.
3. Immediate visual response to each choice.
4. Optional, granular permissions.
5. No permission request before explaining the benefit.
6. Health data is used only for the user's own routine guidance.
7. The user can skip, revisit, disconnect and erase at any time.
8. No diagnosis, no fitness-for-duty conclusion and no medical wording.
9. Recommendations must explain the data used.
10. Denying health permissions must never block CrewCheck Life.

## Entry experience

### Scene 1 — Welcome

Full-screen, minimal, with subtle motion.

Title:

**Bem-vindo ao CrewCheck Life.**

Body:

Organize descanso, estudos, atividade física e tempo pessoal ao redor da sua escala.

Primary action: **Começar**
Secondary action: **Agora não**

### Scene 2 — Personal promise

Title:

**Criado para a sua vida. Não para observar você.**

Body:

Seus dados servem exclusivamente para melhorar suas próprias recomendações. Não usamos informações de saúde para publicidade, comparação entre usuários, estatísticas coletivas ou diagnóstico.

Action: **Entendi e quero continuar**
Link: **Ver como meus dados são usados**

### Scene 3 — Choose goals

Title:

**O que você quer aproveitar melhor?**

Selectable cards:

- Descanso e sono
- Estudos e concentração
- Academia e esportes
- Alimentação
- Organização do dia
- Lazer e tempo pessoal

The continue button updates with the selection count.

### Scene 4 — Routine personality

One question per page:

- Quando você normalmente acorda realmente descansado?
- Você estuda atualmente?
- O que você estuda?
- Quanto tempo rende bem em uma sessão?
- Qual modalidade esportiva pratica?
- Quanto tempo costuma treinar?
- Você prefere uma rotina mais estruturada ou flexível?

Every question is skippable.

### Scene 5 — Health connection

Title:

**Deixe o CrewCheck Life entender melhor seus momentos de descanso.**

Body:

Com sua autorização, o CrewCheck pode ler apenas informações úteis de sono e atividade física já existentes no seu dispositivo. Você escolhe o que compartilhar e pode revogar o acesso quando quiser.

Android primary action: **Conectar ao Health Connect**
iOS primary action: **Conectar ao Apple Saúde**
Secondary action: **Continuar sem conectar**

Permissions are requested individually, only after this screen.

Initial read-only permissions:

- Sleep sessions and duration
- Sleep stages, when available
- Exercise sessions
- Steps and distance
- Resting heart-rate trend, optional and disabled by default

Do not request weight, BMI, glucose, blood pressure, fertility, medication, ECG or medical records.

### Scene 6 — First plan

The user receives an immediate personalized plan, even without health data.

Title:

**Seu CrewCheck Life está pronto.**

Example:

- Próxima apresentação protegida
- Meta de descanso reservada
- Melhor janela para estudar identificada
- Treino incluído somente quando não reduz o descanso

Primary action: **Ver meu dia**

Use a subtle completion animation and optional light haptic feedback on native apps.

## Daily home

The Life home must not look like a settings page. It should open with a human summary.

Example:

**Bom dia, Bruno.**

Hoje há uma boa janela para aproveitar o tempo sem reduzir seu descanso.

Timeline:

- 16:40 — Chegada estimada ao hotel
- 17:20 — Alimentação
- 18:10 — Estudo · 45 min
- 19:15 — Treino leve · 50 min
- 21:30 — Preparação para descanso
- 22:00 — Descanso protegido
- 07:30 — Despertar
- 08:35 — Saída para o aeroporto

Explanation card:

> Usei sua próxima apresentação, seu tempo de deslocamento, sua meta pessoal de sono e sua preferência de estudar após descansar.

Actions:

- Ajustar meu dia
- Como você calculou?
- Hoje prefiro descansar

## Recommendation states

Use only planning-oriented states:

- Rotina favorável
- Preserve seu descanso
- Descanso prioritário
- Boa janela para estudo
- Boa janela para atividade física
- Aproveitamento limitado
- Sem dados suficientes

Never use:

- Apto / inapto
- Diagnóstico
- Fadiga confirmada
- Risco clínico
- Condição médica

Permanent disclaimer:

> Orientação pessoal de planejamento. Não é avaliação médica e não substitui procedimentos oficiais.

## Visual direction

- CrewCheck identity, not imitation of Apple branding.
- Large typography with strong hierarchy.
- Generous spacing.
- One primary action per scene.
- Soft transitions between scenes.
- No long forms.
- No carousel of dense cards.
- No technical terms such as API, SDK or database in user-facing text.
- Dark and light modes must feel intentionally designed, never mixed.
- Accessibility: scalable text, screen-reader labels, reduced-motion support and high contrast.

## Native behavior

### Android

- Health Connect as the central health-data provider.
- Read-only permissions.
- Graceful fallback when Health Connect is unavailable.
- API 36 target.
- Haptic feedback only for completion and explicit confirmations.

### iOS

- HealthKit with granular read-only authorization.
- Same product flow and language as Android.
- No dependence on health permissions for core functionality.

## Privacy controls

Inside CrewCheck Life > Privacidade:

- Data sources connected
- Exact data categories authorized
- Last successful read
- Pause health reading
- Disconnect source
- Erase CrewCheck Life history
- Export personal preferences
- Revisit consent text

## Definition of done

The feature is complete only when:

- First-run flow works with all permissions accepted.
- First-run flow works with all permissions denied.
- User can skip every optional question.
- User receives a useful first plan without health integration.
- User can later connect or disconnect Health Connect/HealthKit.
- Recommendations visibly explain which data were used.
- No raw health stream is sent continuously to the backend.
- Existing CrewCheck schedule, login, PDF import and smart-departure flows remain unaffected.
