import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const platform = read('server/platform.mjs');
const server = read('server.mjs');
const migration = read('migrations/20260713_001_platform_foundation.sql');
const template = read('.env.example');
const setup = read('docs/V14_RENDER_SUPABASE_POSTGRES_SETUP.md');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(platform.includes('roster_key=$2 AND share_with_visitors=TRUE'), 'visitante limitado à escala ativa');
assert(platform.includes('export async function refundPlatformUsage'), 'estorno de franquia implementado');
assert(server.includes('refundPlatformUsage'), 'servidor importa estorno de franquia');
assert(server.includes('if (!telegramCallResult.ok'), 'falha do provedor aciona estorno');
assert(server.includes("usage = { ...usage, ...refund, refunded: Boolean(refund.refunded) }"), 'resposta informa estorno sem expor dados');
assert(migration.includes('crewcheck_schema_migrations'), 'migration possui controle de versão');
assert(migration.includes('crewcheck_platform_rosters'), 'migration cobre escala persistida');
assert(migration.includes('crewcheck_platform_addresses'), 'migration cobre endereços configuráveis');
assert(migration.includes('crewcheck_platform_user_hotels'), 'migration cobre hotel manual e CEP');
assert(migration.includes('crewcheck_platform_parking_positions'), 'migration cobre Meu Carro');
assert(migration.includes('crewcheck_platform_finance_configs'), 'migration cobre salário e diárias versionados');
assert(migration.includes('crewcheck_platform_flight_follows'), 'migration cobre seguir voo');
assert(migration.includes('crewcheck_platform_swap_analyses'), 'migration cobre análise de trocas');
assert(template.includes('DATABASE_URL='), 'template documenta banco');
assert(template.includes('CREWCHECK_AUTH_SECRET='), 'template documenta autenticação');
assert(template.includes('CREWCHECK_DATA_ENCRYPTION_KEY='), 'template documenta criptografia');
assert(template.includes('ELEVENLABS_TTS_VOICE_ID='), 'template preserva alias ElevenLabs em uso');
assert(setup.includes('validate-production-config.mjs --strict --database'), 'guia possui validação de produção');

const forbiddenPatterns = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
for (const pattern of forbiddenPatterns) {
  assert(!pattern.test([migration, template, setup].join('\n')), 'documentação sem segredo real');
}

console.log('OK: CrewCheck v14 DB/env reliability foundation validada.');
