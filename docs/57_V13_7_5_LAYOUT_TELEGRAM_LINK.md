# CrewCheck v13.7.5 — Layout Polish + Telegram Link

## Motivo
Após a Central de Atualizações, o app abriu, mas o layout mobile ainda apresentava:
- menu com cabeçalho rolando;
- título do menu quebrando;
- toggles ON/OFF com símbolo duplicado;
- bottom nav cobrindo conteúdo;
- Telegram abrindo o app para compartilhar, sem criar vínculo para notificações.

## Implementado
- Menu real `.cz-menu-panel` passa a ter header fixo e corpo rolável `.cz-menu-scroll`.
- Botões do menu ficam padronizados, sem quebra agressiva do título.
- Toggle de configurações redesenhado em padrão iOS premium, sem bolinha duplicada.
- Bottom nav reduzida, arredondada e com padding inferior seguro.
- Ação Telegram do menu passa a “Vincular Telegram”.
- Backend adiciona `/api/telegram/link/start` e `/api/telegram/link/status`.
- Webhook Telegram vincula chat quando recebe `/start cc_<codigo>`.
- `/api/alarm/test` e `/api/telegram/send` usam chat vinculado por e-mail quando disponível.
- Health e shell atualizados para 13.7.5.

## Variável recomendada
Para gerar link automático:
`TELEGRAM_BOT_USERNAME=nome_do_seu_bot_sem_arroba`

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Google Calendar.
- Radar.
- Salário/diárias.
- Auth.
- Import Guardian.
