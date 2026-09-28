# CrewCheck v13.6.8 — Frontend Stable Rollback + Static Server Shell

## Objetivo
Destravar abertura em Android/iPad quando o app fica preso na tela inicial.

## Estratégia
- Restaurar `Home.tsx` do último frontend estável conhecido: v13.6.5 / commit `a691aca`.
- Manter backend atual com rotas de reliability.
- Atualizar versão para 13.6.8.
- Servir `/`, `/crewcheck-repair`, `/repair`, `/safe-start`, `/emergency` e `/__crewcheck_boot_rescue_1368.html` como HTML puro direto pelo servidor.
- Abrir React por rota isolada `/app?v=13.6.8`.
- Desativar cache agressivo de estáticos durante a emergência.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Telegram/despertador.
- Auth.
- Import Guardian.

## Pós-deploy
Acessar primeiro:
`https://crewcheck.online/__crewcheck_boot_rescue_1368.html`

Depois usar:
`Reparar cache e abrir app seguro`.
