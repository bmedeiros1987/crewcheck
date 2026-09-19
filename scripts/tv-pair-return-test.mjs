import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
const output = new URL('../.tv-pair-return-test.mjs', import.meta.url);
try {
  await build({ entryPoints:['client/src/lib/tvPairReturn.ts'], outfile:output.pathname, bundle:true, platform:'node', format:'esm' });
  const {tvPairLoginLocation:login,tvPairReturnLocation:back}=await import(output.href);
  const target=login('/tv-pair','?code=abcdef0123');
  assert.equal(back(target.slice(target.indexOf('?'))),'/tv-pair?code=ABCDEF0123');
  assert.equal(back(login('/tv-pair','').split('?')[1]),'/tv-pair');
  assert.equal(login('/results','?code=abcdef0123'),'/login');
  for(const target of ['https://evil.example','//evil.example','/tv-pair/','/tv-pair?code=x','/tv-pair?code=ABCDEF0123&token=secret','/tv-pair#evil','javascript:alert(1)','/tv-pair?code=ABCDEF0123%0aevil'])assert.equal(back('?returnTo='+encodeURIComponent(target)),'/');
  assert.equal(back('?returnTo=%2F%2Fevil.example'),'/');
  assert.equal(login('/tv-pair','?code=SECRET'),'/login?returnTo=%2Ftv-pair');
  console.log('PASS: TV approval code survives login; external redirects and malformed codes rejected.');
} finally {await unlink(output).catch(()=>{});}
