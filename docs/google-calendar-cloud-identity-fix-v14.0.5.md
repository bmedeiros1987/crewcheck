# CrewCheck v14.0.5 — Google Calendar / Cloud Identity

## Causa corrigida

O APK executa o CrewCheck dentro de uma WebView. O Google OAuth não permite autorização em user agents incorporados. A v14.0.5 abre o consentimento no navegador seguro do aparelho e devolve o resultado ao CrewCheck por um callback HTTPS no servidor.

O fluxo usa:

- OAuth 2.0 Authorization Code;
- PKCE e `state` de uso único;
- escopo mínimo `https://www.googleapis.com/auth/calendar.events.owned`;
- token de atualização criptografado no servidor;
- proxy restrito a `/calendars/primary/events`;
- revogação e reconexão assistidas.

## Configuração obrigatória no Google Cloud

Projeto: `sonic-charmer-399015` — número `777637106343`.

Crie ou edite um cliente OAuth do tipo **Aplicativo da Web**.

### Origens JavaScript autorizadas

Cadastre somente as origens realmente usadas, sem caminho e sem barra final:

```text
https://crewcheck.online
https://www.crewcheck.online
```

Caso o endereço direto do Render seja acessado por usuários, cadastre também o domínio exato mostrado pelo serviço, por exemplo:

```text
https://crewcheck-premium.onrender.com
```

### URI de redirecionamento autorizada

Cadastre exatamente:

```text
https://crewcheck.online/api/google-calendar/oauth/callback
```

Não use curingas, barra final adicional ou `http`.

### Tela de consentimento

- Publicação: Em produção, ou conta adicionada como usuário de teste enquanto a verificação estiver pendente.
- Escopo solicitado pelo app e pelo formulário:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

- Remova da configuração e da submissão os escopos antigos:

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

- Confirme que a Google Calendar API está ativada no mesmo projeto do Client ID.

## Variáveis obrigatórias no Render

```text
VITE_GOOGLE_CLIENT_ID=<CLIENT ID DO APLICATIVO DA WEB>
GOOGLE_OAUTH_WEB_CLIENT_ID=<MESMO CLIENT ID DO APLICATIVO DA WEB>
GOOGLE_OAUTH_WEB_CLIENT_SECRET=<CLIENT SECRET DO APLICATIVO DA WEB>
GOOGLE_OAUTH_REDIRECT_URI=https://crewcheck.online/api/google-calendar/oauth/callback
CREWCHECK_PUBLIC_BASE_URL=https://crewcheck.online
CREWCHECK_AUTH_SECRET=<SEGREDO FORTE E ESTÁVEL JÁ USADO NAS SESSÕES>
CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY=<OUTRO SEGREDO FORTE E ESTÁVEL>
```

Não exponha Client Secret ou chaves de criptografia em variáveis `VITE_*`, no repositório, em capturas de tela ou no aplicativo.

Depois de salvar as variáveis, faça um novo deploy completo para que `VITE_GOOGLE_CLIENT_ID` seja incorporado ao build web.

## Limpeza antes do primeiro novo teste

Revogue a autorização anterior do CrewCheck na Conta Google. Depois, no navegador do CrewCheck, remova somente os valores antigos:

```javascript
localStorage.removeItem('crewcheck_google_client_id_override');
localStorage.removeItem('crewcheck_google_calendar_token');
localStorage.removeItem('crewcheck_google_calendar_server_bridge_v1');
location.reload();
```

No APK, instale a v14.0.5 e toque em **Google Calendar → Conectar**. O consentimento deverá abrir no Chrome ou navegador padrão, não dentro do aplicativo. Ao concluir, volte ao CrewCheck; o aplicativo detectará a autorização e sincronizará o calendário principal.

## Diagnóstico

Endpoint público, sem segredos:

```text
https://crewcheck.online/api/google-calendar/oauth/health
```

O retorno esperado após configurar o Render é:

```json
{
  "ok": true,
  "configured": true,
  "scope": "https://www.googleapis.com/auth/calendar.events.owned",
  "redirectUri": "https://crewcheck.online/api/google-calendar/oauth/callback"
}
```

Se `configured` estiver `false`, o problema ainda é a ausência do Client Secret ou da chave estável de criptografia no servidor.
