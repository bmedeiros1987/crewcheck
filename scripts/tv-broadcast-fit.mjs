import {readFile,writeFile} from 'node:fs/promises';
const root='apps/tv-player/src/';
let main=await readFile(root+'main.tsx','utf8');
if(!main.includes("from './BroadcastPanels'"))throw Error('Prepare broadcast composition first');
const old="(target || main.current?.querySelector<HTMLElement>('nav .active,button'))?.focus();";
const next="(target || main.current?.querySelector<HTMLElement>('nav .active') || main.current?.querySelector<HTMLElement>('button'))?.focus();";
if(main.includes(old)){main=main.replace(old,next);await writeFile(root+'main.tsx',main);}
else if(!main.includes(next))throw Error('Broadcast focus restoration anchor changed');
let css=await readFile(root+'broadcast.css','utf8');
if(!css.includes('broadcast-fit-017')){css+='\n'+await readFile(root+'broadcast-fit.css','utf8');await writeFile(root+'broadcast.css',css);}
console.log('Broadcast layout fit and active navigation focus prepared idempotently.');
