// Trusted runner helper: terminate the command group before inherited pipes close.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
const [control,deadline,binary,...args]=process.argv.slice(2);
const child=spawn(binary,args,{cwd:process.cwd(),env:process.env,detached:true,stdio:['ignore','inherit','inherit']});
if(child.pid)fs.writeFileSync(control,String(child.pid),{mode:0o600});
const stop=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH'){console.error(error.code);process.exit(125);}}};
let timedOut=false;
const timer=setTimeout(()=>{timedOut=true;stop();},Number(deadline));
child.once('error',()=>{clearTimeout(timer);stop();process.exit(125);});
child.once('exit',(code,signal)=>{clearTimeout(timer);stop();process.exit(timedOut?124:(code??(signal?128:125)));});
