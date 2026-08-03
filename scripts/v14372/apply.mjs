import fs from 'node:fs';

const file = 'client/src/lib/offlineSync.ts';
if (!fs.existsSync(file)) throw new Error('[v14.3.72] offlineSync.ts não encontrado.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.72] server-compatible roster fingerprint';
if (source.includes(marker)) {
  console.log('[v14.3.72] Fingerprint local já alinhado ao servidor.');
} else {
  const oldBlock = `export async function checksumRoster(payload: unknown): Promise<string> {
  const roster = (payload as any)?.roster;
  const periodKey = roster?.year && roster?.month
    ? \`period:\${roster?.crewId || roster?.crewName || 'crew'}:\${roster.year}-\${String(roster.month).padStart(2, '0')}\`
    : '';
  const text = periodKey || stableStringify(payload);
  if (crypto?.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  return \`fallback-\${Math.abs(hash)}\`;
}`;

  const newBlock = `export async function checksumRoster(payload: unknown): Promise<string> {
  const roster = (payload as any)?.roster;
  // [v14.3.72] server-compatible roster fingerprint
  // Must stay byte-for-byte compatible with server/platform.mjs rosterFingerprint():
  // sha256(JSON.stringify({ year, month, crewId, days })). This identifies a
  // concrete roster revision instead of only the publication month.
  const fingerprintPayload = roster?.days?.length
    ? { year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: roster?.days }
    : null;
  const text = fingerprintPayload ? JSON.stringify(fingerprintPayload) : stableStringify(payload);
  if (crypto?.subtle) {
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  return \`fallback-\${Math.abs(hash)}\`;
}`;

  if (!source.includes(oldBlock)) throw new Error('[v14.3.72] Bloco checksumRoster esperado não encontrado.');
  source = source.replace(oldBlock, newBlock);
  fs.writeFileSync(file, source, 'utf8');
  console.log('[v14.3.72] Checksum local usa o mesmo fingerprint SHA-256 do servidor.');
}

await import('./privacy-redaction.mjs');
await import('../p0-active-roster-server/apply.mjs');
