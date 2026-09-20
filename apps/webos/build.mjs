import {build} from 'esbuild';
import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'dist/webos');

// A regra de origem vive em packages/tv-core/src/net.ts. O build a compila em
// memoria em vez de repetir a logica aqui: CSP e runtime precisam concordar.
const netBundle = await build({
  absWorkingDir: root, entryPoints: ['packages/tv-core/src/net.ts'],
  bundle: true, write: false, format: 'esm', target: 'node18',
});
const {classifyOrigin} = await import(
  'data:text/javascript;base64,' + Buffer.from(netBundle.outputFiles[0].text).toString('base64')
);

const API_ORIGIN = process.env.TV_API_ORIGIN || 'https://crewcheck.online';
// Connected Hub na LAN. A TV fala com ele; o token do Home Assistant nunca
// sai do Hub, entao a origem do HA NAO entra em lugar nenhum deste pacote.
const HUB_ORIGIN = process.env.TV_HUB_ORIGIN || 'http://192.168.0.32:8188';

for (const [label, origin] of [['TV_API_ORIGIN', API_ORIGIN], ['TV_HUB_ORIGIN', HUB_ORIGIN]]) {
  const verdict = classifyOrigin(origin);
  if (verdict.kind === 'rejected') {
    console.error(`[webos] ${label} recusada (${origin}): ${verdict.reason}`);
    process.exit(1);
  }
}

await mkdir(dir, {recursive: true});
await build({
  absWorkingDir: root, entryPoints: ['apps/webos/entry.ts'], outfile: path.join(dir, 'app.js'),
  bundle: true, format: 'iife', target: ['chrome53'], minify: true, legalComments: 'eof',
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env': JSON.stringify({
      VITE_CREWCHECK_TV_ENABLED: 'true',
      VITE_TV_PLATFORM: 'webos',
      VITE_TV_API_ORIGIN: API_ORIGIN,
      VITE_TV_HUB_ORIGIN: HUB_ORIGIN,
    }),
  },
});

for (const file of ['appinfo.json', 'icon.png', 'largeIcon.png']) {
  await copyFile(path.join(root, 'apps/webos', file), path.join(dir, file));
}
await copyFile(
  path.join(root, 'apps/webos/node_modules/@webos-tools/cli/files/templates/tv-sdk-templates/bootplate-web/webOSTVjs-1.2.13/webOSTV.js'),
  path.join(dir, 'webOSTV.js'),
);

// CSP por origem exata. Sem curinga, sem 'unsafe-inline', sem a origem do
// Home Assistant. connect/img/media liberam so o Hub, que e de onde vem
// estado da casa, fotos e MP3.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' data: ${HUB_ORIGIN}`,
  `media-src 'self' ${HUB_ORIGIN}`,
  `connect-src 'self' ${API_ORIGIN} ${HUB_ORIGIN}`,
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

// O #root ja vem com a Home minima em HTML estatico. Se o app.js nao carregar,
// nao parsear ou lancar, isto continua na tela: a TV nunca fica preta.
const BOOT_FALLBACK = '<main class="boot boot-home"><div class="boot-inner">'
  + '<div class="boot-brand">CREW<span>CHECK</span><small>TV / VOYAGE</small></div>'
  + '<p class="boot-reason">Iniciando a sua TV…</p></div>'
  + '<div class="boot-foot"><span>← ↑ ↓ → navegar · OK selecionar</span>'
  + '<span class="boot-code">BOOT</span></div></main>';

await writeFile(path.join(dir, 'index.html'),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=1920,initial-scale=1">`
  + `<meta http-equiv="Content-Security-Policy" content="${CSP}">`
  + `<title>CrewCheck TV</title><link rel="stylesheet" href="app.css"></head>`
  + `<body><div id="root">${BOOT_FALLBACK}</div>`
  + `<script src="webOSTV.js"></script><script src="app.js"></script></body></html>`);

const manifest = JSON.parse(await readFile(path.join(dir, 'appinfo.json'), 'utf8'));
console.log(`Built ${manifest.id} ${manifest.version}: classic script, Chromium 53, 1920x1080`);
console.log(`  API  ${API_ORIGIN}`);
console.log(`  Hub  ${HUB_ORIGIN}`);
