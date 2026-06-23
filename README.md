# CrewCheck v11.0.31 — Telegram Premium Messages

Esta versão melhora a integração Telegram Premium: o cadastro pode receber o usuário do Telegram com @ fixo visual, sanitização contra @ duplicado e conexão automática por link do bot. O usuário não precisa digitar código manual; ao tocar em Conectar Telegram, o app abre o bot com payload seguro e associa o chat ao cadastro quando o usuário toca em Iniciar.

O token do bot continua fora do código e deve ficar somente no Render em `TELEGRAM_BOT_TOKEN`.

# CrewCheck v10.8.132 — SMTP fallback launch

Esta versão adiciona fallback SMTP para e-mails internos do CrewCheck, mantendo SendGrid e MailerSend API como provedores preferenciais quando configurados. Use as variáveis SMTP apenas no Render, nunca no GitHub.

Ordem de envio: SendGrid → MailerSend API → SMTP.

# CrewCheck v10.8.130

Versão premium com Google Play em destaque, suporte interno sem expor contato privado, manuais centralizados em Ajuda, e-mails com identidade visual, PDFs com logo e regra de KM 2x corrigida.

# CrewCheck Premium

Versão com login obrigatório, cadastro simples, leitura de escala, análise de irregularidades, academia, exportação premium para calendário, e-mail e banco de dados.

Esta build aceita **MySQL/Aiven** via `DATABASE_URL=mysql://...` e também mantém compatibilidade técnica com MySQL se necessário.

Consulte `README_MYSQL_DEPLOY.md` para configurar no Render.

# CrewCheck Premium

Aplicação Vite/React para leitura de CrewRosterReport em PDF, com layout desktop/mobile premium e análise de escala de tripulantes.

## Recursos desta versão

- Leitura do PDF CrewRosterReport por linhas e colunas.
- Menu: **Escala**, **Irregularidades**, **Dias de Academia** e **Escala Puxada**.
- Seleção automática ou manual da função:
  - ACT SNA/TAM Aeronautas Comissários 2025/2027.
  - ACT SNA/TAM Aeronautas Pilotos 2025/2027.
- Detecção de ACT por cargo/código da escala, com fallback manual na tela inicial.
- Análise parametrizada por função para:
  - sobreaviso;
  - reserva;
  - tempo em solo entre etapas;
  - madrugadas consecutivas e janela móvel de 168h;
  - limite de horas de voo 90/28 e 900/365 para narrow/A32F/Embraer;
  - limite de horas de voo 100/28 e 1000/365 para wide body;
  - folgas, escala com 9 folgas e indenização prevista em ACT;
  - repouso adicional de +1h em jornada simples planejada acima de 10h;
  - pontos que dependem de GRF/SGRF, tripulação, manual do operador e validação oficial.
- Ranking de dias mais cansativos.
- Nota de puxada da escala.
- Recomendação dos melhores dias de academia.
- Exportação de relatório em PDF.
- Exportação de calendário `.ics`.
- Servidor Node próprio para Render com fallback de rotas SPA.

## Deploy no Render

Use como **Web Service / Node**.

```bash
Build Command: yarn install && yarn build
Start Command: node server.mjs
```

Depois de cada atualização, faça no Render:

```text
Manual Deploy → Clear build cache & deploy
```

## Aviso importante

O CrewCheck faz leitura automática do PDF e aplica regras parametrizadas. Ele não substitui conferência oficial pela escala publicada, ACT/CCT aplicável, GRF/SGRF, manual do operador, extensão registrada, tipo de tripulação e validação da empresa/sindicato.

## Revisão de precisão operacional - siglas LATAM/Aeronautas

Esta versão ajusta a leitura das siglas operacionais informadas pelo usuário:

- `DO`, `DR`, `DOF`: folgas formais publicadas e contadas como folga mensal.
- `OFF`: extensão de descanso/repouso; aparece como descanso, mas não entra como folga formal mensal.
- Dia em branco entre programação que termina fora da base e próxima programação que inicia na mesma localidade: marcado como `INATIVO/PERNOITE`.
- `ASB`: Airport Stand By; tratado como reserva aeroportuária.
- `HSB` e `HSBE`: Home Stand By / Home Stand By Extra; tratados como sobreaviso.
- Siglas desconhecidas passam a gerar alerta de glossário, sem virar irregularidade automática até serem configuradas.

O motor de irregularidades foi ajustado para reduzir falsos positivos: apenas violações determinísticas aparecem como irregularidade; situações dependentes de ACT, GRF/SGRF, manual do operador, tipo de tripulação ou sigla não classificada aparecem como revisão/ponto de atenção.


