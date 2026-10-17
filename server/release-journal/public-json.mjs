// Bounded, unauthenticated GET; redirects/rate limits/pagination never imply proof.
import assert from 'node:assert/strict';
export async function publicJson(url,limit,{rejectPagination=false}={}){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000),headers:{accept:'application/json','x-github-api-version':'2022-11-28'}});
 assert.equal(response.status,200);assert.equal(response.url,url);if(rejectPagination)assert(!response.headers.get('link'));
 const declared=response.headers.get('content-length');if(declared!==null){assert(/^[0-9]+$/.test(declared));assert(Number(declared)<=limit);}
 assert(response.body);let size=0;const chunks=[];
 for await(const chunk of response.body){const bytes=Buffer.from(chunk);size+=bytes.length;assert(size<=limit);chunks.push(bytes);}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
