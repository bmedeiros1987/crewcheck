# CrewCheck v14.0.5 — Google Calendar / Cloud Identity

## Causa corrigida

O APK executa o CrewCheck dentro de uma WebView. O Google OAuth não permite autorização em user agents incorporados. A v14.0.5 abre o consentimento no navegador seguro do aparelho e devolve o resultado ao CrewCheck por um callback HTTPS no servidor.

O fluxo usa:

- OAuth 2.0 Authorization Code;
- PKCE e `state` de uso único;
- escopos mínimos `https://www.googleapis.com/auth/calendar.events.owned` (eventos só em calendários do próprio usuário) e `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (lista de calendários, somente leitura, para escolher o destino);
- token de atualização criptografado no servidor;
- proxy com allowlist estrita: `GET /users/me/calendarList[/{id}]` e `/calendars/{calendarId}/events[/{eventId}]` de um único `calendarId` validado (`primary` ou ID de calendário Google), com `accessRole=owner` conferido no Google; qualquer outro caminho, método ou parâmetro de consulta retorna `GOOGLE_PATH_BLOCKED`;
- revogação e reconexão assistidas.

## Formato operacional (v14.4.x — `operational-detailed`)

A sincronização com o Google usa o estilo `operational-detailed`:

- um evento por jornada, de C/I a C/O, com título da rota (ex.: `BSB-VCP-BSB-OPS-BSB`);
- um evento por etapa (ex.: `BSB-VCP LA3280`; PS recebe `· PS` e cor grafite);
- descrição com voo, origem/destino, horário local de cada aeroporto com o fuso IANA, UTC, work type OP/PS, aeronave, tripulação/BP, apresentação e liberação;
- HSB/ASB/treinamentos, folgas (DO/DOF/DR/OFF) e férias (`VC · Férias`) com o código publicado;
- início no fuso do aeroporto de origem e fim no fuso do destino (ex.: OPS/Sinop = `America/Cuiaba`), sem depender do fuso do aparelho;
- sem eventos auxiliares (check-in/verificação).

A sincronização é idempotente: cada evento carrega `extendedProperties.private` com `crewcheck=true`, tripulante, mês e uma chave operacional estável (`crewcheckEventKey`). Eventos iguais não são tocados, alterados recebem PATCH, faltantes POST, e só eventos CrewCheck do mesmo tripulante/mês que saíram da escala são removidos. Eventos sem a propriedade privada CrewCheck (pessoais) nunca são alterados nem removidos.

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
- Escopos solicitados pelo app e pelo formulário (Data Access):

```text
https://www.googleapis.com/auth/calendar.events.owned
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

- Remova da configuração e da submissão os escopos amplos antigos:

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar
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

No APK, instale a v14.0.5 e toque em **Google Calendar → Conectar**. O consentimento deverá abrir no Chrome ou navegador padrão, não dentro do aplicativo. Ao concluir, volte ao CrewCheck; o aplicativo detectará a autorização. Em **Calendário → Carregar calendários**, escolha o calendário próprio de destino (principal ou secundário, ex. "Bruno & Marina") e sincronize.

Quem conectou antes desta versão tem só o escopo de eventos: o calendário principal continua funcionando, mas para listar outros calendários é preciso **reconectar** (o Google pedirá o novo consentimento).

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
  "scope": "https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "redirectUri": "https://crewcheck.online/api/google-calendar/oauth/callback"
}
```

Se `configured` estiver `false`, o problema ainda é a ausência do Client Secret ou da chave estável de criptografia no servidor.

## Erro 403 `access_denied` na tela do Google

Esse erro vem do Google, não do código: o app OAuth está com status de publicação **Testing** e a conta usada não está na lista de usuários de teste. Não há contorno legítimo por código.

1. Google Cloud Console → projeto `sonic-charmer-399015` → **Google Auth Platform → Audience**.
2. Enquanto estiver em *Testing*: **Test users → Add users** e inclua cada Conta Google que vai conectar (até 100). Em *Testing* (público externo), o refresh token expira em 7 dias: reconectar semanalmente é esperado até a publicação.
3. **Data Access**: confirme exatamente os dois escopos acima, e nenhum outro de Calendar.
4. Para sair de *Testing*: **Audience → Publish app**. Como os dois escopos são *sensíveis*, o Google exige verificação: homepage pública (`/about`), Política de Privacidade e Termos públicos no domínio verificado (`crewcheck.online` no Search Console), justificativa de escopo e vídeo de demonstração (roteiro em `docs/google-oauth-verification-kit-2026.md`). Até a aprovação, usuários fora da lista de teste veem a tela de app não verificado ou são bloqueados.
