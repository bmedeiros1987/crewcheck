// Environment inventory for a service move, by NAME only. It never reads process.env or any
// value: it scans render.yaml and the server sources for variable names, and with --check it
// compares a list of names (one per line, e.g. copied from the new service's dashboard) with
// the names the move cannot go without. A line carrying a value (NAME=...) is refused.
//
//   node scripts/ops/env-names.mjs                 # JSON inventory of names by group
//   node scripts/ops/env-names.mjs --check FILE    # missing critical names in FILE
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same value as before or users/data break: sessions, stored ciphertexts, audit hashes, the DB.
// Several fall back to CREWCHECK_AUTH_SECRET when unset (data key, audit salts), so the new
// service must also keep each one SET or UNSET exactly as the old one: setting a name that was
// unset changes the derived key and makes stored ciphertexts unreadable.
export const KEEP_SAME = ['DATABASE_URL', 'MYSQL_SSL_MODE', 'CREWCHECK_AUTH_SECRET', 'CREWCHECK_DATA_ENCRYPTION_KEY',
  'CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY', 'CREWCHECK_WHATSAPP_AUDIT_SALT', 'CREWCHECK_AUDIT_HASH_SALT', 'CREWCHECK_TERMS_AUDIT_SALT'];
// Bound to configuration held by a provider (webhooks, OAuth): must match what the provider has.
export const PROVIDER_BOUND = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN', 'MAILERSEND_API_KEY',
  'MAILERSEND_WEBHOOK_SECRET', 'INFOBIP_API_KEY', 'GOOGLE_OAUTH_WEB_CLIENT_ID', 'GOOGLE_OAUTH_WEB_CLIENT_SECRET'];
// Public addresses: must stay https://crewcheck.online (the Android app opens that origin).
export const PUBLIC_URLS = ['CREWCHECK_PUBLIC_BASE_URL', 'TELEGRAM_PUBLIC_BASE_URL', 'GOOGLE_OAUTH_REDIRECT_URI'];
export const CRITICAL = [...KEEP_SAME, ...PROVIDER_BOUND, ...PUBLIC_URLS];

const NAME = /^[A-Z][A-Z0-9_]{2,}$/;

export function renderYamlNames(text) {
  const out = { secret: [], declared: [], generated: [] };
  const blocks = text.split(/\n\s*- key: /).slice(1);
  for (const block of blocks) {
    const name = block.split('\n')[0].trim();
    if (!NAME.test(name)) continue;
    if (/\n\s*sync:\s*false/.test(block)) out.secret.push(name);
    else if (/\n\s*generateValue:\s*true/.test(block)) out.generated.push(name);
    else out.declared.push(name);
  }
  return out;
}

export function codeNames(sources) {
  const names = new Set();
  const patterns = [/process\.env\.([A-Z][A-Z0-9_]{2,})/g, /process\.env\[['"]([A-Z][A-Z0-9_]{2,})['"]\]/g,
    /\benv(?:Any|First)?\(\s*\[([^\]]*)\]/g, /\benv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g];
  for (const source of sources) for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    for (const name of (match[1].match(/[A-Z][A-Z0-9_]{2,}/g) || [])) names.add(name);
  }
  return [...names].sort();
}

/** Names only. Refuses any line that looks like it carries a value. */
export function parseNameList(text) {
  const names = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/[=:\s]/.test(line) || !NAME.test(line)) throw Error('Only variable names, one per line (no values).');
    names.push(line);
  }
  return names;
}

export function missingCritical(names) {
  const present = new Set(names);
  return { keepSame: KEEP_SAME.filter(n => !present.has(n)), providerBound: PROVIDER_BOUND.filter(n => !present.has(n)), publicUrls: PUBLIC_URLS.filter(n => !present.has(n)) };
}

export function serverSources(root) {
  const files = [path.join(root, 'server.mjs')];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(mjs|js|snippet)$/.test(entry.name)) files.push(file);
  } };
  for (const dir of ['server', 'shared']) if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
  return files.map(file => fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const check = process.argv.indexOf('--check');
  if (check > 0) {
    const missing = missingCritical(parseNameList(fs.readFileSync(process.argv[check + 1], 'utf8')));
    console.log(JSON.stringify(missing, null, 2));
    process.exitCode = Object.values(missing).some(list => list.length) ? 1 : 0;
  } else {
    const render = renderYamlNames(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8'));
    const code = codeNames(serverSources(root));
    const declared = new Set([...render.secret, ...render.declared, ...render.generated]);
    console.log(JSON.stringify({ critical: { keepSame: KEEP_SAME, providerBound: PROVIDER_BOUND, publicUrls: PUBLIC_URLS },
      renderYaml: render, readByCodeNotInRenderYaml: code.filter(n => !declared.has(n)) }, null, 2));
  }
}
