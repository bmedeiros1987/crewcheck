# Recuperação do crewcheck.online: suspensão de 29/10/2026

Documento operacional. Contém apenas **nomes**: nenhum valor de segredo, nenhum dado de usuário. Nada aqui foi executado em produção. Toda ação no Render, no DNS, no Aiven ou nos provedores depende de autorização explícita.

## 1. Diagnóstico (evidência, só leitura)

Verificação de 29/10 às 06:49 UTC, sem credencial:

| URL | Resposta |
|---|---|
| `https://crewcheck.online/api/health` | `503`, HTML "Service Suspended", cabeçalho `x-render-routing: suspend` |
| `https://crewcheck.online/` | o mesmo |
| `www.crewcheck.online` | a consulta DNS pública (dns.google) não retornou registro A/AAAA/CNAME |

- **Quem responde é a camada de roteamento do Render.** O cabeçalho `x-render-routing: suspend` mostra que a aplicação nem chega a ser executada. O sintoma não é falha do código: a CI pós-merge de a4ce34901 está verde.
- **Causa provável:** o suporte do Render havia avisado, em 15/10, de suspensão em 29/10 caso houvesse fatura pendente. Isso **ainda não foi confirmado no painel**.
- **DNS:** os servidores de nome são da UOL (`ns1/ns2/ns3.dominios.uol.com.br`). O registro A do apex `crewcheck.online` aponta para `216.24.57.1`, IP compartilhado do Render, que roteia pelo nome do host. TTL de cerca de 30 min.
- **O domínio precisa continuar sendo `crewcheck.online`.** O app Android abre `https://crewcheck.online?app=1` num WebView (`MainActivity.java`). Trocar de domínio exigiria publicar o app nas lojas, o que está fora do escopo.

## 2. Caminho mais rápido e seguro: confirmar e regularizar a suspensão na conta atual

Se a suspensão for por cobrança, regularizar a conta atual devolve o mesmo serviço, com:
- os mesmos segredos;
- o mesmo domínio;
- os mesmos webhooks;
- o mesmo banco.

Não há mudança de DNS nem de configuração. É o menor risco e o menor tempo.

**Pré-requisito:** alguém com acesso ao painel da conta antiga confirma o motivo da suspensão e o valor.

O plano atual no `render.yaml` é `free`. Confirme no painel qual cobrança gerou a suspensão: plano, banda, minutos de build ou outro item. Respeite o teto de **US$ 7/mês por aplicativo**. O valor de um plano não é teto de fatura, e custo variável não coberto exige decisão do Bruno.

## 3. Alternativa: migrar para o workspace novo ("My Workspace", conexão CrewCheck Novo)

### 3.0 Verificações antes de qualquer criação (só leitura)

1. **Domínio.** Confirme se `crewcheck.online` pode ser **removido do serviço antigo**, que está suspenso. O Render só aceita um domínio personalizado em um serviço por vez. Se não for possível remover pelo painel antigo, será preciso falar com o suporte do Render. Este é o bloqueio principal da migração.
2. **Banco (Aiven, não mover).**
   - O host e a CA estão fixados em `server/mysql-verified-tls.mjs` (porta 22966).
   - Confirme no console do Aiven se há **filtro de IP**: o serviço novo sai por outros IPs.
   - Confirme o **último backup** disponível. Não há backup recente comprovado.
3. **Variáveis do serviço antigo, só nomes.** No painel antigo (Environment), liste os nomes definidos.
   - `node scripts/ops/env-names.mjs` mostra o que o código lê.
   - O `render.yaml` declara 75 nomes (46 secretos).
   - O código lê mais 154 que podem ter sido definidos direto no painel.
   - Só o painel antigo mostra o conjunto real.
4. **Região.** O `render.yaml` não define região. Use a mesma do serviço antigo, por causa da latência com o Aiven.

### 3.1 Aviso de manutenção no domínio (sem segredo, sem banco)

`ops/maintenance/server.mjs` é uma entrada independente: não importa `server.mjs`, não tem segredos, banco, timers, chamadas externas nem dependências. Todas as rotas respondem 503 com `Cache-Control: no-store`:

| Rota | Resposta |
|---|---|
| páginas | "Sistema em manutenção. Estamos trabalhando para restabelecer o acesso." |
| `/api/*` | JSON `{ ok:false, maintenance:true }` |
| webhooks | 503; o provedor tenta de novo depois, e nada é aceito e perdido |
| `/__maintenance/health` | 200, para a verificação de saúde da plataforma |

Não há prazo prometido (sem `Retry-After`).

Serviço web no workspace novo, plano **free**, sem variáveis de ambiente:
- Build Command: `true`
- Start Command: `node ops/maintenance/server.mjs`
- Health Check Path: `/__maintenance/health`

Depois de liberar o domínio, anexe `crewcheck.online` a este serviço. Se o Render indicar outro alvo de DNS, a alteração na UOL exige autorização.

Observações:
- **Hibernação:** o plano free hiberna; a primeira visita pode demorar.
- **PWA instalado:** o service worker só grava o app ao instalar uma versão nova, conferindo o hash do build. Por isso o aviso não substitui o app em cache. Quem já tem o PWA instalado pode ver o app com falhas de rede em vez do aviso.

Conferência: `node scripts/ops/post-cutover-smoke.mjs https://crewcheck.online --expect-maintenance`.

### 3.2 Serviço principal

