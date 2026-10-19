import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'vite';

const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'dist');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-worker-scope-'));
const entry=path.join(temporary,'entry.ts');
fs.writeFileSync(entry,'export const syntheticBuildValue: number = 17;\n');
const configFile=path.join(root,'vite.config.ts');
const results=[];
const digest=value=>createHash('sha256').update(value).digest('hex');
const snapshot=()=>['index.html','sw.js'].map(name=>digest(fs.readFileSync(path.join(dist,name))));
async function scenario(name,run){try{await run();results.push({name,result:'PASS'});}catch(error){results.push({name,result:'FAIL',error:String(error.message||error)});}}
function sealed(output){
 const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
 const worker=fs.readFileSync(path.join(output,'sw.js'),'utf8');
 assert.equal(worker.match(/const CREWCHECK_UPDATE_HTML_HASH='([^']+)'/)[1],digest(html));
 assert.equal(html.split('id="cc-no-floating-shortcuts"').length-1,1);
 assert(!worker.includes('__CREWCHECK_UPDATE_BUILD_ID__'));
 const assets=JSON.parse(worker.match(/const CREWCHECK_UPDATE_ASSETS=(\[.*?\]);/)[1]);
 const emitted=fs.readdirSync(path.join(output,'assets'),{recursive:true})
  .filter(name=>fs.statSync(path.join(output,'assets',name)).isFile())
  .map(name=>'/assets/'+String(name).replaceAll('\\','/')).sort();
 assert.deepEqual(assets,emitted);
 assert(assets.some(name=>name.includes('pdf.worker')));
 assert(assets.some(name=>/\/pdf-.*\.js$/.test(name)));
}
const run=options=>build({configFile,logLevel:'error',...options});
const ssr=outDir=>run({build:{ssr:entry,outDir,emptyOutDir:true,copyPublicDir:false}});
const library=(outDir,withSsr=false)=>run({build:{...(withSsr?{ssr:true}:{}),outDir,emptyOutDir:true,copyPublicDir:false,lib:{entry,formats:['es'],fileName:'synthetic-library'}}});
let initial,backedUp=false;
try{
 await scenario('production/default output seals exact HTML and full emitted asset inventory',async()=>{await run({});sealed(dist);initial=snapshot();});
 assert(initial,'production build must pass before scope checks');
 await scenario('SSR with existing production output leaves sealed files untouched',async()=>{const outDir=path.join(temporary,'ssr-existing');await ssr(outDir);assert(fs.existsSync(path.join(outDir,'entry.js')));assert.deepEqual(snapshot(),initial);});
 await scenario('library with existing production output leaves sealed files untouched',async()=>{const outDir=path.join(temporary,'lib-existing');await library(outDir);assert(fs.existsSync(path.join(outDir,'synthetic-library.js')));assert.deepEqual(snapshot(),initial);});
 fs.cpSync(dist,path.join(temporary,'production-backup'),{recursive:true});backedUp=true;
 fs.rmSync(dist,{recursive:true,force:true});
 await scenario('SSR without production dist succeeds and does not create dist',async()=>{await ssr(path.join(temporary,'ssr-absent'));assert(!fs.existsSync(dist));});
 await scenario('library without production dist succeeds and does not create dist',async()=>{await library(path.join(temporary,'lib-absent'));assert(!fs.existsSync(dist));});
 await scenario('combined SSR/library parity build without dist succeeds',async()=>{await library(path.join(temporary,'parity'),true);assert(!fs.existsSync(dist));});
 await scenario('in-memory client build requires no on-disk shell',async()=>{await run({build:{write:false}});assert(!fs.existsSync(dist));});
 await scenario('HTML client custom outDir seals its own exact served build',async()=>{const outDir=path.join(temporary,'client-custom');await run({build:{outDir,emptyOutDir:true}});sealed(outDir);assert(!fs.existsSync(dist));});
}finally{
 if(backedUp){fs.rmSync(dist,{recursive:true,force:true});fs.cpSync(path.join(temporary,'production-backup'),dist,{recursive:true});}
 fs.rmSync(temporary,{recursive:true,force:true});
 const report={results,passed:results.filter(x=>x.result==='PASS').length,failed:results.filter(x=>x.result==='FAIL').length,realProviderRequests:0};
 if(process.env.PWA_BUILD_SCOPE_REPORT)fs.writeFileSync(process.env.PWA_BUILD_SCOPE_REPORT,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(report.failed)process.exitCode=1;
}
