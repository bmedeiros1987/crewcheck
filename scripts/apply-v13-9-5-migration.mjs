import fs from 'node:fs';

const connectionString = String(process.env.DATABASE_URL || '').trim();
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
  ssl: { rejectUnauthorized: false },
  multipleStatements: true,
});

try {
  const sql = fs.readFileSync('migrations/20260716_007_v1395_medical_emergency_care.sql', 'utf8');
  await db.query(sql);
  console.log('OK: migration 20260716_007 aplicada no Aiven MySQL.');
} finally {
  await db.end();
}