1. **Criar pelo Blueprint** (`render.yaml`, Node 22.13.0, `npm ci && npm run build`, `npm start`).
   - Plano dentro do teto: `free`, como hoje, ou um plano pago de no máximo US$ 7/mês, com autorização.
   - Um único plano pago por aplicativo. O serviço de manutenção é free e deve ser removido depois.
   - Confira banda e minutos de build no painel.
2. **Variáveis.** Copie no painel, direto, os mesmos nomes e os mesmos valores do serviço antigo. Não passe valores por chat.
3. **Estado definido/ausente.** Reproduza para cada variável abaixo exatamente o estado do serviço antigo: definida ou ausente.
   - Vários nomes caem em `CREWCHECK_AUTH_SECRET` quando ausentes. Definir um que antes não existia muda a chave derivada e torna ilegíveis os dados cifrados.
   - Variáveis que precisam manter o mesmo valor e o mesmo estado: `DATABASE_URL`, `MYSQL_SSL_MODE`, `CREWCHECK_AUTH_SECRET`, `CREWCHECK_DATA_ENCRYPTION_KEY`, `CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY`, `CREWCHECK_WHATSAPP_AUDIT_SALT`, `CREWCHECK_AUDIT_HASH_SALT`, `CREWCHECK_TERMS_AUDIT_SALT`.
   - Sem `CREWCHECK_AUTH_SECRET`, o código usa um segredo de desenvolvimento fixo (`cc1371Secret`). **Não inicie o serviço sem ele.**
4. **Ligadas a provedores** (precisam bater com o que o provedor tem): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `MAILERSEND_API_KEY`, `MAILERSEND_WEBHOOK_SECRET`, `INFOBIP_API_KEY`, `GOOGLE_OAUTH_WEB_CLIENT_ID`, `GOOGLE_OAUTH_WEB_CLIENT_SECRET`.
5. **URLs públicas:** continuam `https://crewcheck.online` (`CREWCHECK_PUBLIC_BASE_URL`, `TELEGRAM_PUBLIC_BASE_URL`, `GOOGLE_OAUTH_REDIRECT_URI`). Como o domínio não muda, os webhooks não mudam: Telegram, Meta/WhatsApp, Infobip, Asaas, MailerSend e o redirect do Google OAuth.
6. **Checagem de nomes:** gere um arquivo só com nomes, um por linha, e rode `node scripts/ops/env-names.mjs --check nomes.txt`. A ferramenta recusa linhas com valor.
7. **Migração automática:** o `render.yaml` define `CREWCHECK_AUTO_MIGRATE`, mas o código lê `CREWCHECK_DB_AUTO_MIGRATE` (padrão `false`). Mantenha o estado do serviço antigo. A última migração do repositório é de 20/10.

**Nunca rode duas instâncias com segredos de produção.** Ao iniciar, `server/telegram-fast-ack.mjs`:
- roda o agendador de notificações 2 s após subir e depois a cada 30 s;
- "repara" o webhook do Telegram a cada 15 min, mesmo com outros recursos desligados.

Consequências:
- Uma prévia em `*.onrender.com` com os segredos envia avisos e ligações reais. Por isso a prévia é feita **sem segredos** ou não é feita.
- Se a conta antiga for regularizada durante a migração, uma das duas instâncias precisa ser suspensa antes da outra subir.

### 3.3 Corte

1. Retirar `crewcheck.online` do serviço de manutenção e anexar ao serviço principal.
2. `node scripts/ops/post-cutover-smoke.mjs https://crewcheck.online`. São só GETs. Verifica que não é a página do Render, que `/api/health` responde 200 em JSON, e que o shell, o `sw.js` e o `manifest.json` estão presentes. `/api/health` sozinho não basta, porque responde `ok` sem configuração.
3. Conferir no painel do Telegram que o webhook aponta para `https://crewcheck.online/api/telegram/webhook`. A aplicação repara isso sozinha.

### 3.4 Rollback

- Devolver o domínio ao serviço de manutenção, ou ao serviço antigo se ele for restaurado.
- O banco é o mesmo em qualquer caminho, porque nada é migrado de lugar.
- Antes de religar qualquer instância antiga, desligar a nova (seção 3.2).

## 4. Avisar os usuários

- Enquanto o domínio estiver preso ao serviço suspenso, quem responde é o Render. Não há como trocar a página dele.
- O Telegram, o WhatsApp e os e-mails saem do mesmo servidor suspenso.
- O aviso no app e no site depende de o domínio apontar para o serviço de manutenção (3.1). Fora disso, só por canais externos.

## 5. Autorizações necessárias

| # | Autorização | Para quê |
|---|---|---|
| 1 | Acesso ao painel da conta antiga do Render | Ver motivo e valor da suspensão, nomes das variáveis, região e liberação do domínio |
| 2 | Decisão de plano e custo | Teto de US$ 7/mês por aplicativo; banda e builds como custo variável |
| 3 | Criar o serviço de manutenção (free) e o principal no workspace novo | Seções 3.1 e 3.2 |
| 4 | Inserir as variáveis direto no painel novo | Pelo responsável pelos segredos, sem trânsito por chat |
| 5 | Acesso ao Aiven, leitura | Filtro de IP e último backup |
| 6 | DNS na UOL | Só se o Render indicar outro alvo para o domínio |

## 6. Achados para depois (fora desta recuperação)

- `cc1371Secret` cai num segredo fixo quando `CREWCHECK_AUTH_SECRET` falta. O certo seria falhar fechado em produção.
- `/api/health` responde `ok` sem verificar configuração nem banco.
- `www.crewcheck.online` sem registro na consulta DNS pública.
