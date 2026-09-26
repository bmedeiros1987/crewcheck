# CrewWatch — Galaxy Watch compatibility matrix

Issue: #799

O CrewWatch Wear OS é somente renderer da projeção canônica. Nunca interpreta PDF, recalcula APZ, fronteira de jornada, repouso/compliance, portão ou pernoite.

## Ownership

Esta PR é estritamente periférica. `android-wrapper/app/**`, `client/**`, PWA, Activity/Manifest/shortcuts/resources e implementação do Device Hub no telefone pertencem ao **CrewCheck Mobile Core**. O lado Wear mantém somente o responder de telemetria e a especificação portátil do protocolo.

## Baseline Galaxy Watch4+

O APK mantém **Wear OS API 30+** (`minSdk 30`) para cobrir Galaxy Watch4 e posteriores.

| Família | Tamanhos representativos | Gate CrewWatch |
| --- | --- | --- |
| Galaxy Watch4 / Watch4 Classic | 40, 42, 44, 46 mm | APK + sync básica + offline/stale + rotary quando disponível |
| Galaxy Watch5 / Watch5 Pro | 40, 44, 45 mm | mesmo baseline |
| Galaxy Watch6 / Watch6 Classic | 40, 43, 44, 47 mm | bezel/rotary |
| Galaxy Watch7 / Watch Ultra | 40, 44, 47 mm | round/high-density |
| Galaxy Watch8 / Watch8 Classic | geração Wear OS atual | One UI Watch atual |
| Galaxy Watch9 / Watch Ultra2 | 40, 44, 47 mm | geração atual |

## Contrato round-first

1. Informação operacional primária fica dentro da safe area circular.
2. Padding escala com largura/densidade; nada assume 450×450.
3. Valores críticos usam tipografia grande e no máximo duas linhas.
4. Navegação aceita touch/swipe e rotary/bezel quando presente.
5. Haptics são confirmação discreta, não decoração.
6. AOD mostra só informação essencial e evita trabalho de background desnecessário.
7. Estados vazios/stale/offline são explícitos e nunca viram tela em branco.

## Gate funcional

Validar em perfis representativos:

- Free: Watch Face + Agora/Jornada/Escala + apresentação/voo/rota/pernoite;
- Premium: roster básico preservado + CrewLife/Concierge/smart departure/Live Ops conforme entitlement;
- Free ↔ Premium sem apagar cache básico;
- fresh → stale → offline → fresh;
- telefone foreground/background/process-dead, usando somente projeção já validada;
- swipe/rotary, haptics e AOD;
- complications úteis no Free;
- nenhum payload de API paga é requisito para Free.

## Device-status

O protocolo diagnóstico está documentado em `docs/peripherals/device_status_v1.md`.

Wear responde a `/crewcheck/watch/device-status/request/v1` em `/crewcheck/watch/device-status/response/v1`, ecoando o nonce opaco da requisição e enviando apenas telemetria mínima: modelo/fabricante, versão do CrewWatch, bateria, geometria round e timestamps de frescor do último snapshot validado. Não envia conteúdo da escala, credenciais ou saúde bruta.

O botão/Activity/shortcut/UI `Testar sincronização`, geração/persistência do nonce e a janela de timeout do lado telefone são **handoff para Mobile Core**. A trilha periférica não implementa esses componentes.

## Physical release gate

Não mergear candidato apenas por CI/emulador. Antes do merge da #773 é obrigatória validação em Galaxy Watch físico: Free/Premium, upgrade/downgrade, offline/stale, AOD, swipe/rotary/haptics, complications, bateria/clipping e telefone em foreground/background/encerrado.
