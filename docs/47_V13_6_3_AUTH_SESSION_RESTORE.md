# CrewCheck v13.6.3 — Auth Session Restore

## Objetivo
Restaurar endpoints de autenticação que estavam retornando `Recurso operacional indisponível agora` após a proteção global de `/api/*`.

## Corrige
- `/api/auth/config`.
- `/api/auth/login`.
- `/api/auth/register`.
- `/api/auth/me`.
- `/api/auth/logout`.
- `/api/auth/verify-email`.
- `/api/auth/resend-verification`.
- `/api/auth/request-reset`.
- `/api/auth/reset-password`.

## Segurança operacional
- Bloqueia e-mail corporativo por domínio configurável.
- Não solicita CPF no primeiro acesso.
- Não salva senha em banco/localStorage.
- Gera token de sessão assinado para o app.
- Recomenda configurar `CREWCHECK_AUTH_SECRET` no Render.

## Variáveis recomendadas
- `CREWCHECK_AUTH_SECRET`: segredo de assinatura de sessão.
- `CREWCHECK_ADMIN_EMAILS`: lista de e-mails admin separados por vírgula.
- `CREWCHECK_BLOCKED_EMAIL_DOMAINS`: domínios corporativos bloqueados.

## Preservado
- Parser AIMS/CrewRoster.
- Motor canônico.
- Radar.
- Google Calendar.
- Continuidade física.
