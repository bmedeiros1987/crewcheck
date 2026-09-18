import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
function run(script,args=[]){const result=spawnSync(process.execPath,[script,...args],{stdio:'inherit',env:process.env});if(result.status!==0)throw Error(script+' failed');}
if(!['demo','pilot'].includes(process.argv[2]))throw Error('Choose demo or pilot');
run('scripts/tv-broadcast-prepare.mjs');
run('scripts/tv-channel-stage.mjs',[process.argv[2]]);
const app=JSON.parse(await readFile('dist/lg-webos/appinfo.json','utf8'));app.version='0.1.7';
await writeFile('dist/lg-webos/appinfo.json',JSON.stringify(app,null,2));
const meta=JSON.parse(await readFile('dist/lg-webos/tv-build.json','utf8'));
meta.broadcastPreview=true;meta.brandAssetsBundled=false;meta.note='UNFINALIZED. Owner logo assets and original music must be attached with verified hashes before installation. Not a store release.';
await writeFile('dist/lg-webos/tv-build.json',JSON.stringify(meta,null,2));
