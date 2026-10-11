// Offline prototype only. No production build/start caller imports this module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {preparationFingerprint} from './preparation-cache.mjs';
const proofs=new WeakSet();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const excluded=new Set(['.git','.aws','.agents','.codex','node_modules','dist','generated']);
const sourceDirectories=new Set(['scripts','server','client','shared','config','docs','migrations','android-wrapper','ios-wrapper','.github']);
const rootFiles=new Set(['server.mjs','package.json','package-lock.json','render.yaml','tsconfig.json','vite.config.ts','capacitor.config.ts','README.md','LICENSE','.gitignore','tsconfig.node.json','crewcheck_auth_rebind_1371.js','elevenlabs_tts_1377.js','menu_scroll_1373.css','test-server.mjs']);
export function allowedSource(file,{allowVersionedEnvTemplate=false}={}) {
 const parts=file.split('/');if(parts.some(p=>p==='..'||!p||excluded.has(p)||p.startsWith('.crewcheck')))return false;
 if(parts.some(p=>p.startsWith('.env')))return allowVersionedEnvTemplate&&file==='.env.example';
 return rootFiles.has(file)||(sourceDirectories.has(parts[0])&&/\.(mjs|cjs|js|ts|tsx|json|css|html|md|yml|yaml|sql|xml|java|kt|gradle|properties|png|svg|webp|jpg|jpeg|ico|txt|snippet|snip|sh|toml|plist|entitlements)$/.test(file));
}
export function manifest(root,policy={}) {
 const files={};const walk=relative=>{for(const name of fs.readdirSync(path.join(root,relative)).sort()){
  const file=relative?`${relative}/${name}`:name;const stat=fs.lstatSync(path.join(root,file));
  if(excluded.has(name)||name.startsWith('.crewcheck')||(name.startsWith('.env')&&!(policy.allowVersionedEnvTemplate&&file==='.env.example')))continue;
  if(stat.isSymbolicLink())fail('SOURCE_SYMLINK');
  if(stat.isDirectory()){if(!relative&&!sourceDirectories.has(name))continue;walk(file);}else if(stat.isFile()&&allowedSource(file,policy))files[file]=hash(fs.readFileSync(path.join(root,file)));
 }};walk('');return files;
}
export function attestGitRaw({repository,commit,rawRoot,policy={}}) {
 if(!/^[a-f0-9]{40}$/.test(commit))fail('ORIGIN_INVALID');
 const git=args=>{const r=spawnSync('git',args,{cwd:repository,encoding:null});if(r.status!==0)fail('ORIGIN_UNAVAILABLE');return r.stdout;};
 const expected={};for(const file of git(['ls-tree','-r','--name-only',commit]).toString().trim().split('\n'))if(allowedSource(file,policy))expected[file]=hash(git(['show',`${commit}:${file}`]));
 if(JSON.stringify(manifest(rawRoot,policy))!==JSON.stringify(Object.fromEntries(Object.entries(expected).sort())))fail('RAW_ORIGIN_MISMATCH');
 const proof=Object.freeze({commit,files:expected,policy:Object.freeze({...policy})});proofs.add(proof);return proof;
}
function copyFiles(from,to,files){for(const file of Object.keys(files)){fs.mkdirSync(path.dirname(path.join(to,file)),{recursive:true});fs.copyFileSync(path.join(from,file),path.join(to,file));}}
function syncTree(root){for(const entry of fs.readdirSync(root)){const file=path.join(root,entry),stat=fs.lstatSync(file);if(stat.isDirectory())syncTree(file);else if(stat.isFile()){const fd=fs.openSync(file,'r');fs.fsyncSync(fd);fs.closeSync(fd);}}syncDirectory(root);}
const canonical=files=>JSON.stringify(Object.fromEntries(Object.entries(files).sort()));
function loadGeneration(storage){
 const ref=path.join(storage,'current.json');if(!fs.existsSync(ref))return null;
 let pointer,record;try{pointer=JSON.parse(fs.readFileSync(ref));if(!/^[a-f0-9-]+$/.test(pointer.id))fail('REFERENCE_CORRUPT');const generation=path.join(storage,'generations',pointer.id);record=JSON.parse(fs.readFileSync(path.join(generation,'manifest.json')));if(hash(JSON.stringify(record))!==pointer.manifestHash)fail('MANIFEST_CORRUPT');if(canonical(manifest(path.join(generation,'raw'),record.policy))!==canonical(record.raw))fail('BASELINE_CORRUPT');return{...record,id:pointer.id,generation};}catch(error){if(error.code?.endsWith('CORRUPT'))throw error;fail('REFERENCE_CORRUPT');}
}
export function resolvePreparedGeneration(storage){const record=loadGeneration(storage);if(!record)fail('GENERATION_ABSENT');const root=path.join(record.generation,'prepared');if(canonical(manifest(root,record.policy))!==canonical(record.prepared))fail('GENERATION_CORRUPT');return root;}
function acquire(storage){const lock=path.join(storage,'writer.lock');try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.fsyncSync(fd);fs.closeSync(fd);}catch(error){if(error.code==='EEXIST')fail('WRITER_BUSY');throw error;}return()=>fs.unlinkSync(lock);}
function durable(file,bytes){const fd=fs.openSync(file,'w');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);}
function syncDirectory(directory){const fd=fs.openSync(directory,'r');fs.fsyncSync(fd);fs.closeSync(fd);}
export function recoverPrototype(storage){
 const lock=path.join(storage,'writer.lock');if(fs.existsSync(lock)){let pid;try{pid=JSON.parse(fs.readFileSync(lock)).pid;}catch{fail('LOCK_CORRUPT');}try{process.kill(pid,0);fail('WRITER_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}fs.unlinkSync(lock);}
 // Interrupted staging is never referenced. Keep it for inspection; do not erase bytes.
 return fs.existsSync(path.join(storage,'current.json'))?resolvePreparedGeneration(storage):null;
}
export function preparePrototype({inputRoot,storage,proof,policy={},dependencyRoot,worker=['scripts/v139/apply.mjs'],gates=[],hooks={}}) {
 inputRoot=path.resolve(inputRoot);storage=path.resolve(storage);
 if(storage===inputRoot||storage.startsWith(inputRoot+path.sep)||inputRoot.startsWith(storage+path.sep))fail('STORAGE_MUST_BE_OUTSIDE_SOURCE');
 if(Object.keys(process.env).some(key=>/^CREWCHECK_.*_SKIP_APPLY$/.test(key)&&process.env[key]))fail('PARTIAL_CONTEXT_FORBIDDEN');
 const before=manifest(inputRoot,policy);let previous=loadGeneration(storage);
 if(!previous&&!proof){let v2;try{v2=JSON.parse(fs.readFileSync(path.join(inputRoot,'.crewcheck-source-preparation.json')));}catch{}if(v2?.version===2&&v2.fingerprint===preparationFingerprint(inputRoot))return{status:'legacy_v2_hit',root:inputRoot};fail('RAW_BASELINE_REQUIRED');}
 if(!previous&&(!proofs.has(proof)||canonical(before)!==canonical(proof.files)||JSON.stringify(policy)!==JSON.stringify(proof.policy)))fail('RAW_ORIGIN_MISMATCH');
 if(previous&&JSON.stringify(previous.policy)!==JSON.stringify(policy))fail('POLICY_CHANGED');
 if(previous&&canonical(before)===canonical(previous.prepared))return{status:'hit',root:resolvePreparedGeneration(storage)};
 // Detect all edits/additions/deletions of materialized paths before any writes.
 if(previous)for(const file of new Set([...Object.keys(previous.raw),...Object.keys(previous.prepared),...Object.keys(before)]))if(before[file]!==previous.prepared[file]&&previous.raw[file]!==previous.prepared[file])fail('MANUAL_MATERIALIZED_CONFLICT');
 fs.mkdirSync(storage,{recursive:true});const release=acquire(storage);const id=crypto.randomUUID();const generation=path.join(storage,'generations',id);
 try{
  const pointerBefore=fs.existsSync(path.join(storage,'current.json'))?fs.readFileSync(path.join(storage,'current.json'),'utf8'):null;
  if(previous&&JSON.parse(pointerBefore||'{}').id!==previous.id)fail('GENERATION_CHANGED');
  const raw=path.join(generation,'raw'),prepared=path.join(generation,'prepared');fs.mkdirSync(raw,{recursive:true});fs.mkdirSync(prepared);
  const nextRaw={...(previous?.raw||before)};if(previous)for(const file of new Set([...Object.keys(previous.prepared),...Object.keys(before)]))if(before[file]!==previous.prepared[file]){if(before[file])nextRaw[file]=before[file];else delete nextRaw[file];}
  for(const file of Object.keys(nextRaw)){const from=previous&&before[file]===previous.prepared[file]?path.join(previous.generation,'raw'):inputRoot;copyFiles(from,raw,{[file]:nextRaw[file]});}
  copyFiles(raw,prepared,nextRaw);if(dependencyRoot){const dependencies=path.resolve(dependencyRoot);if(!fs.statSync(dependencies).isDirectory())fail('DEPENDENCIES_INVALID');fs.symlinkSync(dependencies,path.join(prepared,'node_modules'));}durable(path.join(generation,'journal.json'),JSON.stringify({state:'staging',id}));
  hooks.beforeWorker?.({generation,prepared});
  const environment={PATH:process.env.PATH,NODE_PATH:process.env.NODE_PATH||'',TMPDIR:path.join(generation,'scratch'),HOME:path.join(generation,'scratch'),NODE_DISABLE_COMPILE_CACHE:'1'};fs.mkdirSync(environment.TMPDIR);
  environment.NODE_OPTIONS=`--import=${path.join(prepared,'scripts/ci/smoke-deny-network.mjs')}`;
  for(const args of [worker,...gates]){if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string')||args[0]?.includes('npm')||args[0]?.includes('staged-preparation-prototype'))fail('RECURSIVE_GATE_FORBIDDEN');const result=spawnSync(process.execPath,args,{cwd:prepared,env:environment,encoding:'utf8',timeout:180000});durable(path.join(generation,`worker-${hash(JSON.stringify(args))}.log`),(result.stdout||'')+(result.stderr||''));if(result.status!==0)fail('STAGING_GATE_FAILED');}
  hooks.afterWorker?.({generation,prepared});for(const name of fs.readdirSync(prepared))if(name.startsWith('.env')&&!(policy.allowVersionedEnvTemplate&&name==='.env.example'))fail('RUNTIME_ENV_FORBIDDEN');const outputs=manifest(prepared,policy);
  const record={version:3,origin:previous?.origin||{commit:proof.commit},policy,raw:nextRaw,prepared:outputs,generators:Object.fromEntries(Object.entries(nextRaw).filter(([file])=>file.startsWith('scripts/')))};
  durable(path.join(generation,'manifest.json'),JSON.stringify(record));syncTree(generation);hooks.beforePublish?.({generation,prepared});
  const pointerNow=fs.existsSync(path.join(storage,'current.json'))?fs.readFileSync(path.join(storage,'current.json'),'utf8'):null;
  if(pointerNow!==pointerBefore||canonical(manifest(inputRoot,policy))!==canonical(before))fail('SOURCE_CHANGED_DURING_PREPARATION');
  const pending=path.join(storage,`current-${id}.tmp`);durable(pending,JSON.stringify({version:3,id,manifestHash:hash(JSON.stringify(record))}));syncDirectory(storage);
  // Consumers resolve one generation. No multi-file overwrite of inputRoot occurs.
  fs.renameSync(pending,path.join(storage,'current.json'));syncDirectory(storage);return{status:'prepared',root:prepared,id};
 }finally{release();}
}