## Atualização de siglas

- `C32F` agora é classificado como check de competência de equipamento A32F: prova anual para renovação da carteira de comissário da Família Airbus A32F.
- `C32F` entra como treinamento/check operacional, com duty contabilizado quando houver horários na escala, sem ser tratado como irregularidade ou sigla desconhecida.


### Glossário operacional atualizado

- `MT`: Meeting / reunião com a chefia. É atividade de solo e deve contar como compromisso/jornada quando possuir horário na escala, mas não deve ser classificada como treinamento/check.
- `JUN`, `JUL` e demais abreviações de mês ou dia da semana são ignoradas pelo analisador de siglas, pois pertencem ao calendário e não são códigos operacionais.

## Banco de dados MySQL/Aiven

Esta versão inclui persistência em MySQL/Aiven via servidor Node (`server.mjs`).

### Recursos de banco

- Conexão via `DATABASE_URL` no backend, sem expor senha no navegador.
- Criação automática das tabelas `crewcheck_rosters` e `crewcheck_audit_logs` na primeira execução.
- API interna:
  - `GET /api/db/status`
  - `POST /api/rosters`
  - `GET /api/rosters?limit=20`
  - `GET /api/rosters/:id`
  - `DELETE /api/rosters/:id`
- Botão real na tela de resultados para **Salvar análise**.
- Histórico das últimas escalas salvas no painel lateral.

### Variáveis no Render

Configure em Environment:

```text
DATABASE_URL=mysql://avnadmin:SENHA@mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com:22966/defaultdb?ssl-mode=REQUIRED
MYSQL_SSL_MODE=REQUIRED
CREWCHECK_AUTO_MIGRATE=true
NODE_VERSION=20
```

> Não grave credenciais reais no GitHub. Use sempre variáveis de ambiente.


## Versão Auth + Offline + Banco

Esta versão adiciona:

- Tela de login/cadastro premium.
- Cadastro obrigatório para acessar upload e análises.
- Backend Node com usuários, sessões e senha com hash.
- Aiven/MySQL com histórico por usuário.
- Salvamento offline-first.
- Sincronização posterior sem duplicidade por checksum.
- Botão de envio por e-mail, condicionado a SendGrid ou MailerSend configurado.
- PWA/APK-ready para instalação no Android.

## E-mail

O botão de e-mail já existe. Ele depende de variáveis no Render:

- `SENDGRID_API_KEY` + `SENDGRID_FROM`; ou
- `MAILERSEND_API_KEY` + `MAILERSEND_FROM`.

## APK offline

Leia `APK_OFFLINE.md`.

## CrewCheck v10.6.7 — temas, iFlight e Android Play Console

### Tema claro/escuro

- A preferência **Claro / Escuro / Sistema** fica salva em `crewcheck_theme_mode`.
- A aplicação aplica `data-crew-theme="light|dark"` no `<html>`, garantindo o mesmo visual no site, PWA e Android WebView.
- A camada CSS final corrige telas que ainda usavam classes escuras fixas, como login, iFlight, configurações, histórico e cards premium.

### iFlight

- O login e MFA continuam sempre manuais no portal oficial.
- O Android usa WebView interna com ponte nativa `CrewCheckIFlight.openPortalAndImport`.
- Após login, o app tenta abrir Roster/Calendar/Report, seleciona período, PDF e LT, aciona Run e captura o PDF.
- A versão web não consegue clicar/ler automaticamente outro domínio por segurança do navegador; nela o fluxo correto é baixar o PDF no iFlight e importar manualmente.

### Android / Play Console

- `applicationId`: `com.crewcheck.app`
- `versionCode`: `10607`
- `versionName`: `10.6.7`
- `minSdk`: `26`
- `targetSdk`: `35`

O projeto Android está em `android-wrapper/` e já inclui `app/build.gradle`. Para gerar AAB assinado, use o workflow **Build Android AAB** no GitHub Actions com os secrets de assinatura indicados em `RELEASE_10_6_0.md`.

### Render recomendado

```text
Build Command: npm ci && npm run build
Start Command: node server.mjs
```


## Status de voo premium (v10.8.5)

O CrewCheck consulta status de voo sempre pelo backend, preservando LGPD e evitando expor chaves no navegador. A ordem de consulta é:

