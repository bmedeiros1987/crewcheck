import fs from 'node:fs';

const file = 'client/src/lib/offlineSync.ts';
if (!fs.existsSync(file)) throw new Error('[v14.3.73] offlineSync.ts não encontrado.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.73] server-sanitized roster fingerprint';
if (source.includes(marker)) {
  console.log('[v14.3.73] Fingerprint local já usa representação sanitizada do servidor.');
  process.exit(0);
}

const oldBlock = `  const fingerprintPayload = roster?.days?.length
    ? { year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: roster?.days }
    : null;
  const text = fingerprintPayload ? JSON.stringify(fingerprintPayload) : stableStringify(payload);`;

const newBlock = `  // [v14.3.73] server-sanitized roster fingerprint
  // Mirror server/platform.mjs sanitizeRoster() before rosterFingerprint():
  // rawText is blanked, days are capped at 370 and legs at 16.
  const sanitizedDays = Array.isArray(roster?.days)
    ? roster.days.slice(0, 370).map((day: any) => ({
        ...day,
        rawText: '',
        legs: Array.isArray(day?.legs) ? day.legs.slice(0, 16) : [],
      }))
    : [];
  const fingerprintPayload = sanitizedDays.length
    ? { year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: sanitizedDays }
    : null;
  const text = fingerprintPayload ? JSON.stringify(fingerprintPayload) : stableStringify(payload);`;

if (!source.includes(oldBlock)) throw new Error('[v14.3.73] Bloco de fingerprint v14.3.72 esperado não encontrado.');
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source, 'utf8');
console.log('[v14.3.73] Checksum local replica a sanitização usada antes do fingerprint no servidor.');
