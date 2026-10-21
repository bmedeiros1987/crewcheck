import assert from 'node:assert/strict';
import { CREWCHECK_GATE_HOST_ENABLED,changeGateConsent,createGateOutboxConnection } from '../server/web-push/gateHost.mjs';
import { handleCrewCheckPush } from '../server/web-push/api.mjs';
assert.equal(CREWCHECK_GATE_HOST_ENABLED,false);
const forbidden=new Proxy({}, {get(){throw Error('OFF cannot touch storage/source/authority/provider');}});
assert.equal((await changeGateConsent(forbidden,forbidden,forbidden)).status,'disabled');
assert.equal((await changeGateConsent(forbidden,forbidden,forbidden,{enabled:'true'})).status,'disabled');
assert.equal((await createGateOutboxConnection({enabled:'true'}).dispatch(forbidden,forbidden,forbidden)).status,'disabled');
const connection=createGateOutboxConnection({readSource:forbidden});
assert.equal((await connection.enqueue(forbidden,forbidden,forbidden)).status,'disabled');
assert.equal((await connection.dispatch(forbidden,forbidden,forbidden,forbidden)).status,'disabled');
let status,body;const res={setHeader(){},writeHead(code){status=code;},end(raw){body=JSON.parse(raw);}};
const owner='owner_fixture_A';
await handleCrewCheckPush({method:'POST',headers:{origin:'https://fixture.test'}},res,new URL('https://fixture.test/api/platform/notifications/crewcheck-installation'),{
 identify:async()=>({payload:{sub:owner},profile:{public_id:owner},db:forbidden}),configuration:()=>({origin:'https://fixture.test'}),read:async()=>({action:'gate-consent',installationId:'installation_fixture_01',enabled:true,confirmed:true,expectedRevision:0,expectedInstallationRevision:1})});
assert.equal(status,503);assert.equal(body.code,'GATE_HOST_DISABLED');
console.log('PASS real installation API gate action and outbox connection default OFF: no storage/source/provider/authority access, no caller-controlled activation');
