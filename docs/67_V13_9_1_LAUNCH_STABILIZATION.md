# CrewCheck v13.9.1 — Launch Stabilization

## Objetivo

Estabilizar o núcleo antes da abertura pública: escala, CrewLock, BIDS/PBS, hotel/apresentação, rotina, emergência, Android e identidade visual.

## CrewLock

- criptografia AES-256-GCM no dispositivo;
- `CLOUDINARY_URL` ou credenciais separadas;
- fallback cifrado no Aiven MySQL;
- endpoint de diagnóstico `/api/platform/crewlock/health`;
- PDF, JPG, PNG, WebP, HEIC e HEIF;
- limite do fallback configurável.

## PBS

- NB e WB usam a mesma janela geral;
- fevereiro: geral 7–11, instrutor 7–10;
- março: 11–15, instrutor 11–15;
- abril: 11–15, instrutor 11–14;
- maio: geral 10–14, instrutor 10–12;
- junho: 11–15, instrutor 11–14;
- julho a outubro: geral 11–15, instrutor 11–13;
- novembro: geral 10–14, instrutor 10–12;
- dezembro: geral 11–15, instrutor 11–13;
- janeiro permanece manual até comunicação oficial.

## Escala e descanso

- dias explícitos nunca são eliminados por deduplicação de data;
- continuidade física na mesma localidade cria pernoite/descanso quando o intervalo é de pelo menos 12 horas;
- descanso na base não é convertido em folga;
- OFF/DO/DOF somente quando publicados;
- card visual verde para tripulando, cinza para extra/deslocamento e roxo para pernoite;
- tempo em solo aparece quando igual ou superior a 60 minutos.

## Hotel e apresentação

- hotel do catálogo aparece primeiro pelo aeroporto;
- hotel manual para contingência;
- quarto, apresentação e antecedência em campos separados;
- endereço de casa persistente e editável para descanso na base;
- quarto não é compartilhado em alertas coletivos.

## Emergência

- tipos: fogo/fumaça, médica, segurança, acidente, sem transporte e outra;
- confirmação antes do envio;
- contatos autorizados do Compartilhar;
- colegas opt-in no mesmo hotel;
- perfil médico cifrado e compartilhado somente com consentimento em alerta médico;
- comando Telegram `/emergencia`.

## Android e portal de escala

- autenticação e MFA continuam manuais;
- credenciais não são armazenadas;
- leitura do calendário e dos relatórios disponíveis;
- bloqueio explícito de ações de ciência, aceite e confirmação de programação;
- a integração deve ser validada em sessão real sempre que o portal corporativo mudar.

## Migration PowerShell

```powershell
$env:DATABASE_URL='URI_MYSQL_DO_AIVEN'
node scripts/apply-v13-9-1-migration.mjs
Remove-Item Env:DATABASE_URL
```

## Variáveis novas

```env
CREWCHECK_CREWLOCK_DB_FALLBACK=true
CREWCHECK_CREWLOCK_DB_FALLBACK_MAX_MB=10
CREWCHECK_EMERGENCY_ENABLED=true
CREWCHECK_EMERGENCY_RATE_LIMIT_SECONDS=60
CREWCHECK_DATA_ENCRYPTION_KEY=
CLOUDINARY_URL=
```
