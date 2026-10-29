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

O plano atual no `render.yaml` é `free`. Confirme no painel qual cobrança gerou a suspensão: plano, banda, minutos de build ou outro item. Respeite o teto de **US$ 7/mês por aplicativo**. Ainda falta o Bruno esclarecer se o teto vale para o plano-base ou para o total. Até lá, não contrate nada além do plano. O valor de um plano não é teto de fatura, e custo variável não coberto exige decisão do Bruno.

## 3. Alternativa: migrar para o workspace novo ("My Workspace", conexão CrewCheck Novo)

### 3.0 Verificações antes de qualquer criação (só leitura)

1. **Domínio.** Dentro do Render, um domínio personalizado fica em um serviço por vez. Para anexar `crewcheck.online` a um serviço novo do Render, é preciso **removê-lo antes do serviço antigo**, que está suspenso, pelo painel antigo ou pelo suporte do Render.
   - Essa restrição vale só entre serviços do Render. Ela **não impede** que o DNS na UOL aponte para um host fora do Render, desde que esse host sirva `crewcheck.online` com TLS válido (seção 3.1, opção B).
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

A entrada não quebra com request malformado: a rota é lida como texto, sem `new URL`. Alvos como `//%` ou `//[` recebem resposta, e o processo segue no ar.

**Opção A, no Render (workspace novo).** Serviço web, plano **free**, sem variáveis de ambiente:
- Build Command: `true`
- Start Command: `node ops/maintenance/server.mjs`
- Health Check Path: `/__maintenance/health`

O domínio só entra depois de liberado do serviço antigo (3.0, item 1). Se o Render indicar outro alvo de DNS, a alteração na UOL exige autorização.

**Opção B, fora do Render (hospedagem estática).** Só o `ops/maintenance/index.html`, um arquivo estático, sem Node, na hospedagem UOL ("somente hospedagem").
- Pré-requisitos:
  - TLS válido para `crewcheck.online` nesse host; sem isso, navegadores e o WebView do app recusam a conexão;
  - autorização do Bruno para alterar o registro A na UOL. O login tem CAPTCHA pendente, e nenhum DNS foi alterado.
- O host estático provavelmente responde 200, não 503, e o cache depende da configuração dele.
- O corte e o retorno são feitos pelo registro A (`216.24.57.1` é o valor atual). Com TTL de cerca de 30 min, a propagação leva até esse tempo nos dois sentidos.

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
   - Obrigatórias, com o mesmo valor: `DATABASE_URL` e `CREWCHECK_AUTH_SECRET`.
   - Opcionais, com o mesmo valor **e** o mesmo estado (definida ou ausente): `MYSQL_SSL_MODE`, `CREWCHECK_DATA_ENCRYPTION_KEY`, `CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY`, `CREWCHECK_WHATSAPP_AUDIT_SALT`, `CREWCHECK_AUDIT_HASH_SALT`, `CREWCHECK_TERMS_AUDIT_SALT`, `JWT_SECRET`.
   - Sem `CREWCHECK_AUTH_SECRET`, o código usa um segredo de desenvolvimento fixo (`cc1371Secret`). **Não inicie o serviço sem ele.**
4. **Ligadas a provedores** (precisam bater com o que o provedor tem): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `MAILERSEND_API_KEY`, `MAILERSEND_WEBHOOK_SECRET`, `INFOBIP_API_KEY`, `GOOGLE_OAUTH_WEB_CLIENT_ID`, `GOOGLE_OAUTH_WEB_CLIENT_SECRET`.
5. **URLs públicas:** continuam `https://crewcheck.online` (`CREWCHECK_PUBLIC_BASE_URL`, `TELEGRAM_PUBLIC_BASE_URL`, `GOOGLE_OAUTH_REDIRECT_URI`). Como o domínio não muda, os webhooks não mudam: Telegram, Meta/WhatsApp, Infobip, Asaas, MailerSend e o redirect do Google OAuth.
6. **Checagem de nomes, antigo × novo:** gere dois arquivos só com nomes, um por linha: os definidos no serviço antigo e os definidos no novo. Rode `node scripts/ops/env-names.mjs --check --old antigos.txt --new novos.txt`. A ferramenta recusa linhas com valor e falha quando:
   - falta um nome obrigatório (`DATABASE_URL`, `CREWCHECK_AUTH_SECRET`);
   - um nome sensível à derivação muda de presença em qualquer direção (por exemplo, um salt opcional que era ausente passa a definido);
   - um nome que o serviço antigo tinha some no novo.

   Nomes só acrescentados no novo, e não sensíveis, aparecem no relatório sem reprovar. Chaves e salts opcionais ausentes nos dois lados estão corretos e **não** devem ser criados.
