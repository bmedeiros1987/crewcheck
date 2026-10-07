import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const stampPath = '.crewcheck-source-preparation.json';
// Walk the entire project, not a whitelist of historical patch inputs. Never read
// dependencies, Vite output, compiler output, Git internals or local private files.
const ignoredNames = new Set(['node_modules', '.git', '.aws', '.codex', '.agents', stampPath, `${stampPath}.tmp`]);
const ignoredPaths = new Set(['dist', 'server/concierge/generated']);

export function preparationFingerprint(root = '.') {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    const name = path.basename(relative);
    if (ignoredNames.has(name) || ignoredPaths.has(relative) || name.endsWith('.tsbuildinfo')) return;
    if (name.startsWith('.env') && name !== '.env.example') return;
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Preparation input cannot be a symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) visit(relative ? `${relative}/${entry}` : entry);
    } else if (stat.isFile()) {
      hash.update(relative).update('\0').update(fs.readFileSync(absolute)).update('\0');
    }
  }
  visit('');
  return hash.digest('hex');
}

export async function prepareSourcesOnce(prepare, root = '.', { finalize = async () => {}, env = process.env } = {}) {
  const stamp = path.join(root, stampPath);
  // Even a cached tree must not hide a change to the partial-preparation context.
  const skipFlags = Object.keys(env).filter(name => /^CREWCHECK_.*_SKIP_APPLY$/.test(name) && String(env[name] || '') !== '').sort();
  let previous;
  try { previous = JSON.parse(fs.readFileSync(stamp, 'utf8')); } catch {}
  const cached = skipFlags.length === 0 && previous?.version === 2 && previous.fingerprint === preparationFingerprint(root);
  fs.rmSync(stamp, { force: true });
  if (cached) console.log('[crewcheck:source-prepare] unchanged prepared sources; skipping legacy patch replay');
  else await prepare();
  // The canonical finalizer runs on both hits and misses; snapshot only its final
  // result. A preparation/finalization failure never leaves a valid certificate.
  await finalize();
  if (skipFlags.length) {
    console.log(`[crewcheck:source-prepare] partial context (${skipFlags.join(', ')}); no cache certificate`);
    return !cached;
  }
  const next = { version: 2, fingerprint: preparationFingerprint(root) };
  fs.writeFileSync(`${stamp}.tmp`, `${JSON.stringify(next)}\n`);
  fs.renameSync(`${stamp}.tmp`, stamp);
  return !cached;
}
