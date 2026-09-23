# CrewWatch — produto e arquitetura multiplataforma

## Objetivo

Transformar o CrewWatch em uma linha de produto útil por si só, sem transformar a escala básica em paywall e sem duplicar regra operacional fora do CrewCheck canônico.

A regra de produto é simples:

- **Watch Face grátis:** aquisição, marca e utilidade diária sem assinatura.
- **CrewWatch grátis:** acesso útil à projeção canônica da escala no APK.
- **CrewWatch Premium:** recursos de saúde, Concierge, Saída Inteligente, Live Ops e integrações avançadas/custosas.
- **Mesmo contrato de dados, renderizadores nativos por plataforma:** Wear OS agora; watchOS, Garmin Connect IQ e outros depois.

## 1. Camadas do produto

### Watch Face grátis

Pacote Wear OS separado: `com.crewcheck.watch.app`.

O mostrador precisa funcionar sozinho. Ele não depende de assinatura Premium para renderizar:

- hora e data;
- passos;
- bateria;
- próximo evento do sistema;
- identidade visual CrewCheck discreta.

Quando o CrewWatch estiver instalado, o usuário pode escolher complicações CrewCheck compatíveis manualmente no editor do mostrador.

O mostrador não recebe escala bruta, credenciais, CPF, e-mail, quarto de hotel ou dados brutos de saúde.

### CrewWatch Free

Aplicativo Wear OS associado ao CrewCheck mobile, mantendo o pacote `com.crewcheck.app`.

O usuário gratuito deve conseguir usar o relógio de verdade. O APK recebe uma projeção canônica compacta e presentation-ready, incluindo:

- **Agora** — próximo passo útil;
- **Jornada** — timeline básica do dia;
- **Escala** — programação, voos, apresentação e pernoite;
- cache local/offline;
- estado de frescor/stale;
- sincronização básica relógio ↔ celular;
- complicações básicas derivadas somente dessa projeção.

Free não consulta API paga por conta própria e não recebe campos derivados de integrações custosas. Quando um dado tiver custo externo ou depender de um produto Premium, ele simplesmente não entra na projeção Free.

### CrewWatch Premium

Premium complementa a escala básica; não substitui nem bloqueia o APK Free.

Recursos Premium:

- **CrewLife / saúde** — somente resumos autorizados e agregados;
- **Concierge / voz** — ações rápidas, ditado e resposta no relógio;
- **Saída Inteligente / trânsito** — horário de saída e contexto de deslocamento;
- **Alertas inteligentes / Live Ops** — alterações e exceções contextuais;
- integrações avançadas ou de custo variável;
- campos operacionais derivados de provedores pagos quando aplicável.

O snapshot sempre leva `premiumAccess`, mas esse sinal é usado como entitlement por recurso. Não existe gate global impedindo o usuário Free de abrir Agora, Jornada ou Escala.

## 2. Contrato canônico

A fonte do produto é `client/src/lib/watchContext.ts`.

Nenhuma plataforma de relógio deve:

- interpretar PDF;
- reconstruir jornada;
- recalcular apresentação/APZ;
- recalcular compliance;
- inferir portão ou pernoite.

Cada relógio apenas recebe e apresenta uma projeção canônica compacta.

```text
CrewCheck canonical roster
        |
        v
watchContext snapshot
        |
        +--> Wear OS renderer
        +--> watchOS renderer
        +--> Garmin renderer
        +--> future adapters
```

O contrato deve separar duas classes de dados:

1. **core/basic** — roster canônico necessário para Agora/Jornada/Escala, disponível no Free;
2. **premium capabilities** — saúde, Concierge, smart departure, Live Ops e integrações de custo variável.

O renderer nunca decide regra comercial olhando para conteúdo textual. Ele consome capabilities/entitlements explícitos e deve continuar funcional quando um capability Premium estiver ausente.

## 3. Design system

### Princípios

- **glance first:** entender em 1–2 segundos;
- **uma ação dominante por tela;**
- **tipografia grande;**
- **estado > decoração;**
- **offline honesto;**
- **coroa/rotary, swipe e haptic como navegação natural;**
- **sem telas vazias:** sempre explicar o estado;
- **marca reconhecida pela linguagem visual, não pela repetição de logos.**

### Tokens principais

- fundo: navy quase preto;
- informação primária: branco;
- operação/sync: ciano;
- jornada/contexto: violeta;
- alteração/atenção: magenta;
- sucesso: verde;
- alerta: âmbar.

### Formatos

O conteúdo deve respeitar uma área segura central e não assumir cantos utilizáveis.

- **round-first:** Galaxy Watch, Pixel Watch, Garmin redondos;
- **rect-compatible:** Apple Watch e dispositivos retangulares;
- componentes compartilham hierarquia, não coordenadas fixas.

## 4. Portabilidade

### Wear OS

Implementação atual. Watch Face Format para o mostrador e app nativo para a experiência CrewWatch.

### watchOS

Renderer futuro em SwiftUI. Reutiliza o contrato canônico e a semântica dos estados, não o código Android.

Superfícies equivalentes:

- complications/widgets;
- app;
- Smart Stack quando aplicável;
- notificações contextuais.

### Garmin Connect IQ

Renderer futuro focado em baixo consumo e dados essenciais. A primeira versão deve priorizar:

- próximo passo;
- jornada;
- programação/voos;
- apresentação;
- pernoite;
- estado de sincronização.

CrewLife avançado, Concierge e integrações custosas entram somente quando a plataforma permitir uma experiência boa e o entitlement correspondente estiver ativo.

## 5. Entitlements

Contrato comercial portátil:

- `watchFace = true`
- `watchBasicRoster = true`
- `watchCrewLife = premium`
- `watchConcierge = premium`
- `watchSmartDeparture = premium`
- `watchLiveOps = premium`
- `watchAdvancedIntegrations = premium`

Regra de privacidade/monetização:

- plano grátis recebe roster operacional básico e cache offline;
- plano grátis não dispara API paga no relógio;
- campos Premium não entram na projeção Free;
- upgrade Free → Premium habilita capabilities sem recriar a escala;
- downgrade Premium → Free mantém Agora/Jornada/Escala e limpa caches Premium locais;
- dados de saúde continuam em canal separado, agregado e opt-in;
- preview de Play/complications pode usar somente dados de demonstração quando não houver projeção autorizada.

## 6. Matriz de homologação

Antes de declarar compatibilidade, testar fisicamente:

- tela pequena redonda;
- tela grande redonda;
- bezel/coroa/rotary;
- AOD;
- celular conectado;
- celular distante;
- app mobile em foreground;
- app mobile em background;
- app mobile encerrado;
- sem internet;
- snapshot antigo/stale;
- upgrade Free → Premium sem perder escala;
- downgrade Premium → Free mantendo escala e limpando CrewLife/Concierge/Live Ops;
- reinstalação/upgrade do APK mantendo cache seguro quando compatível.

## 7. Critério de qualidade

Uma tela do CrewWatch só entra em produção se responder imediatamente:

1. **O que está acontecendo?**
2. **O que eu preciso fazer agora?**
3. **Qual é o próximo passo?**
4. **Os dados estão atualizados?**

Se uma informação não ajuda uma dessas respostas, ela não deve competir pelo espaço principal do relógio.
