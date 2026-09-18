import {build} from 'esbuild';
import {mkdir, copyFile, writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = path.join(root, 'dist/webos');
await mkdir(dir, {recursive:true});
await build({absWorkingDir:root, entryPoints:['apps/webos/entry.ts'], outfile:path.join(dir,'app.js'), bundle:true,
  format:'iife', target:['chrome53'], minify:true, legalComments:'eof', define:{'process.env.NODE_ENV':'"production"',
    'import.meta.env':JSON.stringify({VITE_CREWCHECK_TV_ENABLED:'true',VITE_TV_PLATFORM:'webos',VITE_TV_API_ORIGIN:'https://crewcheck.online'})}});
for (const file of ['appinfo.json','icon.png','largeIcon.png']) await copyFile(path.join(root,'apps/webos',file),path.join(dir,file));
await copyFile(path.join(root,'apps/webos/node_modules/@webos-tools/cli/files/templates/tv-sdk-templates/bootplate-web/webOSTVjs-1.2.13/webOSTV.js'),path.join(dir,'webOSTV.js'));
await writeFile(path.join(dir,'index.html'),`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=1920,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https://crewcheck.online; object-src 'none'; base-uri 'none'"><title>CrewCheck TV</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="webOSTV.js"></script><script src="app.js"></script></body></html>`);
const manifest=JSON.parse(await readFile(path.join(dir,'appinfo.json'),'utf8'));
console.log(`Built ${manifest.id} ${manifest.version}: classic script, Chromium 53, 1920x1080`);
