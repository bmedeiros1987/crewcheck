# CrewCheck — entrega de e-mails por MailerSend API

## Arquitetura adotada

O CrewCheck usa o MailerSend por API para e-mails transacionais. SMTP permanece desativado em produção.

Variáveis obrigatórias no Render:

```env
MAILERSEND_API_KEY=COLE_A_CHAVE_DA_API
MAILERSEND_FROM=contato@crewcheck.com.br
MAILERSEND_FROM_NAME=CrewCheck
MAILERSEND_WEBHOOK_SECRET=SEGREDO_DO_WEBHOOK
CREWCHECK_EMAIL_REPLY_TO=
CREWCHECK_EMAIL_BCC=
CREWCHECK_EMAIL_FALLBACK_ENABLED=false
CREWCHECK_EMAIL_DISABLE_SMTP=true
```

Não coloque a chave da API em nenhuma variável SMTP e não configure `SMTP_HOST`, `SMTP_USER` ou `SMTP_PASS`.

## DNS correto na UOL

Os registros do site e do MailerSend devem coexistir na mesma zona DNS.

### Site no Render

```text
crewcheck.com.br        A       216.24.57.1
www.crewcheck.com.br    CNAME   crewcheck.onrender.com
```

### Autenticação MailerSend

```text
crewcheck.com.br                    TXT     v=spf1 include:_spf.mailersend.net ~all
mlsend2._domainkey.crewcheck.com.br CNAME   mlsend2._domainkey.mailersend.net
mta.crewcheck.com.br                CNAME   mailersend.net
email.crewcheck.com.br              CNAME   links.mailersend.net
```

O registro `email` é necessário somente quando o rastreamento personalizado estiver habilitado no MailerSend.

Não troque os nameservers para o Render. Os nameservers continuam apontando para a UOL, e somente os registros `A` e `CNAME` do site apontam para o Render.

## SSL

No Render, adicione em **Settings > Custom Domains**:

```text
crewcheck.com.br
www.crewcheck.com.br
```

O certificado só será emitido depois que os registros `A` e `CNAME` estiverem propagados. Os registros SPF, DKIM e Return-Path não impedem o SSL porque usam tipos ou nomes diferentes.

Antes de reenviar a análise do MailerSend, confirme que os dois endereços abrem sem aviso de certificado:

```text
https://crewcheck.com.br
https://www.crewcheck.com.br
```

## Webhook MailerSend

Configure no MailerSend:

```text
https://crewcheck.online/api/webhooks/mailersend
```

Eventos recomendados:

- sent
- delivered
- soft_bounced
- hard_bounced
- spam_complaint
- unsubscribed

## Diagnóstico administrativo

A rota abaixo mostra a configuração sanitizada dos provedores, sem revelar a chave:

```text
GET /api/admin/email-health
```

A rota abaixo envia um e-mail real usando a mesma função utilizada pela recuperação de senha:

```text
POST /api/admin/email-health
Content-Type: application/json

{
  "to": "bmedeiros1987@gmail.com",
  "subject": "Teste de e-mail CrewCheck"
}
```

O teste precisa retornar:

```json
{
  "ok": true,
  "provider": "mailersend"
}
```

## Teste funcional obrigatório

Depois que o teste administrativo for aceito:

1. Abra **Recuperar senha**.
2. Informe uma conta já cadastrada.
3. Escolha envio por e-mail.
4. Confirme o recebimento do código de seis dígitos.
5. Redefina a senha.
6. Confirme que o código não pode ser reutilizado.

## Erros mais comuns

### `401` ou `403` da API

A chave em `MAILERSEND_API_KEY` está inválida, revogada ou pertence a outra conta.

### Remetente não autorizado

`MAILERSEND_FROM` não pertence ao domínio autenticado ou a conta ainda não foi aprovada para envio.

### Domínio verificado, mas conta recusada por SSL

Os registros de e-mail estão corretos, mas o site informado no perfil do MailerSend ainda não abre por HTTPS. Corrija o domínio personalizado no Render e solicite uma nova análise.

### SPF inválido

Existe mais de um registro TXT começando com `v=spf1`. O domínio deve ter somente um SPF. Se outro serviço também enviar e-mails, combine os `include:` em um único registro.
