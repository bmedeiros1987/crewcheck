# CrewCheck v14: banco, Render e produção

Este guia prepara a base 13.8.0+ sem armazenar segredos no GitHub. O CrewCheck usa PostgreSQL como fonte primária para escala, assinaturas, visitantes, compartilhamentos e os novos módulos operacionais.

## 1. Preparar o PostgreSQL ou Supabase

1. Crie um projeto PostgreSQL/Supabase na região mais próxima do Render.
2. No Supabase, abra **Project Settings > Database > Connection string**.
3. Use a conexão de servidor com SSL. Para Render, prefira o pooler em modo session quando disponível.
4. Abra o **SQL Editor** e execute integralmente:

   `migrations/20260713_001_platform_foundation.sql`

5. Execute novamente o mesmo arquivo para confirmar idempotência. A segunda execução não deve apagar dados nem falhar.
6. Não exponha `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `DATABASE_URL` ao frontend. Elas pertencem somente ao serviço web no Render.

O servidor ainda mantém criação defensiva das tabelas históricas, mas a migration passa a ser a fonte oficial do schema. Assim, falhas de permissão aparecem no deploy, antes de um usuário abrir o aplicativo.

## 2. Configurar o Render

No serviço do CrewCheck, abra **Environment** e cadastre as variáveis de [`.env.example`](../.env.example). Use **Sync: Manual** para segredos.

Obrigatórias para o núcleo:

- `DATABASE_URL`
- `CREWCHECK_AUTH_SECRET`
- `CREWCHECK_DATA_ENCRYPTION_KEY`
- `CREWCHECK_PUBLIC_URL`
- `CREWCHECK_ADMIN_EMAILS`
- `NODE_ENV=production`

Gere dois segredos diferentes, com pelo menos 32 bytes aleatórios. Não reutilize senha, token do GitHub ou chave de provedor. Depois de gravados, mantenha os valores protegidos no Render.

Configuração recomendada do serviço:

- Build command: `npm ci && npm run check && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`
- Pre-deploy command: `node scripts/validate-production-config.mjs --strict --database`

Se o plano do Render não oferecer pre-deploy command, execute o validador localmente contra a mesma `DATABASE_URL` antes do **Clear build cache & deploy**.

## 3. Supabase e permissões

As tabelas `crewcheck_*` são acessadas apenas pelo backend. O navegador não deve consultar o banco diretamente.

- Se usar somente `DATABASE_URL`, não publique credenciais do banco em variáveis `VITE_*`.
- Se o frontend precisar do Supabase no futuro, exponha apenas `SUPABASE_PUBLISHABLE_KEY`.
- Não exponha a chave secreta/service role.
- Revogue imediatamente qualquer chave já colada em chat, log, commit ou print.
- Faça backup antes de migrations futuras e habilite Point-in-Time Recovery quando o plano permitir.

## 4. Salário e diárias

Valores financeiros não ficam hardcoded no aplicativo. A tabela `crewcheck_platform_finance_configs` guarda versões com vigência e três escopos:

- `system`: parâmetros padrão administrativos;
- `act`: regras de ACT/CCT com fonte e período;
- `user`: ajustes pessoais autorizados.

Cada configuração deve registrar `effective_from`, moeda, referência da fonte e autor. Uma alteração de ACT cria uma nova versão; não sobrescreve cálculos históricos. A interface deve mostrar ao usuário somente valores, fonte e vigência pertinentes, nunca métricas internas do motor.

## 5. Verificar sem revelar segredos

Validação do template:

```bash
node scripts/validate-production-config.mjs --template
```

Validação completa no ambiente de produção:

```bash
node scripts/validate-production-config.mjs --strict --database
```

O script imprime apenas nomes de variáveis e status. Ele nunca imprime valores, URLs completas do banco, tokens ou chaves.

## 6. Checklist de deploy

- [ ] Migration aplicada e registrada em `crewcheck_schema_migrations`.
- [ ] Validador retorna todas as obrigatórias como `OK`.
- [ ] `npm ci`, TypeScript e build concluídos.
- [ ] `/api/health` responde 200.
- [ ] Login normal funciona sem desativar autenticação.
- [ ] Importação salva e reabre a mesma escala.
- [ ] Visitante vê somente pernoites da escala ativa.
- [ ] Falha de ligação não consome franquia mensal.
- [ ] Telegram, ElevenLabs, e-mail, radar e mapas mostram estado configurado.
- [ ] Nenhum segredo existe no repositório ou no bundle do frontend.
- [ ] Backup do banco confirmado antes do merge/deploy.

## 7. Recuperação

Se o deploy falhar:

1. não apague tabelas;
2. volte o serviço para o commit anterior;
3. consulte os logs do validador, que indicam somente nomes ausentes;
4. corrija a variável ou aplique a migration;
5. execute novo deploy com cache limpo.

A tela de acesso seguro deve permanecer disponível apenas como recuperação. Ela não deve substituir a abertura normal do CrewCheck.
