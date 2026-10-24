import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
/** Actual admission module + actual auth dependency. Legacy AST fixtures have no
 * authenticated getMe producer: null storage and no window deliberately leave
 * the genuine capability unavailable. Never replace admission with a no-op mint. */
export async function loadRadarReadAdmission(root=process.cwd()) {
 const output=await build({entryPoints:[path.resolve(root,'client/src/lib/operationalRadarAdmission.ts')],bundle:true,format:'cjs',platform:'node',write:false,logLevel:'silent',alias:{'@':path.resolve(root,'client/src'),'@shared':path.resolve(root,'shared')}});
 const module={exports:{}};
 vm.runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,localStorage:{getItem:()=>null},Date,performance},{filename:'actual-radar-read-admission.cjs',timeout:5000});
 const actual=module.exports;
 assert.equal(actual.beginOperationalRadarRead(),null,'no window/storage/getMe cannot admit a read');
 assert.equal(actual.readOperationalRadarAdmission({},'fixture','fixture'),null,'unminted object cannot admit');
 return actual;
}
