import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import semver from 'semver';

// All lockfile copies matter, including nested copies that npm might otherwise hide.
const lock=JSON.parse(fs.readFileSync(process.env.CREWCHECK_QA_LOCK_FILE||'package-lock.json','utf8'));
const copies=Object.entries(lock.packages).filter(([name])=>/(^|\/)node_modules\/minimatch$/.test(name));
assert(copies.length>0,'the Capacitor dependency chain is present');
for(const [name,pkg]of copies){
 assert(!semver.satisfies(pkg.version,'>=7.0.0 <11.0.1'),name+' remains affected by GHSA-g3hv-75wg-m249');
 assert.equal(pkg.dev,true,'this change must not promote the toolchain into app runtime');
}
const require=createRequire(import.meta.url),cliRequire=createRequire(require.resolve('@capacitor/cli/package.json'));
const rimrafPath=cliRequire.resolve('rimraf'),rimrafRequire=createRequire(rimrafPath),globPath=rimrafRequire.resolve('glob'),globRequire=createRequire(globPath),matchPath=globRequire.resolve('minimatch');
function metadata(entry){let dir=path.dirname(entry);for(;;){const file=path.join(dir,'package.json');if(fs.existsSync(file)){const pkg=JSON.parse(fs.readFileSync(file,'utf8'));if(pkg.name&&pkg.version)return pkg;}const parent=path.dirname(dir);assert.notEqual(dir,parent);dir=parent;}}
const installed=[metadata(rimrafPath),metadata(globPath),metadata(matchPath)];
assert.equal(semver.major(installed[0].version),6,'use the compatible rimraf major accepted by Capacitor7');
assert(semver.satisfies(installed[2].version,'>=11.0.1'),'actual CLI resolution must not retain vulnerable minimatch');
assert(!semver.satisfies(installed[1].version,'>=9.0.0 <=14.0.1'),'also remove the known glob cancellation advisory');
for(const pkg of installed){assert(semver.satisfies('22.13.0',pkg.engines.node),pkg.name+' must retain the existing CI/Docker minimum');assert(semver.satisfies(process.version,pkg.engines.node));}
const {rimraf}=await import(pathToFileURL(rimrafPath)),{glob}=await import(pathToFileURL(globPath)),{minimatch,Minimatch}=await import(pathToFileURL(matchPath));
assert(minimatch('qa/one.txt','qa/!(ignored).txt'));
assert(!minimatch('qa/ignored.txt','qa/!(ignored).txt'));
// Small fixed patterns exercise optimized preprocessing without a stress/DoS workload.
const optimized=new Minimatch('qa/{a,b}/../{one,two}.txt',{optimizationLevel:2});
assert(optimized.match('qa/one.txt'));assert(!optimized.match('qa/ignored.txt'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-dependency-qa-'));
try{
 fs.mkdirSync(path.join(dir,'delete'));for(const file of ['one.txt','two.txt'])fs.writeFileSync(path.join(dir,'delete',file),'synthetic');fs.writeFileSync(path.join(dir,'keep.txt'),'synthetic');
 assert.deepEqual((await glob('delete/{one,two}.txt',{cwd:dir})).sort(),['delete/one.txt','delete/two.txt']);
 await assert.rejects(glob('**/*',{cwd:dir,signal:AbortSignal.abort()}));
 await rimraf(path.join(dir,'delete'),{glob:false});assert(!fs.existsSync(path.join(dir,'delete')));assert(fs.existsSync(path.join(dir,'keep.txt')));
 fs.mkdirSync(path.join(dir,'build'));fs.writeFileSync(path.join(dir,'build','asset.txt'),'synthetic');rimraf.sync(path.join(dir,'build'));assert(!fs.existsSync(path.join(dir,'build')));assert(fs.existsSync(path.join(dir,'keep.txt')));
 console.log('PASS all minimatch lock copies, actual Capacitor→rimraf→glob→minimatch resolution, Node22.13 compatibility, bounded optimized/extglob/brace selection, cancellation and scoped async/sync cleanup',installed.map(p=>p.name+'@'+p.version).join(' '));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