1. BSB Aero público, quando a rota envolve BSB;
2. Aviationstack, se `AVIATIONSTACK_ACCESS_KEY` estiver configurada no Render;
3. Amadeus On-Demand Flight Status, se `AMADEUS_CLIENT_ID` e `AMADEUS_CLIENT_SECRET` estiverem configurados;
4. `FLIGHT_STATUS_ENDPOINT`, caso exista um proxy próprio.

A tela mostra fonte, status, portão, terminal e horário quando o provedor retornar esses dados. O app não salva senha corporativa e não envia credenciais do iFlight para provedores de status de voo.

## Pacote GitHub Compact

Esta distribuição foi reduzida para ficar com menos de 100 arquivos. Arquivos de histórico e material privado foram removidos; o código principal web, backend e Android wrapper foram preservados.


## CrewCheck v10.8.52 — Full Premium Overhaul

Design system global, Cockpit com Trust Strip, Saída Inteligente executiva, rotina reliable e refinamento Android/Web.


## CrewCheck v10.8.53 — Super Premium Refinement

Refinamento global da UI/UX, com menu de Configurações flutuante em alto contraste, tema claro/escuro mais legível, cards e botões mais consistentes e acabamento premium em Android/Web.


## CrewCheck v10.8.57 — Diárias Reais Reliable

- Motor de diárias calibrado com demonstrativos LATAM reais.
- Valor principal R$ 109,44 e café R$ 27,36.
- Pernoite fora da base gera almoço/jantar quando cobre a janela.
- Café em voo ficou conservador para reduzir falso positivo de hotel/pernoite.
- ASB não herda HSB e segue 1 principal + café quando aplicável.


## CrewCheck v10.8.59 — Diárias Internacionais Separadas Reliable

- Diárias nacionais mantidas em R$ 109,44 por refeição principal e R$ 27,36 para café.
- Diárias internacionais passam a considerar o país do pernoite/prestação no exterior conforme ACT 2025/2027.
- Argentina calibrada em USD 22.05 por refeição principal, compatível com exemplo de EZE.
- Bate-volta internacional sem pernoite permanece em reais, conforme regra operacional informada pelo usuário.
- Café internacional é conservador por poder estar incluído no hotel.
- Tela de Diárias agora separa totais por moeda para não misturar BRL, USD, EUR e GBP.


## CrewCheck v10.8.61 — Corridas calibradas por histórico real
- Métrica de preço para casa ⇄ BSB calibrada com histórico real de corridas para Presidente Juscelino/Azul.
- Separação por dia útil/fim de semana e faixa horária.
- Estimativa de carro, app econômico/99 e moto app com fonte e confiança.
- Fallback reliable quando Uber API não devolver preço oficial.


## v10.8.74 — Escala Premium sobre base estável

Baseada na v10.8.63 que estava funcionando. Mantém abertura da última escala e upload de escala nova, com parser premium para AIMS/Ticket/CrewRoster/iFlight, voo extra PS em cinza e Saída Inteligente reliable.


## v10.8.101 — Vivo de Extra + ganho por voo

Inclui Vivo de Extra com opções diretas/conexão estimadas e ganho por voo em salário usando KM × valor do KM, separado entre diurno/noturno/DFS. Valores sempre estimados.


## v10.8.102 — KM noturno em domingo/DFS

Corrige regra de ganho por voo para não quadruplicar quando domingo/DFS e noturno coincidirem. O CrewCheck aplica o maior valor de KM cabível, mantendo a previsão como estimativa.


## v10.8.103 — Diárias café e auditoria

Corrige diferença sistêmica de R$ 82,08: o valor equivale a 3 cafés de R$ 27,36. O CrewCheck passa a contar café quando voo/reserva/jornada ativa cruza 05:00–08:00 e adiciona auditoria/calibração pelo demonstrativo real de R$ 738,72.


## v10.8.104 — Radar monitor + Vivo de Extra base

Ajusta Saída Inteligente em folgas para “Vá descansar”, transforma o radar em monitor aeroportuário sem fallback de escala, remove voos finalizados e amplia Vivo de Extra para base contratual, base virtual, múltiplos aeroportos e data de pesquisa.

## v10.8.113 — Premium Unlimited vitalício

Contas autorizadas em `CREWCHECK_LIFETIME_EMAILS` recebem o plano `premium_lifetime` automaticamente. O sistema não cria checkout Asaas, não exibe cancelamento e não expira o acesso premium para esses e-mails.

## CrewCheck v10.8.123

