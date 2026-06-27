# CrewCheck v11.0.90 — Regulamentação precisa sem falso positivo

## Hotfix v11.0.90

Esta versão refina o motor de Regulamentação para reduzir falsos positivos em jornada, madrugada e repouso. Mantém o banco atual como fonte principal e mantém o Supabase apenas como backup/redundância de PDF original quando configurado.

### Regulamentação refinada

- Tempo em solo entre etapas não gera mais irregularidade automática.
- Jornada de voo passa a usar jornada líquida operacional: apresentação/corte quando disponível, abatendo solo entre pouso e nova decolagem.
- O tempo de voo real continua preservado como métrica separada.
- Sobreaviso e reserva sem acionamento não entram como madrugada operacional.
- Folga formal, OFF, inativo/pernoite e voo sem madrugada quebram a sequência de madrugadas.
- Blocos de madrugada divididos pela virada de dia são consolidados para evitar contagem dupla no mesmo período operacional.
- Alertas de solo longo foram removidos do painel de irregularidades; o solo continua visível nos detalhes da escala.
- Jornada semanal/mensal passa a usar a mesma jornada líquida para evitar inflar carga por solo entre etapas.
- Itens incertos continuam como revisão/leitura incerta, não como irregularidade confirmada.

### Gerenciador e Storage

- Banco atual continua sendo a fonte principal de escala ativa, histórico e dados processados.
- Supabase Storage continua apenas como backup/redundância do PDF original.
- Upload via app/web e Telegram mantém registro no Gerenciador de Escalas.
- Backup em nuvem pode ser limitado no plano gratuito para preservar performance do Premium.

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

### Android produção

- versionName: 11.0.90
- versionCode: 11090
- Mantém R8/ProGuard, shrinkResources e mapping para Play Console.
