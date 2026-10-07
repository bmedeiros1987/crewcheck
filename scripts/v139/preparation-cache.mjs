import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const stampPath = '.crewcheck-source-preparation.json';
const sourceRoots = ['scripts', 'server', 'client', 'android-wrapper', 'server.mjs', 'package.json', 'package-lock.json', '.env.example'];
const ignored = new Set(['node_modules', 'dist', 'build', '.gradle', '.git']);

export function preparationFingerprint(root = '.') {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    if (relative === 'server/concierge/generated') return; // compile.mjs output, not preparation input
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) { hash.update(`missing:${relative}\0`); return; }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Preparation input cannot be a symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) if (!ignored.has(name)) visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      hash.update(relative).update('\0').update(fs.readFileSync(absolute)).update('\0');
    }
  }
  sourceRoots.forEach(visit);
  return hash.digest('hex');
}

export async function prepareSourcesOnce(prepare, root = '.') {
  const stamp = path.join(root, stampPath);
  let previous;
  try { previous = JSON.parse(fs.readFileSync(stamp, 'utf8')); } catch {}
  if (previous?.version === 1 && previous.fingerprint === preparationFingerprint(root)) {
    console.log('[crewcheck:source-prepare] unchanged prepared sources; skipping legacy patch replay');
    return false;
  }
  // A failed or modified source tree is never certified as prepared.
  fs.rmSync(stamp, { force: true });
  await prepare();
  const next = { version: 1, fingerprint: preparationFingerprint(root) };
  fs.writeFileSync(`${stamp}.tmp`, `${JSON.stringify(next)}\n`);
  fs.renameSync(`${stamp}.tmp`, stamp);
  return true;
}
