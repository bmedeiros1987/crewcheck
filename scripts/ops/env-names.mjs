// Environment inventory for a service move, by NAME only. It never reads process.env or any
// value: it scans render.yaml and the server sources for variable names, and --check compares
// the names set on the old service with the names set on the new one (one per line, copied
// from each dashboard). A line carrying a value (NAME=...) is refused.
//
//   node scripts/ops/env-names.mjs                                  # inventory by group
//   node scripts/ops/env-names.mjs --check --old OLD.txt --new NEW.txt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Truly mandatory: the database, and the session secret (without it the code signs with a
// fixed development secret).
export const REQUIRED = ['DATABASE_URL', 'CREWCHECK_AUTH_SECRET'];
// Optional, but their presence decides a derivation: several fall back to CREWCHECK_AUTH_SECRET
// (or to each other) when unset. Each must be SET or UNSET on the new service exactly as on the
// old one: adding a name that was unset changes the derived key and makes stored ciphertexts or
// audit hashes unreadable; dropping one that was set does the same.
export const PRESENCE_LOCKED = ['MYSQL_SSL_MODE', 'CREWCHECK_DATA_ENCRYPTION_KEY', 'CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY',
  'CREWCHECK_WHATSAPP_AUDIT_SALT', 'CREWCHECK_AUDIT_HASH_SALT', 'CREWCHECK_TERMS_AUDIT_SALT', 'JWT_SECRET'];
// Same value as before (values are never handled here).
export const KEEP_SAME = [...REQUIRED, ...PRESENCE_LOCKED];
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

/**
 * Compares the names set on the old and on the new service. Fails on a missing required name,
 * on any presence change of a derivation-sensitive name and on any name the old service had and
 * the new one lacks. Names only added on the new side (and not sensitive) are reported, not failed.
 */
export function compareNames(oldNames, newNames) {
  const before = new Set(oldNames), after = new Set(newNames);
  const report = {
    requiredMissing: REQUIRED.filter(n => !after.has(n)),
    presenceChanged: PRESENCE_LOCKED.filter(n => before.has(n) !== after.has(n)).map(n => ({ name: n, old: before.has(n) ? 'set' : 'unset', new: after.has(n) ? 'set' : 'unset' })),
    missingFromOld: [...before].filter(n => !after.has(n) && !PRESENCE_LOCKED.includes(n)).sort(),
    addedOnNew: [...after].filter(n => !before.has(n) && !PRESENCE_LOCKED.includes(n)).sort(),
  };
  report.ok = !report.requiredMissing.length && !report.presenceChanged.length && !report.missingFromOld.length;
  return report;
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
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ''; };
  if (process.argv.includes('--check')) {
    if (!arg('--old') || !arg('--new')) { console.error('Usage: env-names.mjs --check --old OLD.txt --new NEW.txt (names only, one per line)'); process.exit(2); }
    const report = compareNames(parseNameList(fs.readFileSync(arg('--old'), 'utf8')), parseNameList(fs.readFileSync(arg('--new'), 'utf8')));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } else {
    const render = renderYamlNames(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8'));
    const code = codeNames(serverSources(root));
    const declared = new Set([...render.secret, ...render.declared, ...render.generated]);
    console.log(JSON.stringify({ critical: { required: REQUIRED, presenceLocked: PRESENCE_LOCKED, providerBound: PROVIDER_BOUND, publicUrls: PUBLIC_URLS },
      renderYaml: render, readByCodeNotInRenderYaml: code.filter(n => !declared.has(n)) }, null, 2));
  }
}
