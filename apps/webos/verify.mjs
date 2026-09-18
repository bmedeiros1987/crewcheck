import {parse} from 'acorn';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
for (const file of ['app.js','webOSTV.js']) {
  parse(await readFile(new URL('../../dist/webos/'+file,import.meta.url),'utf8'),{ecmaVersion:2016});
}
// Exercise the missing-AbortController path used by Chromium 53, not just modern Chrome.
const compiled=await build({entryPoints:[new URL('./compat.ts',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')],bundle:true,write:false,format:'iife',target:'chrome53'});
const sandbox={setTimeout,clearTimeout,console,fetch:()=>new Promise(()=>{}),Request,Response,Headers};
sandbox.self=sandbox; sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(compiled.outputFiles[0].text,sandbox);
assert.equal(typeof sandbox.AbortSignal.timeout,'function');
const result=vm.runInContext("fetch('https://example.invalid',{signal:AbortSignal.timeout(10)}).then(()=>false,e=>e.name==='AbortError')",sandbox);
assert.equal(await result,true);
console.log('PASS: packaged scripts parse as ES2016 and legacy fetch timeout rejects with AbortError');
