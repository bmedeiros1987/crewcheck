# CrewCheck — recuperação da entrega de e-mails

## Situação atual

O backend tenta os provedores nesta ordem:

1. API configurável (`EMAILSENDER_*`)
2. MailerSend API (`MAILERSEND_*`)
3. SMTP, quando `CREWCHECK_EMAIL_FALLBACK_ENABLED=true`

A rota administrativa `GET /api/admin/email-health` mostra apenas o estado sanitizado da configuração. A rota `POST /api/admin/email-health` envia um e-mail real para a conta administradora autenticada ou para o endereço informado em `to`.

## Configuração temporária recomendada — Gmail SMTP

Use uma senha de app do Google, nunca a senha normal da conta.

```env
CREWCHECK_EMAIL_FALLBACK_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=bmedeiros1987@gmail.com
SMTP_PASS=COLE_A_SENHA_DE_APP_SEM_ESPACOS
SMTP_FROM=bmedeiros1987@gmail.com
SMTP_FROM_NAME=CrewCheck
CREWCHECK_EMAIL_REPLY_TO=bruno@crewcheck.online
CREWCHECK_EMAIL_BCC=
```

As variáveis antigas `SMTP_USERNAME`, `SMTP_PASSWORD` e `SMTP_FROM_EMAIL` continuam reconhecidas por compatibilidade, mas os nomes canônicos acima devem ser usados no Render.

## MailerSend

Enquanto a conta MailerSend estiver pendente ou recusada, mantenha o SMTP ativo. Depois da aprovação:

```env
MAILERSEND_API_KEY=...
MAILERSEND_FROM=contato@crewcheck.com.br
MAILERSEND_FROM_NAME=CrewCheck
MAILERSEND_WEBHOOK_SECRET=...
```

O endereço em `MAILERSEND_FROM` precisa pertencer ao domínio efetivamente verificado e aprovado no MailerSend.

Webhook:

```text
https://crewcheck.online/api/webhooks/mailersend
```

## Teste administrativo

1. Entre no CrewCheck com uma conta administrativa.
2. Consulte `GET /api/admin/email-health`.
3. Envie `POST /api/admin/email-health` com JSON opcional:

```json
{
  "to": "bmedeiros1987@gmail.com",
  "subject": "Teste de e-mail CrewCheck"
}
```

O retorno informa qual provedor aceitou o envio e lista as tentativas anteriores sem revelar chaves ou senhas.

## Teste funcional obrigatório

Depois do teste administrativo:

1. Use **Recuperar senha**.
2. Selecione e-mail.
3. Confirme o recebimento do código de seis dígitos.
4. Cadastre uma nova senha.
5. Confirme que o código expirado ou já utilizado não funciona novamente.

## SSL e domínio

O domínio usado no cadastro do provedor precisa responder por HTTPS com certificado válido. No Render, adicione e valide:

- `crewcheck.com.br`
- `www.crewcheck.com.br`

Somente reenvie a análise do MailerSend depois de o navegador abrir os dois endereços sem aviso de certificado.
