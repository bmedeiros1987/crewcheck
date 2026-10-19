import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const marker = 'HOTEL_MAINTENANCE_READ_ONLY';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length,2,'Maintenance build requires the exact reviewed source anchor');
  return source.replace(before,after);
}
export function verifyHotelMaintenance(root) {
  const repository = fs.readFileSync(path.join(root,'server/hotel-stay-repository.mjs'),'utf8');
  const platform = fs.readFileSync(path.join(root,'server/platform.mjs'),'utf8');
  assert.equal((repository.match(/HOTEL_MAINTENANCE_READ_ONLY/g)||[]).length,3);
  assert(repository.includes("export async function reconcileHotelRoster(client, request, { hotelKey }) {\n  return { status: 'review-required', reason: 'maintenance-read-only', pending: [], updates: [], persisted: false }; // "+marker));
  assert(repository.includes("export async function runHotelTransaction(db, request, { hotelKey }) {\n  if (request.action === 'sync') return { status: 'review-required', reason: 'maintenance-read-only', pending: [], updates: [], persisted: false }; // "+marker));
  assert(repository.includes("throw Object.assign(new Error('Hotéis temporariamente somente leitura.'), { code: 'HOTEL_MAINTENANCE_READ_ONLY', status: 503, persisted: false });"));
  assert(platform.includes("if (req.method !== 'GET') return sendJson(res, 503, { ok: false, persisted: false, code: 'HOTEL_MAINTENANCE_READ_ONLY'"));
  assert(platform.includes("hotelWriteReady: false, hotelReadiness: 'maintenance-read-only'"));
  const cache=fs.readFileSync(path.join(root,'scripts/v139/preparation-cache.mjs'),'utf8');
  assert(cache.includes("new Set(['hotel-maintenance-source.json', 'hotel-maintenance-manifest.json', 'node_modules', '.git',"));
  return true;
}
export function buildHotelMaintenance(output, sourceRoot = process.cwd()) {
  assert(path.isAbsolute(output)); assert(!fs.existsSync(output),'Output must be a fresh directory; never replace an existing checkout');
  const git = (...args) => execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8'}).trim();
  const sourceSha = git('rev-parse','HEAD'), sourceTree = git('rev-parse','HEAD^{tree}');
  assert(/^[a-f0-9]{40}$/.test(sourceSha));
  const sourceFiles = git('ls-tree','-r','--name-only','HEAD').split('\n');
  // Archive committed files only. Never copy .git, private files, dependencies,
  // environment, caches or an arbitrary dirty working tree into the artifact.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),'hotel-maintenance-archive-'));
  fs.mkdirSync(output,{recursive:false});
  try {
    const archive = path.join(temporary,'source.tar');
    execFileSync('git',['archive','--format=tar','--output',archive,'HEAD'],{cwd:sourceRoot});
    execFileSync('tar',['-xf',archive,'-C',output]);
  } finally { fs.rmSync(temporary,{recursive:true,force:true}); }
  const repoPath = path.join(output,'server/hotel-stay-repository.mjs');
  let repository = fs.readFileSync(repoPath,'utf8');
  repository = replaceOnce(repository,'export async function reconcileHotelRoster(client, request, { hotelKey }) {',
    "export async function reconcileHotelRoster(client, request, { hotelKey }) {\n  return { status: 'review-required', reason: 'maintenance-read-only', pending: [], updates: [], persisted: false }; // "+marker);
  repository = replaceOnce(repository,'export async function runHotelTransaction(db, request, { hotelKey }) {',
    "export async function runHotelTransaction(db, request, { hotelKey }) {\n  if (request.action === 'sync') return { status: 'review-required', reason: 'maintenance-read-only', pending: [], updates: [], persisted: false }; // "+marker+"\n  throw Object.assign(new Error('Hotéis temporariamente somente leitura.'), { code: 'HOTEL_MAINTENANCE_READ_ONLY', status: 503, persisted: false });");
  fs.writeFileSync(repoPath,repository);
  const platformPath = path.join(output,'server/platform.mjs');
  let platform = fs.readFileSync(platformPath,'utf8');
  platform = replaceOnce(platform,"  let savedStayId = null;\n  if (req.method !== 'GET') {",
    "  let savedStayId = null;\n  if (req.method !== 'GET') return sendJson(res, 503, { ok: false, persisted: false, code: 'HOTEL_MAINTENANCE_READ_ONLY', message: 'Hotéis temporariamente somente leitura. A edição continua neste aparelho.' });\n  if (req.method !== 'GET') {");
  platform = replaceOnce(platform,"hotelWriteReady: ready, hotelReadiness: ready ? 'ready' : 'schema-not-ready'", "hotelWriteReady: false, hotelReadiness: 'maintenance-read-only'");
  fs.writeFileSync(platformPath,platform);
  // Certificates are build output, not preparation inputs. Sealing must not
  // invalidate the cache and replay historical materializers at runtime start.
  const cachePath=path.join(output,'scripts/v139/preparation-cache.mjs');
  let cache=fs.readFileSync(cachePath,'utf8');
  cache=replaceOnce(cache,"new Set(['node_modules', '.git',","new Set(['hotel-maintenance-source.json', 'hotel-maintenance-manifest.json', 'node_modules', '.git',");
  fs.writeFileSync(cachePath,cache);
  verifyHotelMaintenance(output);
  fs.writeFileSync(path.join(output,'hotel-maintenance-source.json'),JSON.stringify({sourceSha,sourceTree,sourceFiles,mode:'hotel-maintenance-read-only',runtimeFlag:false,productionActivation:false,accountDeletionCertified:false},null,2)+'\n');
  return sealHotelMaintenance(output);
}
export function sealHotelMaintenance(root, {verifyOnly=false}={}) {
  verifyHotelMaintenance(root);
  const source=JSON.parse(fs.readFileSync(path.join(root,'hotel-maintenance-source.json'),'utf8'));
  const paths=[];
  function visit(relative='') {
    for (const name of fs.readdirSync(path.join(root,relative)).sort()) {
      if (['node_modules','.git','artifacts','.crewcheck-source-preparation.json','hotel-maintenance-source.json','hotel-maintenance-manifest.json'].includes(name)) continue;
      const file=relative?relative+'/'+name:name, stat=fs.lstatSync(path.join(root,file));
      assert(!stat.isSymbolicLink(),'Unexpected artifact symlink: '+file);
      if(stat.isDirectory()) visit(file); else if(stat.isFile()) paths.push(file);
    }
  }
  visit();
  const files=paths.sort().map(name=>({path:name,sha256:digest(fs.readFileSync(path.join(root,name)))}));
  const manifest={...source,sourceFiles:undefined,generatorSha256:digest(fs.readFileSync(fileURLToPath(import.meta.url))),artifactTransformFiles:['server/platform.mjs','server/hotel-stay-repository.mjs','scripts/v139/preparation-cache.mjs'],files,preparedTreeSha256:digest(JSON.stringify(files)),lockfileSha256:digest(fs.readFileSync(path.join(root,'package-lock.json'))),hold:true,warning:'Account deletion remains outside hotel maintenance fence; no complete no-write or deployment certification.'};
  if(verifyOnly) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'hotel-maintenance-manifest.json'),'utf8')),JSON.parse(JSON.stringify(manifest)),'Sealed artifact changed; review/build a new artifact');
  else fs.writeFileSync(path.join(root,'hotel-maintenance-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if (import.meta.url === pathToFileURL(process.argv[1]||'').href) {
  const [action,root]=process.argv.slice(2);
  assert(['--output','--seal','--verify-seal'].includes(action) && root,'Use --output <fresh absolute directory>, --seal or --verify-seal <artifact directory>');
  const result=action==='--output'?buildHotelMaintenance(root):sealHotelMaintenance(root,{verifyOnly:action==='--verify-seal'});
  console.log(JSON.stringify({mode:result.mode,sourceSha:result.sourceSha,sourceTree:result.sourceTree,preparedTreeSha256:result.preparedTreeSha256,files:result.files.length,hold:result.hold}));
}
