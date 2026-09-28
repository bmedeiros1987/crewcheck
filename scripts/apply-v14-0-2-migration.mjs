import fs from 'node:fs';

const connectionString = String(process.env.DATABASE_URL || process.env.CREWCHECK_DATABASE_URL || process.env.MYSQL_URL || '').trim();
if (!/^mysql:\/\//i.test(connectionString)) throw new Error('Defina DATABASE_URL do Aiven MySQL somente nesta sessão.');

const parsed = new URL(connectionString);
const module = await import('mysql2/promise');
const mysql = module.default || module;
const db = await mysql.createConnection({
  host: parsed.hostname,
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'defaultdb'),
  charset: 'utf8mb4',
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
});

try {
  await db.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
  const sql = fs.readFileSync('migrations/20260719_009_google_oauth_legal_utf8.sql', 'utf8');
  await db.query(sql);
  const [rows] = await db.query("SELECT version,title,content_hash,published_at FROM crewcheck_platform_terms WHERE status='published' ORDER BY version DESC LIMIT 1");
  if (!rows?.[0]) throw new Error('A migração terminou sem uma versão publicada dos Termos.');
  console.log(`OK: Termos UTF-8 v${rows[0].version} publicados — ${rows[0].title}`);
} finally {
  await db.end();
}
