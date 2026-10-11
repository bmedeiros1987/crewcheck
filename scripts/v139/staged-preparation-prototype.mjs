// Offline prototype only. No production build/start caller imports this module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {snapshot,verifySnapshot,copyDependencies} from './prototype-snapshots.mjs';
import {runPrototypeNode} from './prototype-processes.mjs';
import {preparationFingerprint} from './preparation-cache.mjs';
const proofs=new WeakSet();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const excluded=new Set(['.git','.aws','.agents','.codex','node_modules','dist']);
const sourceDirectories=new Set(['scripts','server','client','shared','config','docs','migrations','android-wrapper','ios-wrapper','.github','database']);
const rootFiles=new Set(['server.mjs','package.json','package-lock.json','render.yaml','tsconfig.json','vite.config.ts','capacitor.config.ts','README.md','LICENSE','.gitignore','tsconfig.node.json','crewcheck_auth_rebind_1371.js','elevenlabs_tts_1377.js','menu_scroll_1373.css','test-server.mjs']);
export function allowedSource(file,{allowVersionedEnvTemplate=false}={}) {
 const parts=file.split('/');if(parts.some(p=>p==='..'||!p||excluded.has(p)||p.startsWith('.crewcheck')))return false;
 if(parts.some(p=>p.startsWith('.env')))return allowVersionedEnvTemplate&&file==='.env.example';
 return rootFiles.has(file)||(sourceDirectories.has(parts[0])&&/\.(mjs|cjs|js|ts|tsx|mts|cts|py|pro|webmanifest|json|css|html|md|yml|yaml|sql|xml|java|kt|gradle|properties|png|svg|webp|jpg|jpeg|ico|woff|woff2|ttf|otf|eot|mp3|mp4|pdf|txt|snippet|snip|sh|toml|plist|entitlements)$/.test(file));
}
export function manifest(root,policy={}) {
 const files={};const walk=relative=>{for(const name of fs.readdirSync(path.join(root,relative)).sort()){
  const file=relative?`${relative}/${name}`:name;const stat=fs.lstatSync(path.join(root,file));if(!excluded.has(name)&&(stat.mode&0o7000))fail('SOURCE_UNSAFE_MODE');
  if(policy.strictOutputs&&name.startsWith('.env')&&!(policy.allowVersionedEnvTemplate&&file==='.env.example'))fail('PRIVATE_OUTPUT_FORBIDDEN');
  if(policy.strictOutputs&&name.startsWith('.crewcheck')&&!['.crewcheck-source-preparation.json','.crewcheck-source-preparation.json.tmp'].includes(file))fail('PRIVATE_OUTPUT_FORBIDDEN');
  if(excluded.has(name)||name.startsWith('.crewcheck')||(name.startsWith('.env')&&!(policy.allowVersionedEnvTemplate&&file==='.env.example')))continue;
  if(stat.isSymbolicLink())fail('SOURCE_SYMLINK');
  if(stat.isDirectory()){if(!relative&&!sourceDirectories.has(name)){if(policy.strictOutputs)fail('OUTPUT_DIRECTORY_NOT_CLASSIFIED');continue;}walk(file);}else if(stat.isFile()&&allowedSource(file,policy))files[file]=hash(fs.readFileSync(path.join(root,file)));else if(stat.isFile()&&policy.strictOutputs)fail('OUTPUT_NOT_CLASSIFIED');
 }};walk('');return files;
}
export function attestGitRaw({repository,commit,rawRoot,policy={}}) {
 if(!/^[a-f0-9]{40}$/.test(commit))fail('ORIGIN_INVALID');
 const git=args=>{const r=spawnSync('git',args,{cwd:repository,encoding:null,maxBuffer:64*1024*1024});if(r.status!==0)fail('ORIGIN_UNAVAILABLE');return r.stdout;};
 const expected={};for(const file of git(['ls-tree','-r','--name-only','-z',commit]).toString().split('\0').filter(Boolean))if(allowedSource(file,policy))expected[file]=hash(git(['show',`${commit}:${file}`]));
 if(canonical(manifest(rawRoot,policy))!==canonical(expected))fail('RAW_ORIGIN_MISMATCH');
 const proof=Object.freeze({commit,rawRoot:path.resolve(rawRoot),files:Object.freeze({...expected}),policy:Object.freeze({...policy})});proofs.add(proof);return proof;
}
function copyFiles(from,to,files){for(const file of Object.keys(files)){fs.mkdirSync(path.dirname(path.join(to,file)),{recursive:true});if(fs.lstatSync(path.join(from,file)).mode&0o7000)fail('SOURCE_UNSAFE_MODE');fs.copyFileSync(path.join(from,file),path.join(to,file));fs.chmodSync(path.join(to,file),fs.statSync(path.join(from,file)).mode&0o111?0o755:0o644);}}
function syncTree(root){for(const entry of fs.readdirSync(root)){const file=path.join(root,entry),stat=fs.lstatSync(file);if(stat.isDirectory())syncTree(file);else if(stat.isFile()){const fd=fs.openSync(file,'r');fs.fsyncSync(fd);fs.closeSync(fd);}}syncDirectory(root);}
const canonical=files=>JSON.stringify(Object.fromEntries(Object.entries(files).sort()));
function loadGeneration(storage){
 const ref=path.join(storage,'current.json');if(!fs.existsSync(ref))return null;
 let pointer,record;try{pointer=JSON.parse(fs.readFileSync(ref));if(!/^[a-f0-9-]+$/.test(pointer.id))fail('REFERENCE_CORRUPT');const generation=path.join(storage,'generations',pointer.id);if(!fs.lstatSync(generation).isDirectory()||(fs.lstatSync(generation).mode&0o777)!==0o555)fail('GENERATION_MODE_CORRUPT');const metadata=fs.lstatSync(path.join(generation,'manifest.json'));if(!metadata.isFile()||metadata.nlink!==1||(metadata.mode&0o777)!==0o444)fail('MANIFEST_MODE_CORRUPT');record=JSON.parse(fs.readFileSync(path.join(generation,'manifest.json')));if(hash(JSON.stringify(record))!==pointer.manifestHash)fail('MANIFEST_CORRUPT');if(canonical(manifest(path.join(generation,'raw'),{...record.policy,strictOutputs:true}))!==canonical(record.raw))fail('BASELINE_CORRUPT');if(!record.snapshots)fail('SNAPSHOT_CONTRACT_REQUIRED');verifySnapshot(path.join(generation,'raw'),record.snapshots.raw);if(record.snapshots.dependencies)verifySnapshot(path.join(generation,'dependencies'),record.snapshots.dependencies);return{...record,id:pointer.id,generation};}catch(error){if(error.code?.endsWith('CORRUPT'))throw error;fail('REFERENCE_CORRUPT');}
}
export function resolvePreparedGeneration(storage){const record=loadGeneration(storage);if(!record)fail('GENERATION_ABSENT');const root=path.join(record.generation,'prepared');verifySnapshot(root,record.snapshots.prepared,{dependencyLink:record.snapshots.dependencies?path.join(record.generation,'dependencies'):undefined});if(canonical(manifest(root,{...record.policy,strictOutputs:true}))!==canonical(record.prepared))fail('GENERATION_CORRUPT');return root;}
function physicalPath(file){let existing=path.resolve(file),tail=[];for(;;){try{fs.lstatSync(existing);break;}catch(error){if(error.code!=='ENOENT')throw error;tail.unshift(path.basename(existing));const parent=path.dirname(existing);if(parent===existing)fail('PATH_UNRESOLVED');existing=parent;}}try{return path.join(fs.realpathSync(existing),...tail);}catch{fail('PATH_ALIAS_UNRESOLVED');}}
function dependencyFingerprint(root){if(!root)return null;const base=fs.realpathSync(root),rows=[];const walk=(relative,ancestors=new Set())=>{const file=path.join(base,relative),stat=fs.lstatSync(file);if(stat.mode&0o7000)fail('DEPENDENCY_UNSAFE_MODE');if(path.basename(file).startsWith('.env')||['.aws','.codex','.git'].includes(path.basename(file)))fail('DEPENDENCY_PRIVATE_FILE');if(stat.isSymbolicLink()){const target=fs.realpathSync(file);if(target!==base&&!target.startsWith(base+path.sep))fail('DEPENDENCY_LINK_ESCAPE');if(ancestors.has(target))fail('DEPENDENCY_LINK_CYCLE');rows.push([relative,'link',fs.readlinkSync(file)]);walk(path.relative(base,target),new Set([...ancestors,target]));}else if(stat.isDirectory()){for(const name of fs.readdirSync(file).sort())walk(relative?relative+'/'+name:name,ancestors);}else if(stat.isFile()){if(stat.mode&0o7000)fail('DEPENDENCY_UNSAFE_MODE');rows.push([relative,stat.mode&0o777,hash(fs.readFileSync(file))]);}else fail('DEPENDENCY_SPECIAL_TYPE');};walk('');return hash(JSON.stringify(rows));}
function acquire(storage){const lock=path.join(storage,'writer.lock'),token=crypto.randomUUID();let identity;try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);identity=fs.fstatSync(fd);fs.closeSync(fd);}catch(error){if(error.code==='EEXIST')fail('WRITER_BUSY');throw error;}const assertOwned=()=>{let state,stat;try{state=JSON.parse(fs.readFileSync(lock));stat=fs.lstatSync(lock);}catch{fail('LOCK_OWNERSHIP_LOST');}if(stat.ino!==identity.ino||stat.dev!==identity.dev||state.token!==token)fail('LOCK_OWNERSHIP_LOST');};return{assertOwned,release:()=>{assertOwned();fs.unlinkSync(lock);}};}
function durable(file,bytes){const fd=fs.openSync(file,'w');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);}
function syncDirectory(directory){const fd=fs.openSync(directory,'r');fs.fsyncSync(fd);fs.closeSync(fd);}
export function recoverPrototype(storage,{hooks={}}={}){
 const lock=path.join(storage,'writer.lock');if(fs.existsSync(lock)){const original=fs.readFileSync(lock,'utf8');hooks.afterLockRead?.();if(fs.readFileSync(lock,'utf8')!==original)fail('LOCK_CHANGED');let pid;try{pid=JSON.parse(original).pid;}catch{fail('LOCK_CORRUPT');}try{process.kill(pid,0);fail('WRITER_BUSY');}catch(error){if(error.code!=='ESRCH')throw error;}
 // Observation only. Removing stale locks requires quiescent maintenance/OS locking;
 // a PID check followed by unlink is never safe against a replacement live lease.
 }
 return fs.existsSync(path.join(storage,'current.json'))?resolvePreparedGeneration(storage):null;
}
export function preparePrototype({inputRoot,storage,proof,policy={},dependencyRoot,inputKind,worker=['scripts/v139/apply.mjs'],finalizer=['scripts/ci/sync-canonical-manual.mjs'],gates=[],hooks={},commandTimeout=180000}) {
 inputRoot=physicalPath(inputRoot);storage=physicalPath(storage);
 if(storage===inputRoot||storage.startsWith(inputRoot+path.sep)||inputRoot.startsWith(storage+path.sep))fail('STORAGE_MUST_BE_OUTSIDE_SOURCE');
 if(Object.keys(process.env).some(key=>/^CREWCHECK_.*_SKIP_APPLY$/.test(key)&&process.env[key]))fail('PARTIAL_CONTEXT_FORBIDDEN');
 const before=manifest(inputRoot,policy);let previous=loadGeneration(storage);
 for(const [index,args] of [worker,finalizer,...gates].entries())if(!Array.isArray(args)||!args.length||args.some(arg=>typeof arg!=='string'||arg.includes('npm')||path.isAbsolute(arg)||arg.includes('staged-preparation-prototype')||(index>0&&arg.endsWith('scripts/v139/apply.mjs'))))fail('RECURSIVE_GATE_FORBIDDEN');
 const dependencyHash=dependencyFingerprint(dependencyRoot);
 const execution={worker,finalizer,gates,commandTimeout,dependencyHash,nodeExecutableHash:hash(fs.readFileSync(fs.realpathSync(process.execPath))),nodeVersion:process.version};const executionHash=hash(JSON.stringify(execution));
 if(!previous&&!proof){let v2;try{v2=JSON.parse(fs.readFileSync(path.join(inputRoot,'.crewcheck-source-preparation.json')));}catch{}
  if(v2?.version===2&&v2.fingerprint===preparationFingerprint(inputRoot)){
   if(JSON.stringify(worker)!==JSON.stringify(['scripts/v139/apply.mjs'])||!before['scripts/v139/apply.mjs'])fail('V2_WORKER_UNVERIFIED');
   const scratch=fs.mkdtempSync(path.join(path.dirname(storage),'legacy-validation-'));try{copyFiles(inputRoot,scratch,before);for(const args of [finalizer,...gates]){const run=spawnSync(process.execPath,args,{cwd:scratch,env:{PATH:process.env.PATH,NODE_OPTIONS:`--import=${path.join(scratch,'scripts/ci/smoke-deny-network.mjs')}`},encoding:'utf8',timeout:180000});if(run.status!==0)fail('STAGING_GATE_FAILED');}if(canonical(manifest(scratch,policy))!==canonical(before))fail('RAW_BASELINE_REQUIRED');if(preparationFingerprint(inputRoot)!==v2.fingerprint)fail('SOURCE_CHANGED_DURING_PREPARATION');return{status:'legacy_v2_hit',root:inputRoot};}finally{fs.rmSync(scratch,{recursive:true,force:true});}
  }fail('RAW_BASELINE_REQUIRED');}
 if(!previous&&(!proofs.has(proof)||canonical(before)!==canonical(proof.files)||JSON.stringify(policy)!==JSON.stringify(proof.policy)))fail('RAW_ORIGIN_MISMATCH');
 if(previous&&JSON.stringify(previous.policy)!==JSON.stringify(policy))fail('POLICY_CHANGED');
 const kind=!previous?'raw':inputKind||(inputRoot===previous.origin.inputRoot||canonical(before)===canonical(previous.raw)?'raw':canonical(before)===canonical(previous.prepared)?'prepared':null);
 if(!['raw','prepared'].includes(kind))fail('INPUT_KIND_REQUIRED');
 if(previous&&kind==='prepared')for(const file of new Set([...Object.keys(previous.raw),...Object.keys(previous.prepared),...Object.keys(before)]))if(before[file]!==previous.prepared[file]&&previous.raw[file]!==previous.prepared[file])fail('MANUAL_MATERIALIZED_CONFLICT');
 hooks.beforeLock?.();fs.mkdirSync(storage,{recursive:true,mode:0o700});if(physicalPath(storage)!==storage)fail('STORAGE_ALIAS_CHANGED');const lease=acquire(storage);const id=crypto.randomUUID();const generation=path.join(storage,'generations',id);
 try{
  const pointerBefore=fs.existsSync(path.join(storage,'current.json'))?fs.readFileSync(path.join(storage,'current.json'),'utf8'):null;
  if((!previous&&pointerBefore!==null)||(previous&&JSON.parse(pointerBefore||'{}').id!==previous.id))fail('GENERATION_CHANGED');
  const raw=path.join(generation,'raw'),prepared=path.join(generation,'prepared');fs.mkdirSync(raw,{recursive:true});fs.mkdirSync(prepared);
  const nextRaw={...(kind==='raw'?before:previous.raw)};if(previous&&kind==='prepared')for(const file of new Set([...Object.keys(previous.prepared),...Object.keys(before)]))if(before[file]!==previous.prepared[file]){if(before[file])nextRaw[file]=before[file];else delete nextRaw[file];}
  for(const file of Object.keys(nextRaw)){const from=previous&&kind==='prepared'&&before[file]===previous.prepared[file]?path.join(previous.generation,'raw'):inputRoot;copyFiles(from,raw,{[file]:nextRaw[file]});}
  if(canonical(manifest(raw,policy))!==canonical(nextRaw))fail('SNAPSHOT_CHANGED');
  const rawSnapshot=snapshot(raw,{seal:true});
  copyFiles(raw,prepared,nextRaw);let dependencySnapshot=null;const dependencies=path.join(generation,'dependencies');if(dependencyRoot){if(!fs.statSync(dependencyRoot).isDirectory())fail('DEPENDENCIES_INVALID');dependencySnapshot=copyDependencies(fs.realpathSync(dependencyRoot),dependencies);fs.symlinkSync(dependencies,path.join(prepared,'node_modules'));}durable(path.join(generation,'journal.json'),JSON.stringify({state:'staging',id}));
  hooks.beforeWorker?.({generation,prepared});
  const environment={PATH:process.env.PATH,TMPDIR:path.join(generation,'scratch'),HOME:path.join(generation,'scratch'),NODE_DISABLE_COMPILE_CACHE:'1'};fs.mkdirSync(environment.TMPDIR);
  environment.NODE_OPTIONS=`--import=${path.join(prepared,'scripts/ci/smoke-deny-network.mjs')}`;
  const reuse=previous&&canonical(nextRaw)===canonical(previous.raw)&&previous.executionHash===executionHash;
  if(reuse){for(const file of Object.keys(nextRaw)){fs.rmSync(path.join(prepared,file),{force:true});}copyFiles(resolvePreparedGeneration(storage),prepared,previous.prepared);}
  for(const args of [...(reuse?[]:[worker]),finalizer,...gates]){if(!Array.isArray(args)||args.some(arg=>typeof arg!=='string')||args[0]?.includes('npm')||args[0]?.includes('staged-preparation-prototype'))fail('RECURSIVE_GATE_FORBIDDEN');const result=runPrototypeNode(args,{cwd:prepared,env:environment,timeout:commandTimeout});durable(path.join(generation,`worker-${hash(JSON.stringify(args))}.log`),(result.stdout||'')+(result.stderr||''));if(result.status!==0)fail('STAGING_GATE_FAILED');}
  hooks.afterWorker?.({generation,prepared});for(const name of fs.readdirSync(prepared))if(name.startsWith('.env')&&!(policy.allowVersionedEnvTemplate&&name==='.env.example'))fail('RUNTIME_ENV_FORBIDDEN');const outputs=manifest(prepared,{...policy,strictOutputs:true});
  const preparedSnapshot=snapshot(prepared,{seal:true,dependencyLink:dependencyRoot?dependencies:undefined});
  const snapshots={raw:rawSnapshot,prepared:preparedSnapshot,dependencies:dependencySnapshot};
  const record={version:3,snapshots,origin:previous?.origin||{commit:proof.commit,inputRoot},execution,executionHash,policy,raw:nextRaw,prepared:outputs,generators:Object.fromEntries(Object.entries(nextRaw).filter(([file])=>file.startsWith('scripts/')))};
  durable(path.join(generation,'manifest.json'),JSON.stringify(record));for(const name of fs.readdirSync(generation)){const file=path.join(generation,name);if(fs.lstatSync(file).isFile())fs.chmodSync(file,0o444);}fs.chmodSync(generation,0o555);syncTree(generation);syncDirectory(path.dirname(generation));hooks.afterGenerationSync?.({generation,prepared});hooks.beforePublish?.({generation,prepared});
  lease.assertOwned();verifySnapshot(raw,rawSnapshot);verifySnapshot(prepared,preparedSnapshot,{dependencyLink:dependencyRoot?dependencies:undefined});if(dependencyRoot)verifySnapshot(dependencies,dependencySnapshot);if(hash(fs.readFileSync(fs.realpathSync(process.execPath)))!==execution.nodeExecutableHash)fail('TOOLCHAIN_CHANGED_DURING_PREPARATION');if(dependencyFingerprint(dependencyRoot)!==dependencyHash)fail('DEPENDENCIES_CHANGED_DURING_PREPARATION');
  const pointerNow=fs.existsSync(path.join(storage,'current.json'))?fs.readFileSync(path.join(storage,'current.json'),'utf8'):null;
  if(pointerNow!==pointerBefore||canonical(manifest(inputRoot,policy))!==canonical(before))fail('SOURCE_CHANGED_DURING_PREPARATION');
  if(reuse&&canonical(outputs)===canonical(previous.prepared))return{status:'hit',root:resolvePreparedGeneration(storage)};
  const pending=path.join(storage,`current-${id}.tmp`);durable(pending,JSON.stringify({version:3,id,manifestHash:hash(JSON.stringify(record))}));syncDirectory(storage);
  // Consumers resolve one generation. No multi-file overwrite of inputRoot occurs.
  fs.renameSync(pending,path.join(storage,'current.json'));syncDirectory(storage);return{status:'prepared',root:prepared,id};
 }finally{lease.release();}
}
