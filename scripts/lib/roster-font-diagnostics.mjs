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

// Failure log only: fixed fields and vocabulary, never URLs, CSS or arbitrary text.
const SUMMARY_EVENT_LIMIT=16, SUMMARY_FACE_LIMIT=8;
const SUMMARY_NETWORK_CODES=new Set(['net::ERR_FAILED','net::ERR_ABORTED',
 'net::ERR_CONNECTION_FAILED','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_CLOSED',
 'net::ERR_CONNECTION_REFUSED','net::ERR_CONNECTION_TIMED_OUT','net::ERR_TIMED_OUT',
 'net::ERR_NAME_NOT_RESOLVED','net::ERR_INTERNET_DISCONNECTED',
 'net::ERR_CERT_AUTHORITY_INVALID','net::ERR_HTTP2_PROTOCOL_ERROR',
 'net::ERR_BLOCKED_BY_CLIENT','net::ERR_ACCESS_DENIED']);
function failureSummary({events,dropped,fonts}) {
 const selected=events.slice(0,SUMMARY_EVENT_LIMIT).map(event=>({
  kind:['route','response','requestfailed'].includes(event.kind)?event.kind:'other',
  category:['inter-css','inter-font','other-external'].includes(event.category)?event.category:'other-external',
  ...(typeof event.allowed==='boolean'?{allowed:event.allowed}:{}),
  ...(Number.isInteger(event.status)&&event.status>=100&&event.status<=599?{status:event.status}:{}),
  ...(event.kind==='requestfailed'?{code:SUMMARY_NETWORK_CODES.has(event.error)?event.error:'other-network-error'}:{}),
 }));
 const fontFaces=[];let faceCount=0;
 const addFace=face=>{faceCount++;if(fontFaces.length<SUMMARY_FACE_LIMIT)fontFaces.push(face);};
 for(const page of fonts){
  if(page.unavailable){addFace({status:'unavailable',...(page.timeout===true?{timeout:true}:{})});continue;}
  for(const face of page.faces||[])if(face.family==='Inter')addFace({family:'Inter',
   status:['unloaded','loading','loaded','error'].includes(face.status)?face.status:'unknown'});
 }
 return {events:selected,omittedEvents:events.length-selected.length,droppedEvents:dropped,
  fontFaces,omittedFontFaces:faceCount-fontFaces.length};
}

// Never persist arbitrary external paths, queries, headers, cookies or page text.
export function describeFontRequest(value) {
 const url = new URL(value);
 if (url.href === INTER_CSS) return {category:'inter-css',url:INTER_CSS};
 if (url.origin === 'https://fonts.gstatic.com' && !url.username && !url.password && (/^\/s\/inter\/v\d+\/[A-Za-z0-9_.-]{1,512}$/.test(url.pathname) || url.pathname === '/l/font')) {
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
   const report={width,theme,scale,browserVersion,events,dropped,fonts};
   await fs.writeFile(path.join(output,`font-diagnostics-${width}-${theme}-${scale}.json`),JSON.stringify(report,null,2));
   return failureSummary(report);
  },
 };
}

// Persist partial evidence before closing a failed combination; retain its error.
export async function withFontDiagnostics(context,diagnostics,work) {
 let failed=false;
 try{return await work();}catch(error){failed=true;throw error;}
 finally{
  try{const summary=await diagnostics.save();if(failed&&summary)console.error('[roster-font-diagnostics]',JSON.stringify(summary));}catch(error){if(!failed)throw error;console.error('Unable to persist font diagnostics');}
  finally{try{await context.close();}catch(error){if(!failed)throw error;console.error('Unable to close font diagnostic context');}}
 }
}
