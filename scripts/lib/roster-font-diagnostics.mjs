import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const INTER_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap';
const CSS_LIMIT = 32 * 1024;
const EVENT_LIMIT = 128;
const COLLECTION_TIMEOUT_MS = 1000;

// Observe late rejection too, but never let late completion mutate evidence.
async function collectWithinDeadline(read) {
 let timer;
 const result=Promise.resolve().then(read).then(value=>({value}),()=>({unavailable:true}));
 try{return await Promise.race([result,new Promise(resolve=>{
  timer=setTimeout(()=>resolve({unavailable:true,timeout:true}),COLLECTION_TIMEOUT_MS);
 })]);}finally{clearTimeout(timer);}
}

// Never persist arbitrary external paths, queries, headers, cookies or page text.
export function describeFontRequest(value) {
 const url = new URL(value);
 if (url.href === INTER_CSS) return {category:'inter-css',url:INTER_CSS};
 if (url.protocol === 'https:' && url.hostname === 'fonts.gstatic.com' && /^\/s\/inter\/v\d+\/[A-Za-z0-9_.-]{1,512}$/.test(url.pathname)) {
  return {category:'inter-font',url:url.origin+url.pathname,queryRedacted:!!url.search};
 }
 return {category:'other-external',destinationRedacted:true};
}
function failureCode(value) {
 return String(value || '').match(/\bnet::ERR_[A-Z0-9_]+\b/)?.[0] || 'request-failed';
}
export function createFontDiagnostics(context, {output,width,theme,scale,browserVersion}) {
 const events=[], pending=new Set();let dropped=0;
 const add=event=>{if(events.length<EVENT_LIMIT)events.push(event);else dropped++;};
 const onFailed=request=>{
  const description=describeFontRequest(request.url());
  // Non-font failures carry only a category, never their error text or URL.
  add({kind:'requestfailed',...description,...(description.category==='other-external'?{}:{error:failureCode(request.failure()?.errorText)})});
 };
 const onResponse=response=>{
  const description=describeFontRequest(response.url());
  if(description.category==='other-external')return;
  const event={kind:'response',...description,status:response.status()};add(event);
  if(response.url()!==INTER_CSS)return;
  const task=(async()=>{try{
   const result=await collectWithinDeadline(()=>response.body());
   if(result.unavailable){event.css=result;return;}
   const body=result.value,captured=body.subarray(0,CSS_LIMIT);
   event.css={text:captured.toString('utf8'),capturedBytes:captured.length,totalBytes:body.length,truncated:body.length>CSS_LIMIT,sha256Captured:createHash('sha256').update(captured).digest('hex')};
  }catch{event.css={unavailable:true};}})();
  pending.add(task);void task.finally(()=>pending.delete(task));
 };
 context.on('requestfailed',onFailed);context.on('response',onResponse);
 return {
  route(value,allowed){add({kind:'route',...describeFontRequest(value),allowed});},
  async save(){
   context.off('requestfailed',onFailed);context.off('response',onResponse);
   await Promise.allSettled([...pending]);
   const fonts=[];
   for(const page of context.pages()) {
    try{const result=await collectWithinDeadline(()=>page.evaluate(()=>({faces:[...document.fonts].filter(face=>face.family.replace(/["']/g,'')==='Inter').map(face=>({family:'Inter',status:face.status,weight:face.weight}))})));fonts.push(result.unavailable?result:result.value);}
    catch{fonts.push({unavailable:true});}
   }
   await fs.mkdir(output,{recursive:true});
   await fs.writeFile(path.join(output,`font-diagnostics-${width}-${theme}-${scale}.json`),JSON.stringify({width,theme,scale,browserVersion,events,dropped,fonts},null,2));
  },
 };
}

// Persist partial evidence before closing a failed combination; retain its error.
export async function withFontDiagnostics(context,diagnostics,work) {
 let failed=false;
 try{return await work();}catch(error){failed=true;throw error;}
 finally{
  try{await diagnostics.save();}catch(error){if(!failed)throw error;console.error('Unable to persist font diagnostics');}
  finally{try{await context.close();}catch(error){if(!failed)throw error;console.error('Unable to close font diagnostic context');}}
 }
}
