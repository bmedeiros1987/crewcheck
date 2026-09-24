# CrewWatch — produto e arquitetura multiplataforma

## Ownership

Esta trilha é dona somente dos renderizadores e protocolos do lado periférico: Wear OS, Watch Face, complications, Garmin/watchOS futuros, Android TV/LG TV e testes/fixtures desses consumidores. Ela **não** é dona de `android-wrapper/app/**`, `client/**`, PWA, shell nativo do telefone, Activities/Manifest/shortcuts/resources do app principal nem do produtor canônico no celular.

O contrato portátil esperado pelo periférico é documentado em `docs/peripherals/watch_snapshot_v1.md`. A implementação autoritativa do publisher/bridge do telefone pertence ao **CrewCheck Mobile Core**.

## Produto

- **Watch Face grátis:** hora/data, bateria, passos/evento do sistema e complications CrewCheck disponíveis sem Premium.
- **CrewWatch Free:** Agora, Jornada, Escala útil, voos, apresentação, pernoite, cache offline/stale e sync básica.
- **Premium:** CrewLife, Concierge/voz, Saída Inteligente/trânsito, alertas inteligentes/Live Ops e integrações avançadas/custosas.
- Premium é capability por recurso; nunca um gate global que remova a escala básica.

## Regra arquitetural

O relógio recebe somente uma projeção canônica pronta para apresentação. Nenhum periférico interpreta PDF, reconstrói jornada, recalcula APZ/apresentação, compliance, portão ou pernoite.

```text
CrewCheck canonical roster (Mobile/Server authority)
        |
        v
portable watchSnapshotV1
        |
        +--> Wear OS
        +--> Garmin Connect IQ
        +--> watchOS futuro
        +--> outros periféricos
```

Dados de saúde e Concierge usam canais separados do snapshot operacional. Assim, revogar Premium não remove a escala Free e não mistura dado sensível com o roster operacional.

## Design round-first

- leitura em 1–2 segundos;
- tipografia grande e área segura circular;
- uma ação dominante por tela;
- swipe + coroa/rotary/bezel + haptics discretos;
- AOD com informação essencial;
- estado offline/stale explícito e elegante;
- sem telas vazias ou dependência de cantos da tela;
- marca discreta, com clareza Apple-like e robustez Casio-inspired.

## Portabilidade

### Wear OS

Renderer atual. Watch Face continua grátis e útil. O app nativo consome `watchSnapshotV1` e canais Premium separados.

### Garmin Connect IQ

Implementação nativa em Monkey C. Primeiro Glance + Watch App, com D2 antes de fēnix/epix, Forerunner e Venu. Não portar APK. Watch Face Garmin somente após validar atualização/caching do snapshot.

### watchOS

Renderer futuro em SwiftUI usando o mesmo contrato portátil e sem reutilizar código Android.

## Homologação

Antes de merge/release, validar Free↔Premium, upgrade/downgrade, offline/stale, tela redonda pequena/grande, AOD, swipe/coroa/bezel/haptics, complications, bateria/performance e telefone em foreground/background/encerrado. A validação física obrigatória em Galaxy Watch continua bloqueante para #773.

## Fence de ownership

Qualquer necessidade de mudança no telefone gera handoff explícito para Mobile Core. A PR periférica pode conter especificação, fixtures e testes de protocolo, mas não deve implementar ou reintroduzir mudanças em `android-wrapper/app/**` ou `client/**`.
