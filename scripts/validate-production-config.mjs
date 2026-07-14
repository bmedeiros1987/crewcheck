import fs from 'node:fs';

const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const checkDatabase = args.has('--database');
const checkTemplate = args.has('--template');

const groups = [
  { id: 'core.database', level: 'required', any: ['DATABASE_URL'] },
  { id: 'core.auth', level: 'required', any: ['CREWCHECK_AUTH_SECRET'] },
  { id: 'core.encryption', level: 'required', any: ['CREWCHECK_DATA_ENCRYPTION_KEY'] },
  { id: 'core.publicUrl', level: 'required', any: ['CREWCHECK_PUBLIC_URL', 'PUBLIC_APP_URL', 'APP_URL'] },
  { id: 'core.admin', level: 'required', any: ['CREWCHECK_ADMIN_EMAILS', 'CREWCHECK_ADMIN_EMAIL'] },
  { id: 'email.provider', level: 'recommended', allAny: [['MAILERSEND_API_KEY'], ['MAILERSEND_FROM', 'SMTP_FROM']] },
  { id: 'telegram.bot', level: 'recommended', allAny: [['TELEGRAM_BOT_TOKEN', 'CREWCHECK_TELEGRAM_BOT_TOKEN'], ['TELEGRAM_BOT_USERNAME']] },
  { id: 'elevenlabs.tts', level: 'recommended', allAny: [['ELEVENLABS_API_KEY'], ['ELEVENLABS_TTS_VOICE_ID', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_DEFAULT_VOICE_ID']] },
  { id: 'asaas.web', level: 'optional', allAny: [['ASAAS_API_KEY'], ['ASAAS_WEBHOOK_TOKEN']] },
  { id: 'googlePlay.billing', level: 'optional', allAny: [['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'], ['GOOGLE_PLAY_PACKAGE_NAME']] },
  { id: 'radar.provider', level: 'optional', any: ['FLIGHTAWARE_API_KEY', 'AVIATIONSTACK_API_KEY', 'AERODATABOX_API_KEY'] },
  { id: 'maps.provider', level: 'optional', any: ['GOOGLE_MAPS_API_KEY', 'TOMTOM_API_KEY', 'OPENROUTESERVICE_API_KEY', 'MAPBOX_ACCESS_TOKEN'] },
];

const requiredTables = [
  'crewcheck_schema_migrations',
  'crewcheck_platform_profiles',
  'crewcheck_platform_subscriptions',
  'crewcheck_platform_usage',
  'crewcheck_platform_rosters',
  'crewcheck_platform_hotel_rules',
  'crewcheck_platform_stays',
  'crewcheck_platform_shares',
  'crewcheck_platform_visitors',
  'crewcheck_platform_connections',
  'crewcheck_platform_chat_threads',
  'crewcheck_platform_chat_messages',
  'crewcheck_platform_gym_checkins',
  'crewcheck_platform_webhook_events',
  'crewcheck_platform_emergencies',
  'crewcheck_telegram_state',
  'crewcheck_platform_auth_attempts',
  'crewcheck_platform_addresses',
  'crewcheck_platform_user_hotels',
  'crewcheck_platform_gym_preferences',
  'crewcheck_platform_routine_preferences',
  'crewcheck_platform_parking_positions',
  'crewcheck_platform_finance_configs',
  'crewcheck_platform_flight_follows',
  'crewcheck_platform_swap_analyses',
  'crewcheck_platform_schedule_comparisons',
];

const configured = (name) => Boolean(String(process.env[name] || '').trim());
const groupStatus = (group) => {
  if (group.any) return group.any.some(configured);
  return group.allAny.every((aliases) => aliases.some(configured));
};

const results = groups.map((group) => ({
  id: group.id,
  level: group.level,
  configured: groupStatus(group),
  variables: group.any || group.allAny.flat(),
}));

const failures = results.filter((item) => item.level === 'required' && !item.configured);
const recommendations = results.filter((item) => item.level === 'recommended' && !item.configured);

function printConfiguration() {
  console.log('CrewCheck production configuration');
  for (const item of results) {
    console.log(`[${item.configured ? 'OK' : item.level === 'required' ? 'MISSING' : 'WAITING'}] ${item.id}: ${item.variables.join(' | ')}`);
  }
}

function validateTemplate() {
  const file = '.env.example';
  if (!fs.existsSync(file)) throw new Error('.env.example não encontrado.');
  const source = fs.readFileSync(file, 'utf8');
  const forbidden = [
    /gh[pousr]_[A-Za-z0-9]{20,}/,
    /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(source)) throw new Error('O .env.example parece conter um segredo real.');
  }
  const names = new Set(source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('='))));
  const missingNames = [...new Set(groups.flatMap((group) => group.any || group.allAny.flat()))]
    .filter((name) => !names.has(name));
  if (missingNames.length) throw new Error(`Variáveis ausentes no template: ${missingNames.join(', ')}`);
  console.log(`[OK] .env.example seguro e documenta ${names.size} variáveis.`);
}

async function validateDatabase() {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('DATABASE_URL não configurada.');
  const pg = await import('pg');
  const Pool = pg.Pool || pg.default?.Pool;
  const local = /localhost|127\.0\.0\.1/.test(connectionString) || String(process.env.PGSSLMODE || '').toLowerCase() === 'disable';
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  try {
    const result = await pool.query(
      'SELECT name, to_regclass($1 || name) IS NOT NULL AS present FROM unnest($2::text[]) AS name',
      ['public.', requiredTables],
    );
    const missing = result.rows.filter((row) => !row.present).map((row) => row.name);
    if (missing.length) throw new Error(`Tabelas ausentes: ${missing.join(', ')}. Aplique migrations/20260713_001_platform_foundation.sql.`);
    const migration = await pool.query('SELECT version, applied_at FROM crewcheck_schema_migrations ORDER BY applied_at DESC LIMIT 1');
    console.log(`[OK] PostgreSQL conectado; ${requiredTables.length} tabelas verificadas; migration ${migration.rows[0]?.version || 'sem registro'}.`);
  } finally {
    await pool.end();
  }
}

printConfiguration();

try {
  if (checkTemplate) validateTemplate();
  if (checkDatabase) await validateDatabase();
} catch (error) {
  console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

if (strict && failures.length) {
  console.error(`[ERROR] Configuração obrigatória incompleta: ${failures.map((item) => item.id).join(', ')}`);
  process.exitCode = 1;
} else if (failures.length) {
  console.warn(`[WARN] Obrigatórias ainda ausentes: ${failures.map((item) => item.id).join(', ')}`);
}

if (recommendations.length) {
  console.warn(`[WARN] Integrações recomendadas aguardando configuração: ${recommendations.map((item) => item.id).join(', ')}`);
}

if (!process.exitCode) console.log('[OK] Validação concluída sem expor valores de variáveis.');
