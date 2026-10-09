# External delivery follow-up — 2026-10-09

Isolated branch: `fix/external-notification-readiness`, based on main
`2e4b1f229c691093cc0af8ad49b19b68d2d6bf03` (main advanced while fetching).
No checkout AGENTS/SKILL files or ancestor AGENTS were present. No other checkout
was edited. No message/test call, scheduler trigger, device permission change,
credential, provider, paid activation, APK distribution or deployment was performed.

## Read-only production observation

At 06:24 UTC, GET `/api/notifications/runtime-health` reported:
- database available; interval 30 seconds;
- completed memory cycle 06:24:45.799–06:24:46.824Z;
- selected=0, sent=0, failed=0 for that cycle;
- webhook healthy, pending updates=0;
- persisted state `never_run`, all persisted timestamps/status null.

This proves the general job scheduler is executing, not that Bruno had a pending
job, a valid link, a delivery, or a healthy Android channel. `running:false` between
cycles is normal. Zero selected means no due job selected in that cycle, not an
empty global queue. Existing paid configuration was not changed or exercised.

## Verified code boundaries and fixes

Android MainActivity schedules local AlarmManager broadcasts and NotificationManager
notices. It has no FCM receiver/SDK, token enrollment/rotation/revocation or remote
sender registry. The PWA worker has no push listener/subscription/PushManager flow.
Granting Android notification permission does not create either missing transport.
A page timer and an in-app banner require a running page; installing the app does
not turn them into remote push. Local bridge `true` means queued UI-thread work,
not OS delivery. App/channel blocking, reboot, battery delay and installed APK
version remain physical unknowns. Legacy local alarm cancellation/account binding
remain unresolved; server cancellation does not cover Android/ICS copies.

The heartbeat writer binds ISO strings ending Z directly into MySQL DATETIME and
silently swallows errors. The patch uses numeric epoch parameters with
FROM_UNIXTIME, partial atomic updates, epoch read aliases and sanitized write-error
visibility. The disposable MySQL fixture reproduces the old strict-DATETIME error
and exercises the real corrected writer under +03:00. Real MySQL gate at 28ec5fbb passed before/after preparation; later heads must pass independently.
Completed but old heartbeat is now `stale`, invalid time `unknown`, rather than
permanently healthy. No queue cadence/selection/send policy changed.

Wakeup UI checks `payload.telegramLinked` although the hardened scheduling response
has no such field; a valid registration can therefore say the user is unlinked.
The bounded canonical finalizer replaces this with the acknowledged server message
and adds a read-only current-owner readiness panel using existing `/api/alarm/scheduled`.
It clears on account change, uses current bearer, discards late responses and
refreshes on reconnection/queue changes. The API returns only boolean configuration
and canonical owner-binding readiness, not chat IDs/phone/token. Last 100 jobs are
summarized as pending, accepted, unknown, expired or cancelled. `sent` means provider
accepted, not delivered/read. No remote push or guaranteed delivery is claimed.
Own job timestamps now use SQL epoch conversion and explicit ISO instants rather than unqualified DATETIME strings interpreted in the device timezone. Saving a server job no longer implicitly requests browser notification permission or adds a duplicate, unscoped page timer.
New wakeup messages omit roster/airport/presentation details; historical pending
payloads are not rewritten. Existing paid choices and explicit test buttons are
unchanged and were not clicked. No new channel is automatically opted in.

BIDS remains separate from the 30-second queue loop. No automatic caller of the
existing BIDS scheduler endpoint is present in deployment/workflows. An external
production caller is unverified. Reading/saving BIDS intentionally does not send.
Year-end reserved cycle scheduling remains blocked until verified source instants;
`Já solicitei` continues to cancel linked pending server jobs and block their
future dispatch. No cycle reminders or invented official dates were created.

## Smallest path outside the app

For an existing opted-in, linked account, the available path is a Telegram MESSAGE
job explicitly registered in the existing server queue, current binding rechecked
at dispatch, generic concise content and expiry/dedup/cancellation controls. This
sends through Telegram, not as a CrewCheck Android push. First inspect Bruno's
current link/own pending records and installed APK/version + OS/channel status
without changing permissions. The production observations above do not identify
his individual blocker. If a link is absent, linking requires the user's own
explicit action; do not auto-link, choose a recipient or send a test.

A physical test must first coordinate recipient/content/channel with the parent.
Direct CrewCheck remote push would need a separately authorized Android receiver,
existing-or-approved sender configuration and account-bound token lifecycle; that
work is not activated under this task's credential/permission constraints.
Opening/closing BIDS additionally needs the promised official dates/timezone and
a reviewed authorized trigger. Reuse reviewed briefing work from #909/#910/#872;
no HSB/reserve, APZ, regulations or briefing defaults are changed here.

## Evidence

Synthetic actual React browser fixture: current bearer over stale cookie,
offline/reconnect, A→B isolation, late-response discard, logout, acceptance versus
delivery/unknown/expiry/cancel labels, no sends and no permission request.
Production writer fixture: zoned epoch conversion, partial updates, write failure
visible without sensitive error text. Private GET fixture: owner identity and
canonical binding, old/deleted incarnation and unauthenticated access denied.
Existing queue, BIDS and 23 browser-reminder safety cases remain passing locally.
CI runs disposable MySQL and browser/heartbeat tests before/after canonical prep.

## Revisão após main 1435afd4

A preparação canônica recria `WakeupView` via `scripts/v1411/apply.mjs`. O finalizador agora protege a tela hospedeira completa: sessão + proprietário atual, respostas concorrentes, limpeza em troca/expiração de conta, desconexão distinta de lista vazia e callbacks tardios de operações. A fixture monta a função preparada inteira com contas e eventos fictícios, não apenas o cartão filho. Nenhuma API externa de envio é acessada.

Android nativo já dispõe de alarmes locais por AlarmManager e BroadcastReceiver, que podem executar com a página fechada. São aproximados (`setAndAllowWhileIdle`); a proteção de validade descarta execução mais de dois minutos atrasada. Não há inventário persistido/restauração após reinício nem confirmação de entrega. O bridge confirma enfileiramento de trabalho na UI, não entrega. A permissão POST_NOTIFICATIONS não comprova que o canal esteja habilitado. PWA usa timer da página e precisa dela viva. O servidor atual não possui transporte direto Android/FCM ou Web Push para mudanças remotas. Corrigir isso exigiria decisão separada, não novas credenciais nesta PR.

Menor passo Android: verificar manualmente, pelo usuário, a versão instalada e o estado do canal CrewCheck nas configurações existentes; não alterar permissões automaticamente. Um lembrete local futuro só deve ser validado após coordenar destinatário e conteúdo. A sessão web disponível não informa a versão instalada, permissões ou inventário de alarmes do aparelho. Nenhuma data BIDS/folga foi inventada ou agendada.

O gate financeiro anterior falhou duas vezes no alinhamento com cabeçalho. A mesma matriz passou localmente; isso não dispensa o CI. A fixture conserva todas as assertions e tolerâncias, aguarda fontes carregadas e registra geometria, viewport, estilos e animações por caso antes da assertion para reprodução em Linux.