- Apple Watch: acesse `/apple-watch` após login.
- Samsung Galaxy Watch / Wear OS: acesse `/watch` após login.
- Assinatura: Configurações > Assinatura agora possui tabela comparativa completa entre Básico gratuito, Premium mensal e Premium anual.


## CrewCheck v10.8.124

Radar API-first Premium: consulta prioritária em API, cache compartilhado inteligente, não salva cache vazio e usa monitor oficial apenas como fallback.

## v10.8.125 — Radar API real, cobrança e atalhos relógios

- Radar API-first com `/flights` prioritário e `/timetable` fallback.
- Cache compartilhado útil entre Radar e Vivo de Extra para reduzir chamadas.
- Diagnóstico admin de Asaas e links Android.
- Atalhos: `/apk`, `/w`, `/aw`.


## v10.8.128 — E-mail Interno, Logos Reais e Radar por Localização

Veja `RELEASE_10_8_128_EMAIL_LOGOS_GPS_RADAR.md`.


## v10.8.129 — Plano R$ 19,90, Radar autenticado e Asaas Sync

- Premium mensal reajustado para R$ 19,90/mês para sustentar FlightAware, radar de voos, Vivo de Extra, e-mail interno e custos operacionais.
- Premium anual padrão ajustado para R$ 199,90/ano.
- Endpoints de radar com custo de API passam a exigir usuário autenticado.
- Frontend envia token nos requests do Radar, status de voo e health.
- Novo endpoint admin `/api/admin/billing/sync-prices` para prévia/atualização de preços das assinaturas Asaas existentes.
- Mensagens de cobrança atualizadas para explicar o reajuste com transparência.
## CrewCheck v10.8.140 — Aviso curto antes da assinatura Premium

- Aviso curto de ciência exibido na página de assinatura.
- Checkout exige confirmação de ciência antes de criar cobrança no Asaas.
- Termo completo fica fora do site por enquanto, aguardando revisão jurídica.


## CrewCheck v10.8.143 — Migração urgente de trials para Asaas

- Regularização segura de usuários com teste Premium antigo sem assinatura Asaas.
- Conta comum em trial sem `asaas_subscription_id` recebe aviso na página de Assinatura.
- Endpoint do usuário: `POST /api/billing/regularize-trial-as-subscription`.
- Admin: `GET /api/admin/billing/trial-regularization`.
- Admin: `POST /api/admin/billing/trial-regularization/notify`.
- Admin: `POST /api/admin/billing/trial-regularization/backfill`.
- Backfill automático somente para trial antigo com CPF salvo e `dryRun=false`.
- Android: versionName 10.8.143 / versionCode 10938.


## v10.8.147

Checkout premium interno com Pix no app, QR Code/copia e cola, feedback de carregamento e sem pop-up automático.

---

## Build Android assinado no GitHub Actions

Este pacote já vem pronto para gerar APK e AAB assinados pelo GitHub Actions.  
Você só precisa configurar os 4 secrets abaixo no repositório:

| Secret | Conteúdo |
|---|---|
| `CREWCHECK_KEYSTORE_BASE64` | Conteúdo da nova `.jks` convertido para Base64 em uma única linha |
| `CREWCHECK_STORE_PASSWORD` | Senha da JKS |
| `CREWCHECK_KEY_ALIAS` | Alias da chave |
| `CREWCHECK_KEY_PASSWORD` | Senha da chave |

Use o arquivo `CrewCheck_NOVO_CERTIFICADO_UPLOAD_UNICO_20260621_V2.zip` para gerar o secret `CREWCHECK_KEYSTORE_BASE64`.  
Não envie `.jks`, senha, PEM ou Base64 para o GitHub como arquivo do projeto. Use apenas **Repository secrets**.

Depois de configurar os secrets:

1. Entre no repositório no GitHub.
2. Vá em **Actions**.
3. Abra **Build CrewCheck Android AAB**.
4. Clique em **Run workflow**.
5. Ao finalizar, baixe o arquivo `.aab` em **Releases** na tag `crewcheck-android-v11.0.4-latest`.

Versão Android deste pacote:

- `applicationId`: `com.crewcheck.app`
- `versionName`: `11.0.4`
- `versionCode`: `11004`


## v11.0.31 — Telegram Premium Messages

- Mensagens Telegram com cabeçalho premium, categoria e ícones contextuais.
- Botão inline “Abrir CrewCheck” nas notificações.
- Texto de conexão do bot mais claro e profissional.
- Mensagem de teste, escala importada e Saída Inteligente com linguagem mais executiva.
- Mantém o token fora do código; use TELEGRAM_BOT_TOKEN no Render.
