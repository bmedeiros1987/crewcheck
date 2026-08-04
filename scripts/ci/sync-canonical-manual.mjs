import fs from 'node:fs';

const RELEASE_PATH = 'client/public/release.json';
const MANUAL_PATH = 'client/public/manual.html';

function readRequired(path) {
  if (!fs.existsSync(path)) throw new Error(`[manual-sync] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

export function syncCanonicalManualVersion(source, version) {
  const normalized = String(version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) throw new Error(`[manual-sync] Versão canônica inválida: ${normalized || '(vazia)'}`);

  let patched = source;
  const replacements = [
    [/(<title>Manual CrewCheck v)\d+\.\d+\.\d+(<\/title>)/, `$1${normalized}$2`],
    [/(<span class="tag">CrewCheck v)\d+\.\d+\.\d+(<\/span>)/, `$1${normalized}$2`],
    [/(<p class="small">Última revisão: CrewCheck v)\d+\.\d+\.\d+/, `$1${normalized}`],
  ];

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(patched)) throw new Error(`[manual-sync] Marcador canônico ausente em ${MANUAL_PATH}: ${pattern}`);
    patched = patched.replace(pattern, replacement);
  }

  return patched;
}

if (process.env.CREWCHECK_MANUAL_SYNC_SKIP_APPLY !== '1') {
  const release = JSON.parse(readRequired(RELEASE_PATH));
  const version = String(release?.version || '').trim();
  const before = readRequired(MANUAL_PATH);
  const after = syncCanonicalManualVersion(before, version);
  if (after !== before) fs.writeFileSync(MANUAL_PATH, after, 'utf8');
  console.log(`[manual-sync] Manual Web alinhado à release canônica ${version}.`);
}
