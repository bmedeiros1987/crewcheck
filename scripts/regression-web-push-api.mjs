import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url),statements=[];let profile=null;
const fixtureDb={query:async sql=>{statements.push(sql);if(sql.startsWith('SELECT * FROM crewcheck_platform_profiles'))return[[profile].filter(Boolean)];if(sql.startsWith('SELECT payload FROM crewcheck_telegram_state'))return[[]];throw Error('Unexpected query');}};
const compiled=await build({stdin:{contents:"export{handleCrewCheckPush}from'./server/web-push/api.mjs';export{issueJwt}from'./server/v139/common.mjs';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',external:['web-push'],plugins:[{name:'pool-only',setup(b){b.onLoad({filter:/server\/v139\/common\.mjs$/},({path})=>({contents:fs.readFileSync(path,'utf8').replace(/export async function dbPool\(\) \{[\s\S]*?\n\}\n\nexport function parseJsonColumn/,'export async function dbPool(){return globalThis.fixtureDb;}\n\nexport function parseJsonColumn'),loader:'js'}));}}]});
const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require,Buffer,URL,console,fixtureDb,process:{env:{CREWCHECK_AUTH_SECRET:'fictional-regression-only-not-deployed'}}});
const {handleCrewCheckPush,issueJwt}=module.exports,token=issueJwt({id:'owner_fixture_1',email:'synthetic@fixture.invalid'});
async function invoke(method='GET',body,origin='https://crewcheck.onrender.com') {let status,payload;await handleCrewCheckPush({method,headers:{authorization:`Bearer ${token}`,origin}},{setHeader(){},writeHead(value){status=value;},end(value){payload=JSON.parse(value);}},new URL('https://crewcheck.onrender.com/api/platform/notifications/crewcheck-installation?installationId=device_fixture_1'),{read:async()=>body});return{status,payload};}
assert.equal((await invoke()).status,401);assert(statements.every(sql=>sql.startsWith('SELECT')));assert.equal(profile,null);
profile={public_id:'owner_fixture_1'};const response=await invoke();assert.equal(response.status,200);assert.equal(response.payload.enabled,false);assert.equal(response.payload.publicKey,null);assert.equal(response.payload.received,null);
assert.equal((await invoke('POST',{action:'subscribe',installationId:'device_fixture_1',consent:true},'https://attacker.invalid')).status,403);
assert.equal((await invoke('POST',{action:'subscribe',installationId:'device_fixture_1',consent:true})).status,503);assert(statements.every(sql=>sql.startsWith('SELECT')));
profile={public_id:'owner_fixture_2'};assert.equal((await invoke()).status,401);
console.log('PASS actual CrewCheck push API/default JWT/profile chain: missing/stale owner rejects without writes, observational disabled status exposes no key, cross-origin mutations rejected and disabled subscribe inert; synthetic pool only.');
