import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,readFile} from 'node:fs/promises';
await mkdir('dist/tv-pair-tests',{recursive:true});
await build({entryPoints:{session:'packages/tv-core/src/session.ts',nativeRequest:'packages/tv-core/src/nativeRequest.ts',PairingDiagnostics:'apps/tv-player/src/PairingDiagnostics.tsx'},bundle:true,platform:'node',format:'esm',outdir:'dist/tv-pair-tests',outExtension:{'.js':'.mjs'},loader:{'.css':'empty'}});
const {TvSession}=await import('../dist/tv-pair-tests/session.mjs');
const {validatePairing,pairingFailure}=await import('../dist/tv-pair-tests/PairingDiagnostics.mjs');
const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};const fakeWindow={};global.window=fakeWindow;
let calls=0;
function checkedFetch(input,init){assert.equal(this,fakeWindow,'Native Window receiver must be retained');calls++;assert.equal(init.credentials,'omit');return Promise.resolve(new Response(JSON.stringify({ready:true})));}
const client=new TvSession(storage,checkedFetch,'https://pilot.example.test');
assert.deepEqual(await client.call('status'),{ready:true});assert.equal(calls,1);delete global.window;
const raw={deviceCode:'a'.repeat(43),userCode:'A123456789',verificationUri:'https://pilot.example.test/tv-pair?code=A123456789',expiresIn:300,interval:5};
assert.equal(validatePairing(raw,'https://pilot.example.test',1000).deadline,301000);
for(const patch of [{deviceCode:'x'},{expiresIn:Infinity},{expiresIn:-1},{interval:0},{verificationUri:'https://evil.example/tv-pair?code=A123456789'},{verificationUri:raw.verificationUri+'&token=secret'},{verificationUri:'http://pilot.example.test/tv-pair?code=A123456789'}])assert.throws(()=>validatePairing({...raw,...patch},'https://pilot.example.test'));
for(const [error,code] of [[new TypeError('Illegal invocation'),'TV-NET-01'],[new Error('request_timeout'),'TV-NET-02'],[new Error('request_503'),'TV-HTTP-503'],[new Error('request_429'),'TV-HTTP-429'],[new Error('pair_again'),'TV-AUTH-01'],[new SyntaxError('secret'),'TV-DATA-02'],[new Error('token=SECRET'),'TV-NET-03']]){assert.equal(pairingFailure(error).code,code);assert.ok(!JSON.stringify(pairingFailure(error)).includes('SECRET'));}
const main=await readFile('apps/tv-player/src/main.tsx','utf8');assert.ok(main.indexOf('setPairing(p)')<main.indexOf('QRCode.toDataURL(p.verificationUri)'));assert.match(main,/pairBusyRef.current/);assert.match(main,/TV-QR-01/);
await build({entryPoints:['packages/tv-core/src/nativeRequest.ts'],bundle:true,platform:'browser',format:'iife',globalName:'TvNativeRequest',target:'chrome53',outfile:'dist/tv-pair-tests/native-browser.js'});
console.log('Pairing assertions passed: receiver, response bounds, trusted URL, sanitized diagnostics and QR-independent code.');
