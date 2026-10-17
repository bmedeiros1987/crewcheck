import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const materializer=path.resolve('scripts/v1392/apply.mjs');
for(const version of ['v1392','v1432'])for(const invalid of [null,'route','warning','import']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-v1392-replay-'));
 try{
  const write=(file,text)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  write('server.mjs',"telegramApiUrl('sendVoice'); buildCrewCheckAtis; allowed_updates: ['message', 'edited_message', 'callback_query']");
  write('server/v1391/emergency.mjs','emerg[êe]ncia');
  const statement=version==='v1392'?"import ManualRegulationView from '@/components/v1392/ManualRegulationView';":"import ManualRegulationView, { regulationForScheduleDay } from '@/components/v1432/ManualRegulationView';";
  const home=(invalid==='import'?'':statement)+(invalid==='route'?'':"\n{view === 'regulation' && <ManualRegulationView compliance={compliance} scheduleDay={event?.day}/>}\n");
  write('client/src/pages/Home.tsx',home);write(`client/src/components/${version}/ManualRegulationView.tsx`,invalid==='warning'?'warning missing':'Extensão condicionada');
  const run=()=>spawnSync(process.execPath,[materializer],{cwd:root,encoding:'utf8'});
  const first=run();assert.equal(first.status,invalid?1:0,`${version}/${invalid}: ${first.stderr}`);
  if(!invalid){assert.equal(run().status,0);assert.equal(fs.readFileSync(path.join(root,'client/src/pages/Home.tsx'),'utf8'),home,'materializer must only observe Home');}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
console.log('PASS actual v1392 materializer: legacy/current integration, repeat, import/route/component warning required, Home unchanged.');
