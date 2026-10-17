// Generic app KV helpers must never read/modify independent release authorization.
import assert from 'node:assert/strict';
export function assertNotProtectedReleaseKey(key){
 assert(typeof key==='string');
 // Conservative across case/accent/format variants and the existing CI collation.
 const folded=key.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
 assert(!folded.startsWith('playrelease'),'Release state is outside generic KV scope');
}
