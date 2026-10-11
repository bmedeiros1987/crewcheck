// Linux process groups contain ordinary descendants, not setsid/cgroup escapes.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
export function runPrototypeCommand(binary,args,{cwd,env,timeout=180000}={}){
 if(process.platform!=='linux')throw Object.assign(Error('PROCESS_RUNNER_UNSUPPORTED'),{code:'PROCESS_RUNNER_UNSUPPORTED'});
 const result=spawnSync(binary,args,{cwd,env,encoding:'utf8',timeout,killSignal:'SIGKILL',detached:true,maxBuffer:16*1024*1024});
 if(result.pid){try{process.kill(-result.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}
  const active=()=>fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name)).some(name=>{try{const stat=fs.readFileSync('/proc/'+name+'/stat','utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');return Number(fields[2])===result.pid&&!['Z','X'].includes(fields[0]);}catch{return false;}});
  const deadline=Date.now()+2000;while(active()&&Date.now()<deadline)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);
  if(active())throw Object.assign(Error('PROCESS_GROUP_NOT_QUIESCENT'),{code:'PROCESS_GROUP_NOT_QUIESCENT'});
 }
 return result;
}

export const runPrototypeNode=(args,options)=>runPrototypeCommand(process.execPath,args,options);
