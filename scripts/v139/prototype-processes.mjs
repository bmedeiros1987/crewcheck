// Linux process groups contain ordinary descendants, not setsid/cgroup escapes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
export function runPrototypeCommand(binary,args,{cwd,env,timeout=180000}={}){
 if(process.platform!=='linux')throw Object.assign(Error('PROCESS_RUNNER_UNSUPPORTED'),{code:'PROCESS_RUNNER_UNSUPPORTED'});
 const control=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-command-')),'pid');
 const supervisor=fileURLToPath(new URL('./prototype-process-supervisor.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[supervisor,control,String(timeout),binary,...args],{cwd,env,encoding:'utf8',timeout:timeout+3000,killSignal:'SIGKILL',detached:true,maxBuffer:16*1024*1024});
 const commandPid=fs.existsSync(control)?Number(fs.readFileSync(control,'utf8')):null;
 for(const group of [commandPid,result.pid].filter(Boolean)){try{process.kill(-group,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
  const active=()=>fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name)).some(name=>{try{const stat=fs.readFileSync('/proc/'+name+'/stat','utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');return Number(fields[2])===group&&!['Z','X'].includes(fields[0]);}catch{return false;}});
  const deadline=Date.now()+2000;while(active()&&Date.now()<deadline)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
  if(active())throw Object.assign(Error('PROCESS_GROUP_NOT_QUIESCENT'),{code:'PROCESS_GROUP_NOT_QUIESCENT'});
 }
 return result;
}

export const runPrototypeNode=(args,options)=>runPrototypeCommand(process.execPath,args,options);
