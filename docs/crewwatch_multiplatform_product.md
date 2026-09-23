# CrewWatch — produto e arquitetura multiplataforma

## Objetivo

Transformar o CrewWatch em uma linha de produto, e não em uma tela reduzida do CrewCheck.

A regra de produto é simples:

- **Watch Face grátis:** aquisição, marca e utilidade diária sem assinatura.
- **Aplicativo CrewWatch Premium:** operação contextual, escala, alertas, CrewLife e Concierge.
- **Mesmo contrato de dados, renderizadores nativos por plataforma:** Wear OS agora; watchOS, Garmin Connect IQ e outros depois.

## 1. Camadas do produto

### Watch Face grátis

Pacote Wear OS separado: `com.crewcheck.watch.app`.

O mostrador precisa funcionar sozinho. Ele não depende do APK Premium para renderizar:

- hora e data;
- passos;
- bateria;
- próximo evento do sistema;
- identidade visual CrewCheck discreta.

Quando o CrewWatch Premium estiver instalado, o usuário pode escolher as complicações CrewCheck manualmente no editor do mostrador.

O mostrador não recebe escala bruta, credenciais, CPF, e-mail, quarto de hotel ou dados brutos de saúde.

### CrewWatch Premium

Aplicativo Wear OS associado ao CrewCheck mobile, mantendo o pacote `com.crewcheck.app`.

Superfícies atuais:

1. **Agora** — próxima ação operacional.
2. **Jornada** — timeline do dia.
3. **Alertas** — somente exceções relevantes.
4. **Escala** — programação detalhada.
5. **CrewLife** — resumos autorizados de bem-estar.
6. **Concierge** — ações e voz.

O acesso ao APK é um entitlement Premium. O snapshot enviado ao relógio leva `premiumAccess`. Para plano grátis, o celular envia apenas um envelope mínimo de acesso; a escala operacional não é transmitida.

## 2. Contrato canônico

A fonte do produto é `client/src/lib/watchContext.ts`.

Nenhuma plataforma de relógio deve:

- interpretar PDF;
- reconstruir jornada;
- recalcular apresentação/APZ;
- recalcular compliance;
- inferir portão ou pernoite.

Cada relógio apenas recebe e apresenta uma projeção canônica compacta.

Isso permite trocar o renderer sem duplicar regra de negócio:

```
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

Implementação atual. Watch Face Format para o mostrador e app nativo para Premium.

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
- portão/status;
- pernoite;
- notificações.

CrewLife avançado e Concierge entram somente quando a plataforma permitir uma experiência boa.

## 5. Entitlements

Servidor:

- `watchFace = true`
- `watchApp = premium`

Regra de privacidade/monetização:

- plano grátis nunca recebe roster operacional no APK Watch;
- downgrade sobrescreve o snapshot Premium por envelope mínimo;
- preview de Play/complications pode usar apenas dados de demonstração;
- dados de saúde continuam em canal separado e opt-in.

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
- snapshot antigo;
- upgrade Free -> Premium;
- downgrade Premium -> Free.

## 7. Critério de qualidade

Uma tela do CrewWatch só entra em produção se responder imediatamente:

1. **O que está acontecendo?**
2. **O que eu preciso fazer agora?**
3. **Qual é o próximo passo?**
4. **Os dados estão atualizados?**

Se uma informação não ajuda uma dessas respostas, ela não deve competir pelo espaço principal do relógio.
