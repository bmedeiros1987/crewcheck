// Disposable experiment only: no production consumers call this harness.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {attestGitRaw,preparePrototype,manifest} from '../v139/staged-preparation-prototype.mjs';
const repository=fs.realpathSync(process.argv[2]),job=fs.realpathSync(process.argv[3]);
const dependencies=fs.realpathSync(path.join(job,'dependencies/node_modules'));
assert(dependencies.startsWith(job+path.sep),'Dependencies must belong exclusively to this job');
assert(!job.startsWith(repository+path.sep)&&!repository.startsWith(job+path.sep));
assert(!fs.existsSync(path.join(job,'experiment')),'Experiment directory must be fresh');
const root=path.join(job,'experiment');fs.mkdirSync(root,{mode:0o700});
const env={PATH:process.env.PATH,HOME:root,TMPDIR:root,NODE_DISABLE_COMPILE_CACHE:'1'};
const run=(binary,args,cwd,extra={})=>{const r=spawnSync(binary,args,{cwd,env:{...env,...extra},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});if(r.status!==0)throw Error(`${binary} ${args.join(' ')} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);return r.stdout.trim();};
const commit=run('git',['rev-parse','HEAD'],repository);
const archive=spawnSync('git',['archive',commit],{cwd:repository,maxBuffer:256*1024*1024});assert.equal(archive.status,0);
const raw=path.join(root,'raw');fs.mkdirSync(raw);assert.equal(spawnSync('tar',['-x','-C',raw],{input:archive.stdout}).status,0);
// Versioned env template is unnecessary for this experiment; no env file is read.
fs.rmSync(path.join(raw,'.env.example'),{force:true});
const proof=attestGitRaw({repository,commit,rawRoot:raw});
fs.symlinkSync(dependencies,path.join(raw,'node_modules'));
const nodeGates=['regression-preparation-crewlock-replay','regression-v1392-regulation-replay','regression-source-preparation-cache','regression-free-day-postponement','regression-free-day-held','regression-free-day-physical','regression-free-day-telegram-preparation','regression-financial-read-model','regression-financial-review-owner-negative','regression-notification-diagnostic'];
const gates=[['--check','server.mjs'],...nodeGates.map(name=>['scripts/'+name+'.mjs'])];
const common={dependencyRoot:dependencies,gates},storage=path.join(root,'store');
const results={commit,node:process.version,scope:'disposable parallel experiment only',gates,phases:[],differences:[],productionBlockers:['fsync generations parent directory','immutable generation/dependency snapshots','process containment','stale lock ends job'],consumersChanged:false};
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const differences=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].sort().filter(file=>a[file]!==b[file]).map(file=>({file,left:a[file]??null,right:b[file]??null}));
const independent=(source,label)=>{const copy=path.join(root,'independent-'+label);fs.cpSync(source,copy,{recursive:true});run('git',['init'],copy);run('git',['add','.'],copy);run('git',['-c','user.name=Disposable experiment','-c','user.email=fixture@example.invalid','commit','-m','synthetic attested '+label],copy);const revision=run('git',['rev-parse','HEAD'],copy);const proof=attestGitRaw({repository:copy,commit:revision,rawRoot:copy});return preparePrototype({...common,inputRoot:copy,storage:path.join(root,'independent-store-'+label),proof});};
const compare=(label,prepared,source)=>{const cold=independent(source,label),a=manifest(prepared,{strictOutputs:true}),b=manifest(cold.root,{strictOutputs:true}),diff=differences(a,b);results.differences.push({label,against:'independent attested cold',leftHash:hash(a),rightHash:hash(b),files:diff});assert.deepEqual(diff,[],label+' must equal independent cold');};
try{
 for(const args of gates)run(process.execPath,args,raw,{NODE_OPTIONS:`--import=${path.join(raw,'scripts/ci/smoke-deny-network.mjs')}`,NODE_PATH:dependencies});
 const cold=preparePrototype({...common,inputRoot:raw,storage,proof});results.phases.push({phase:'cold',status:cold.status});compare('cold',cold.root,raw);
 const repeat=preparePrototype({...common,inputRoot:raw,storage});assert.equal(repeat.status,'hit');results.phases.push({phase:'repeat',status:repeat.status});compare('repeat',repeat.root,raw);
 for(const [label,file] of [['input','shared/notificationChannelPreferences.mjs'],['generator','scripts/v139/apply-core.mjs']]){fs.appendFileSync(path.join(raw,file),'\n// disposable synthetic '+label+' invalidation\n');const rebuilt=preparePrototype({...common,inputRoot:raw,storage});assert.equal(rebuilt.status,'prepared');results.phases.push({phase:label+'-invalidation',status:rebuilt.status});compare(label,rebuilt.root,raw);}
 const prepared=JSON.parse(fs.readFileSync(path.join(storage,'current.json')));const validation=path.join(root,'validation');fs.cpSync(path.join(storage,'generations',prepared.id,'prepared'),validation,{recursive:true,dereference:false});
 // Direct tooling in a separate disposable validation copy, never production callers.
 for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['scripts/p1-concierge-journey/compile.mjs'],['node_modules/vite/bin/vite.js','build']]){run(process.execPath,args,validation,{NODE_OPTIONS:`--import=${path.join(validation,'scripts/ci/smoke-deny-network.mjs')}`});results.phases.push({phase:args[0],status:'PASS'});}
 results.status='PASS';
}catch(error){results.status='FAILED';results.failure=error.message;process.exitCode=1;}
finally{fs.writeFileSync(path.join(job,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));}
