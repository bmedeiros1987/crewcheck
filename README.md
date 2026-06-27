# CrewCheck v11.0.89 — Telegram no Gerenciador + backup Premium priorizado

## Hotfix v11.0.89

Esta versão corrige o fluxo de escala enviada pelo Telegram e mantém o banco atual como fonte principal.

### Corrigido

- PDF enviado pelo Telegram agora conecta/ativa o vínculo, quando necessário, e importa a escala na mesma mensagem.
- Upload via Telegram passa pelo mesmo registro do Gerenciador de Escalas usado pelo app/web.
- A escala enviada pelo Telegram aparece no Gerenciador depois de atualizar/abrir a tela.
- Banco atual continua sendo a fonte principal de escala ativa, histórico e dados processados.
- Supabase Storage continua apenas como backup/redundância do PDF original.

### Proteção de performance e plano gratuito

- Backup do PDF original em nuvem agora prioriza Premium.
- Usuário gratuito continua podendo importar conforme limite do plano, mas o backup em nuvem pode ser bloqueado por limite.
- Por padrão, `CREWCHECK_FREE_STORAGE_BACKUP_LIMIT=0` e `CREWCHECK_FREE_TELEGRAM_STORAGE_BACKUP_LIMIT=0`.
- Quando grátis não tiver direito a backup, a escala fica salva no banco/Gerenciador e marcada como `Backup Premium`.
- Premium e Admin mantêm backup automático no Supabase quando configurado.

### Variáveis recomendadas no Render

```env
DATABASE_URL=sua_database_url_atual
CREWCHECK_STORAGE_PROVIDER=supabase
CREWCHECK_STORAGE_MODE=backup
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sua_secret_key_rotacionada
CREWCHECK_SUPABASE_BUCKET_ROSTERS=crewcheck-rosters
CREWCHECK_FREE_STORAGE_BACKUP_LIMIT=0
CREWCHECK_FREE_TELEGRAM_STORAGE_BACKUP_LIMIT=0
```

Para liberar 1 backup gratuito, altere para:

```env
CREWCHECK_FREE_STORAGE_BACKUP_LIMIT=1
CREWCHECK_FREE_TELEGRAM_STORAGE_BACKUP_LIMIT=1
```

### Android produção

- versionName: 11.0.89
- versionCode: 11089
- Mantém R8/ProGuard, shrinkResources e mapping para Play Console.