7. **Migração automática:** o `render.yaml` define `CREWCHECK_AUTO_MIGRATE`, mas o código lê `CREWCHECK_DB_AUTO_MIGRATE` (padrão `false`). Mantenha o estado do serviço antigo. A última migração do repositório é de 20/10.

**Nunca rode duas instâncias com segredos de produção.** Ao iniciar, `server/telegram-fast-ack.mjs`:
- roda o agendador de notificações 2 s após subir e depois a cada 30 s;
- "repara" o webhook do Telegram a cada 15 min, mesmo com outros recursos desligados.

Consequências:
- Uma prévia em `*.onrender.com` com os segredos envia avisos e ligações reais. Por isso a prévia é feita **sem segredos** ou não é feita.
- Se a conta antiga for regularizada durante a migração, uma das duas instâncias precisa ser suspensa antes da outra subir.

### 3.3 Corte

1. Retirar `crewcheck.online` do serviço de manutenção e anexar ao serviço principal.
2. `node scripts/ops/post-cutover-smoke.mjs https://crewcheck.online --expected-release <commit implantado>`. São só GETs. Verifica:
   - que não é a página do Render;
   - que `/api/health` responde 200 em JSON;
   - que o `release` de `/api/health`, e de `/api/release` quando existir, é o commit esperado (completo ou prefixo de 7+ caracteres hex);
   - que o shell, o `sw.js` e o `manifest.json` estão presentes.

   Sem `--expected-release`, o smoke não aprova. Outra versão, uma divergência entre as duas rotas ou um build `local` reprovam o corte. `/api/health` sozinho não basta, porque responde `ok` sem configuração.
3. Conferir no painel do Telegram que o webhook aponta para `https://crewcheck.online/api/telegram/webhook`. A aplicação repara isso sozinha.

### 3.4 Rollback

- Devolver o domínio ao serviço de manutenção, ou ao serviço antigo se ele for restaurado.
- O banco é o mesmo em qualquer caminho, porque nada é migrado de lugar.
- Antes de religar qualquer instância antiga, desligar a nova (seção 3.2).

## 4. Avisar os usuários

- Enquanto o domínio estiver preso ao serviço suspenso, quem responde é o Render. Não há como trocar a página dele.
- O Telegram, o WhatsApp e os e-mails saem do mesmo servidor suspenso.
- O aviso no app e no site depende de o domínio apontar para a entrada de manutenção: opção A, com o domínio liberado no Render, ou opção B, com o DNS na UOL apontando para um host estático com TLS válido (3.1). Fora disso, só por canais externos.

## 5. Autorizações necessárias

| # | Autorização | Para quê |
|---|---|---|
| 1 | Acesso ao painel da conta antiga do Render | Ver motivo e valor da suspensão, nomes das variáveis, região e liberação do domínio |
| 2 | Decisão de plano e custo | Teto de US$ 7/mês por aplicativo (falta definir se é plano-base ou total); banda e builds como custo variável |
| 3 | Criar o serviço de manutenção (free) e o principal no workspace novo | Seções 3.1 e 3.2 |
| 4 | Inserir as variáveis direto no painel novo | Pelo responsável pelos segredos, sem trânsito por chat |
| 5 | Acesso ao Aiven, leitura | Filtro de IP e último backup |
| 6 | DNS na UOL | Opção B do aviso (host estático com TLS válido) ou outro alvo indicado pelo Render; login com CAPTCHA pendente de autorização do Bruno |

## 6. Achados para depois (fora desta recuperação)

- `cc1371Secret` cai num segredo fixo quando `CREWCHECK_AUTH_SECRET` falta. O certo seria falhar fechado em produção.
- `/api/health` responde `ok` sem verificar configuração nem banco.
- `www.crewcheck.online` sem registro na consulta DNS pública.
